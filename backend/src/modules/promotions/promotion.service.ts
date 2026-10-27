import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { bookings, promotions, type Booking, type Promotion } from "../../db/schema.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import type { Actor, BookingService } from "../bookings/booking.service.js";

/** Card networks charge a minimum, so a discount always leaves at least this much to pay. */
export const MIN_CHARGE_AED = 2;

const PAID = ["paid", "partially_refunded", "refunded"] as const;

export interface PromotionInput {
  name: string;
  code?: string | null | undefined;
  kind: "percent" | "fixed";
  value: number;
  autoApply: boolean;
  firstBookingOnly: boolean;
  minOrderAed?: number | null | undefined;
  maxDiscountAed?: number | null | undefined;
  serviceKeys?: string[] | null | undefined;
  startsAt?: Date | null | undefined;
  endsAt?: Date | null | undefined;
  usageLimit?: number | null | undefined;
  active: boolean;
}

export class PromotionService {
  constructor(
    private readonly db: Database,
    private readonly bookingsSvc: BookingService,
  ) {}

  // ------------------------------------------------------------ admin

  async list() {
    const rows = await this.db.select().from(promotions).orderBy(desc(promotions.active), desc(promotions.createdAt));
    return rows.map(view);
  }

  async create(input: PromotionInput) {
    validate(input);
    try {
      const [row] = await this.db.insert(promotions).values(normalise(input)).returning();
      return view(row!);
    } catch (err) {
      throw duplicateCode(err);
    }
  }

  async update(id: string, patch: Partial<PromotionInput>) {
    const [current] = await this.db.select().from(promotions).where(eq(promotions.id, id)).limit(1);
    if (!current) throw notFound("Promotion");
    const merged: PromotionInput = { ...current, ...patch };
    validate(merged);
    try {
      const [row] = await this.db
        .update(promotions)
        .set({ ...normalise(merged), updatedAt: new Date() })
        .where(eq(promotions.id, id))
        .returning();
      return view(row!);
    } catch (err) {
      throw duplicateCode(err);
    }
  }

  // ------------------------------------------------------------ customer

  /** Applies a promo code to an unpaid booking. The best discount the booking qualifies for wins. */
  async applyCode(bookingId: string, customer: Actor, code: string) {
    const booking = await this.bookingsSvc.loadFor(bookingId, customer);
    if (booking.customerId !== customer.id) throw notFound("Booking");
    this.assertOpen(booking);
    const normalised = code.trim().toUpperCase();
    const [promo] = await this.db.select().from(promotions).where(eq(promotions.code, normalised)).limit(1);
    if (!promo) throw badRequest("invalid_code", "This code is not valid");
    const why = await this.ineligible(promo, booking);
    if (why) throw badRequest("code_not_applicable", why);
    await this.db.update(bookings).set({ promoCode: normalised, updatedAt: new Date() }).where(eq(bookings.id, booking.id));
    const refreshed = await this.refresh(booking.id);
    const better = refreshed.promotionId !== promo.id;
    return { ...(await this.bookingsSvc.get(booking.id, customer)), promoMessage: better ? "You already have a better discount on this booking" : `${promo.name} applied` };
  }

  async removeCode(bookingId: string, customer: Actor) {
    const booking = await this.bookingsSvc.loadFor(bookingId, customer);
    if (booking.customerId !== customer.id) throw notFound("Booking");
    this.assertOpen(booking);
    await this.db.update(bookings).set({ promoCode: null, updatedAt: new Date() }).where(eq(bookings.id, booking.id));
    await this.refresh(booking.id);
    return this.bookingsSvc.get(booking.id, customer);
  }

  // ------------------------------------------------------------ pricing

  /**
   * Works out the best discount for an unpaid booking and stores it. Called whenever the price
   * is set and again just before payment, so expired or used-up promotions drop off.
   */
  async refresh(bookingId: string): Promise<Booking> {
    const [booking] = await this.db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking) throw notFound("Booking");
    if (booking.paymentStatus !== "unpaid" && booking.paymentStatus !== "pending") return booking;

    let best: { promo: Promotion; discount: number } | null = null;
    if (booking.priceAed != null && booking.priceAed > MIN_CHARGE_AED) {
      const candidates = await this.db
        .select()
        .from(promotions)
        .where(
          and(
            eq(promotions.active, true),
            booking.promoCode ? sql`(${promotions.autoApply} or ${promotions.code} = ${booking.promoCode})` : eq(promotions.autoApply, true),
          ),
        );
      for (const promo of candidates) {
        if (await this.ineligible(promo, booking)) continue;
        const discount = discountFor(promo, booking.priceAed);
        if (discount > 0 && (!best || discount > best.discount)) best = { promo, discount };
      }
    }
    const discountAed = best?.discount ?? 0;
    const promotionId = best?.promo.id ?? null;
    if (discountAed === booking.discountAed && promotionId === booking.promotionId) return booking;
    const [updated] = await this.db
      .update(bookings)
      .set({ discountAed, promotionId, updatedAt: new Date() })
      .where(and(eq(bookings.id, booking.id), inArray(bookings.paymentStatus, ["unpaid", "pending"])))
      .returning();
    return updated ?? booking;
  }

  /** Counts a use once the booking is paid. */
  async onBookingPaid(bookingId: string) {
    const [booking] = await this.db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking?.promotionId || booking.discountAed <= 0) return;
    await this.db
      .update(promotions)
      .set({ usedCount: sql`${promotions.usedCount} + 1` })
      .where(eq(promotions.id, booking.promotionId));
  }

  /** Why a promotion does not apply to this booking, or null when it does. */
  private async ineligible(promo: Promotion, booking: Booking): Promise<string | null> {
    const now = Date.now();
    if (!promo.active) return "This offer has ended";
    if (promo.startsAt && promo.startsAt.getTime() > now) return "This offer has not started yet";
    if (promo.endsAt && promo.endsAt.getTime() <= now) return "This offer has ended";
    // A booking already carrying this promotion keeps its place within the limit.
    if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit && booking.promotionId !== promo.id) return "This offer has been fully used";
    if (promo.serviceKeys?.length && !promo.serviceKeys.includes(booking.serviceKey)) return "This code does not apply to this service";
    if (booking.priceAed == null) return "Codes can be used once your price is ready";
    if (promo.minOrderAed != null && booking.priceAed < promo.minOrderAed) return `This code needs an order of AED ${promo.minOrderAed} or more`;
    if (promo.firstBookingOnly) {
      const [prior] = await this.db
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.customerId, booking.customerId), ne(bookings.id, booking.id), inArray(bookings.paymentStatus, [...PAID])))
        .limit(1);
      if (prior) return "This offer is for your first booking";
    }
    return null;
  }

  private assertOpen(booking: Booking) {
    if (booking.status === "cancelled") throw conflict("not_payable", "This booking is closed");
    if (booking.paymentStatus !== "unpaid" && booking.paymentStatus !== "pending") throw conflict("already_paid", "This booking is already paid");
  }
}

export function discountFor(promo: Pick<Promotion, "kind" | "value" | "maxDiscountAed">, priceAed: number) {
  let d = promo.kind === "percent" ? Math.floor((priceAed * promo.value) / 100) : promo.value;
  if (promo.maxDiscountAed != null) d = Math.min(d, promo.maxDiscountAed);
  return Math.max(0, Math.min(d, priceAed - MIN_CHARGE_AED));
}

function validate(p: PromotionInput) {
  if (!p.autoApply && !p.code) throw badRequest("code_required", "Give the promotion a code, or make it apply automatically");
  if (p.kind === "percent" && (p.value < 1 || p.value > 100)) throw badRequest("invalid_value", "A percentage must be between 1 and 100");
  if (p.kind === "fixed" && p.value < 1) throw badRequest("invalid_value", "The discount must be at least AED 1");
  if (p.startsAt && p.endsAt && p.endsAt <= p.startsAt) throw badRequest("invalid_dates", "The end date must be after the start date");
}

function normalise(p: PromotionInput) {
  return {
    name: p.name.trim(),
    code: p.code?.trim() ? p.code.trim().toUpperCase() : null,
    kind: p.kind,
    value: p.value,
    autoApply: p.autoApply,
    firstBookingOnly: p.firstBookingOnly,
    minOrderAed: p.minOrderAed ?? null,
    maxDiscountAed: p.maxDiscountAed ?? null,
    serviceKeys: p.serviceKeys?.length ? p.serviceKeys : null,
    startsAt: p.startsAt ? new Date(p.startsAt) : null,
    endsAt: p.endsAt ? new Date(p.endsAt) : null,
    usageLimit: p.usageLimit ?? null,
    active: p.active,
  };
}

function duplicateCode(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505" ? conflict("code_taken", "Another promotion already uses this code") : err;
}

function view(p: Promotion) {
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    kind: p.kind,
    value: p.value,
    autoApply: p.autoApply,
    firstBookingOnly: p.firstBookingOnly,
    minOrderAed: p.minOrderAed,
    maxDiscountAed: p.maxDiscountAed,
    serviceKeys: p.serviceKeys,
    startsAt: p.startsAt?.toISOString() ?? null,
    endsAt: p.endsAt?.toISOString() ?? null,
    usageLimit: p.usageLimit,
    usedCount: p.usedCount,
    active: p.active,
    createdAt: p.createdAt.toISOString(),
  };
}
