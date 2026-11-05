import { asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { bookingMessages, staffProfiles, users } from "../../db/schema.js";
import { COMPANY } from "../../config/company.js";
import { redactContacts } from "../../lib/contact-filter.js";
import { badRequest, conflict, forbidden } from "../../lib/errors.js";
import { seal, unseal } from "../../lib/sealed.js";
import type { CallBridge } from "../calls/masked-call.js";
import type { NotificationService } from "../notifications/notification.service.js";
import { rooms, type RealtimeHub } from "../tracking/realtime.js";
import type { Actor, BookingService } from "./booking.service.js";

/** Statuses during which the customer and the team can call each other. */
const CALLABLE = ["assigned", "en_route", "arrived", "in_progress"] as const;
/** Chat stays open this long after the job is completed (e.g. a forgotten item). */
const CHAT_AFTER_COMPLETION_MS = 3 * 24 * 3600_000;

export const CONTACT_NOTICE = "Phone numbers, emails and messaging links can't be shared in chat. Use the Call button: it keeps both numbers private.";

/**
 * How customers and the team reach each other about a booking without exchanging numbers:
 * a job chat with contact details removed, and masked calls through Xtreme's number.
 * Third-party suppliers never see a customer's phone; Xtreme's own staff keep it for now.
 */
export class BookingContactService {
  constructor(
    private readonly db: Database,
    private readonly bookings: BookingService,
    private readonly notifications: NotificationService,
    private readonly hub: RealtimeHub,
    private readonly bridge: CallBridge,
  ) {}

  async isSupplier(userId: string) {
    const [row] = await this.db.select({ s: staffProfiles.isSupplier }).from(staffProfiles).where(eq(staffProfiles.userId, userId)).limit(1);
    return row?.s ?? false;
  }

  // ------------------------------------------------------------ chat

  async messages(bookingId: string, actor: Actor) {
    const booking = await this.bookings.loadFor(bookingId, actor);
    const rows = await this.db.select().from(bookingMessages).where(eq(bookingMessages.bookingId, bookingId)).orderBy(asc(bookingMessages.createdAt));
    const names = await this.names(rows.map((r) => r.senderId).filter((x): x is string => !!x));
    return {
      open: this.chatOpen(booking),
      notice: CONTACT_NOTICE,
      messages: rows.map((r) => this.view(r, actor, names)),
    };
  }

  async send(bookingId: string, actor: Actor, raw: string) {
    const booking = await this.bookings.loadFor(bookingId, actor);
    if (!this.chatOpen(booking)) throw conflict("chat_closed", "Chat for this booking is closed. Please contact us if you need help.");
    const text = raw.trim();
    if (!text) throw badRequest("empty_message", "Write a message first");
    const team = await this.bookings.team(bookingId);
    if (actor.role === "customer" && team.length === 0) throw conflict("no_team_yet", "You can chat with your team once they are assigned. Until then, use “Chat with us”.");
    const { text: body, redacted } = redactContacts(text);
    const sender = actor.role === "customer" ? "customer" : actor.role === "staff" ? "staff" : "admin";
    const [row] = await this.db.insert(bookingMessages).values({ bookingId, senderId: actor.id, sender, body: seal(body), redacted }).returning();
    const names = await this.names([actor.id]);
    const view = this.view({ ...row!, body: seal(body) }, actor, names);

    // Tell the other side (push + in-app), and update open chat screens live.
    const preview = body.length > 90 ? `${body.slice(0, 87)}…` : body;
    if (actor.role === "customer") {
      void this.notifications.notify(
        team.map((m) => m.userId),
        { title: `Message about ${booking.reference}`, body: preview, data: { type: "job_chat", bookingId } },
      );
    } else {
      const from = actor.role === "staff" ? (team.find((m) => m.userId === actor.id)?.displayName ?? "Your team") : "Xtreme team";
      void this.notifications.notify([booking.customerId], { title: `${from} sent a message`, body: preview, data: { type: "job_chat", bookingId } });
    }
    this.hub.emit(rooms.booking(bookingId), "booking:message", { bookingId, id: view.id });
    this.hub.emit(rooms.admins, "booking:message", { bookingId, id: view.id });
    return { message: view, redacted, ...(redacted ? { notice: CONTACT_NOTICE } : {}) };
  }

  private chatOpen(b: { status: string; completedAt: Date | null }) {
    if (b.status === "cancelled") return false;
    if (b.status === "completed") return !!b.completedAt && Date.now() - b.completedAt.getTime() < CHAT_AFTER_COMPLETION_MS;
    return true;
  }

  private async names(ids: string[]) {
    const unique = [...new Set(ids)];
    const map = new Map<string, string>();
    if (!unique.length) return map;
    const staff = await this.db.select({ id: staffProfiles.userId, name: staffProfiles.displayName }).from(staffProfiles).where(inArray(staffProfiles.userId, unique));
    for (const s of staff) map.set(s.id, s.name);
    const people = await this.db.select({ id: users.id, name: users.fullName, role: users.role }).from(users).where(inArray(users.id, unique));
    for (const p of people) if (!map.has(p.id)) map.set(p.id, p.role === "admin" ? "Xtreme team" : (p.name?.split(" ")[0] ?? "Customer"));
    return map;
  }

  private view(r: typeof bookingMessages.$inferSelect, actor: Actor, names: Map<string, string>) {
    return {
      id: r.id,
      sender: r.sender,
      senderName: r.sender === "admin" ? "Xtreme team" : (r.senderId && names.get(r.senderId)) || (r.sender === "customer" ? "Customer" : "Team"),
      mine: r.senderId === actor.id,
      body: unseal(r.body),
      redacted: r.redacted,
      createdAt: r.createdAt.toISOString(),
    };
  }

  // ------------------------------------------------------------ masked calls

  /**
   * Connects the customer and the team lead by phone. With a Twilio voice number, Twilio rings
   * the caller and connects them, both seeing only Xtreme's number. Without one, the app calls
   * the office, which connects them.
   */
  async call(bookingId: string, actor: Actor): Promise<{ mode: "bridge"; message: string } | { mode: "office"; phone: string; message: string }> {
    const booking = await this.bookings.loadFor(bookingId, actor);
    if (actor.role === "admin") throw forbidden("Call the customer from the dashboard", "not_allowed");
    if (!(CALLABLE as readonly string[]).includes(booking.status)) throw conflict("not_callable", "Calls open once a team is assigned and close when the job is done");
    const team = await this.bookings.team(bookingId);
    const lead = team.find((m) => m.isLead) ?? team[0];
    const office = { mode: "office" as const, phone: COMPANY.phone, message: "We'll connect you through the Xtreme office." };
    if (!this.bridge.enabled || !lead) return office;

    const otherId = actor.role === "customer" ? lead.userId : booking.customerId;
    const phones = await this.db.select({ id: users.id, phone: users.phone }).from(users).where(inArray(users.id, [actor.id, otherId]));
    const mine = phones.find((p) => p.id === actor.id)?.phone;
    const theirs = phones.find((p) => p.id === otherId)?.phone;
    if (!mine || !theirs) return office;
    const intro = actor.role === "customer" ? `Connecting you to your Xtreme team for booking ${booking.reference}.` : `Connecting you to the customer for booking ${booking.reference}.`;
    try {
      await this.bridge.connect(mine, theirs, intro);
    } catch {
      return office;
    }
    return { mode: "bridge", message: "We're calling you now. Answer to be connected. Both numbers stay private." };
  }
}

