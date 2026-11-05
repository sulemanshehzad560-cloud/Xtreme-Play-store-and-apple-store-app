import { createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { bookingPhotos } from "../../db/schema.js";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";
import { seal, unseal } from "../../lib/sealed.js";
import { serviceName } from "../catalog/catalog.js";
import type { NotificationService } from "../notifications/notification.service.js";
import { rooms, type RealtimeHub } from "../tracking/realtime.js";
import type { Actor, BookingService } from "./booking.service.js";
import { TERMINAL } from "./state.js";

/** A quote request needs at least this many photos before the office is told it is ready. */
export const MIN_QUOTE_PHOTOS = 3;
export const MAX_QUOTE_PHOTOS = 5;
const MAX_BYTES = 2_000_000;

export function sniffImage(b: Buffer): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

/**
 * Photos a customer sends so the office can quote a "price on inspection" job (sofa, mattress,
 * carpet…) from the dashboard. Served by signed links so the dashboard and app can show them
 * in <img>/<Image> without a sign-in header, while the links cannot be guessed.
 */
export class BookingPhotoService {
  constructor(
    private readonly db: Database,
    private readonly bookings: BookingService,
    private readonly notifications: NotificationService,
    private readonly hub: RealtimeHub,
    private readonly opts: { publicUrl: string; secret: string },
  ) {}

  signature(photoId: string) {
    return createHmac("sha256", this.opts.secret).update(`booking-photo:${photoId}`).digest("hex").slice(0, 32);
  }

  private url(photoId: string) {
    return `${this.opts.publicUrl}/v1/booking-photos/${photoId}/${this.signature(photoId)}`;
  }

  async list(bookingId: string, actor: Actor) {
    await this.bookings.loadFor(bookingId, actor);
    const rows = await this.db
      .select({ id: bookingPhotos.id, createdAt: bookingPhotos.createdAt })
      .from(bookingPhotos)
      .where(eq(bookingPhotos.bookingId, bookingId))
      .orderBy(asc(bookingPhotos.createdAt));
    return rows.map((r) => ({ id: r.id, url: this.url(r.id), createdAt: r.createdAt }));
  }

  /** The customer adds a photo (the app sends a resized JPEG). The office hears once the set is complete. */
  async add(bookingId: string, actor: Actor, base64: string) {
    if (actor.role !== "customer") throw forbidden("Only the customer can add quote photos", "not_customer");
    const booking = await this.bookings.loadFor(bookingId, actor);
    if (booking.pricing !== "inspection") throw conflict("not_quote", "Photos are only needed for jobs priced on inspection");
    if (TERMINAL.includes(booking.status)) throw conflict("not_editable", "This booking is closed");
    if (booking.paymentStatus !== "unpaid") throw conflict("already_paid", "This booking is already paid");
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length < 1000 || bytes.length > MAX_BYTES) throw badRequest("invalid_image", "Please choose a photo under 2 MB");
    const contentType = sniffImage(bytes);
    if (!contentType) throw badRequest("invalid_image", "Please choose a JPEG, PNG or WebP photo");

    const count = await this.db.transaction(async (tx) => {
      // Serialise uploads for this booking so the 5-photo limit holds under parallel requests.
      await tx.execute(sqlLock(bookingId));
      const existing = await tx.select({ id: bookingPhotos.id }).from(bookingPhotos).where(eq(bookingPhotos.bookingId, bookingId));
      if (existing.length >= MAX_QUOTE_PHOTOS) throw conflict("too_many_photos", `You can send up to ${MAX_QUOTE_PHOTOS} photos`);
      await tx.insert(bookingPhotos).values({ bookingId, contentType, data: seal(base64) });
      return existing.length + 1;
    });

    if (count === MIN_QUOTE_PHOTOS) {
      void this.notifications.notifyAdmins({
        title: `Photos ready to quote: ${booking.reference}`,
        body: `${serviceName(booking.serviceKey)} · ${booking.address.area}. Review the photos and send the price.`,
        data: { type: "booking", bookingId },
      });
    }
    this.hub.emit(rooms.admins, "booking:updated", { bookingId });
    return this.list(bookingId, actor);
  }

  /** The customer removes a photo they sent, until the job is priced. */
  async remove(bookingId: string, photoId: string, actor: Actor) {
    if (actor.role !== "customer" && actor.role !== "admin") throw forbidden("Not allowed", "forbidden");
    const booking = await this.bookings.loadFor(bookingId, actor);
    if (actor.role === "customer" && booking.priceAed != null) throw conflict("already_quoted", "Your quote is ready, so the photos can no longer be changed");
    const gone = await this.db
      .delete(bookingPhotos)
      .where(and(eq(bookingPhotos.id, photoId), eq(bookingPhotos.bookingId, bookingId)))
      .returning({ id: bookingPhotos.id });
    if (!gone.length) throw notFound("Photo");
    return this.list(bookingId, actor);
  }

  /** Serves a photo for a signed link. */
  async bySignedLink(photoId: string, sig: string) {
    const expected = Buffer.from(this.signature(photoId));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw notFound("Photo");
    const [row] = await this.db.select().from(bookingPhotos).where(eq(bookingPhotos.id, photoId)).limit(1);
    if (!row) throw notFound("Photo");
    return { contentType: row.contentType, bytes: Buffer.from(unseal(row.data), "base64") };
  }

  /** How many photos each booking has (for the booking views). */
  async counts(bookingIds: string[]) {
    const map = new Map<string, number>();
    if (!bookingIds.length) return map;
    const rows = await this.db
      .select({ bookingId: bookingPhotos.bookingId })
      .from(bookingPhotos)
      .where(inArray(bookingPhotos.bookingId, bookingIds));
    for (const r of rows) map.set(r.bookingId, (map.get(r.bookingId) ?? 0) + 1);
    return map;
  }
}

const sqlLock = (bookingId: string) => sql`select pg_advisory_xact_lock(hashtext(${"booking-photos:" + bookingId}))`;
