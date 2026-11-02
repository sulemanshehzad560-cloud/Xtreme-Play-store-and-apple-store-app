import { randomInt } from "node:crypto";
import { and, count, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { bookings, promotions, referrals, users, type Booking, type Promotion } from "../../db/schema.js";
import { pricing } from "../catalog/pricing.js";
import type { NotificationService } from "../notifications/notification.service.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import type { Actor, BookingService } from "../bookings/booking.service.js";

/** Name of the personal promotion that holds a customer's wallet balance. */
const WALLET = "Wallet credit";

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
  notifyCustomers?: boolean | undefined;
  message?: string | null | undefined;
  messageAr?: string | null | undefined;
}

export class PromotionService {
  constructor(
    private readonly db: Database,
    private readonly bookingsSvc: BookingService,
    private readonly notifications?: NotificationService,
  ) {}

  // ------------------------------------------------------------ admin

  async list() {
    // Personal rewards (refer a friend) are not office-managed promotions.
    const rows = await this.db.select().from(promotions).where(isNull(promotions.ownerId)).orderBy(desc(promotions.active), desc(promotions.createdAt));
    return rows.map(view);
  }

  async create(input: PromotionInput) {
    validate(input);
    try {
      const [row] = await this.db.insert(promotions).values(normalise(input)).returning();
      this.announceSoon();
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
      this.announceSoon();
      return view(row!);
    } catch (err) {
      throw duplicateCode(err);
    }
  }

  // ------------------------------------------------------------ announcements

  private announcing: Promise<number> | null = null;

  /** Runs announceDue in the background (after a save, or from the scheduler). */
  announceSoon() {
    void this.announceDue().catch(() => undefined);
  }

  /**
   * Tells customers about every live offer that hasn't been announced yet, including
   * scheduled seasonal offers once their start time arrives. Each offer is announced once.
   */
  async announceDue(): Promise<number> {
    if (this.announcing) return this.announcing;
    this.announcing = (async () => {
      const now = new Date();
      const due = await this.db
        .select()
        .from(promotions)
        .where(
          and(
            isNull(promotions.ownerId),
            eq(promotions.active, true),
            eq(promotions.notifyCustomers, true),
            isNull(promotions.announcedAt),
            or(isNull(promotions.startsAt), lte(promotions.startsAt, now)),
            or(isNull(promotions.endsAt), gt(promotions.endsAt, now)),
          ),
        );
      let sent = 0;
      for (const promo of due) {
        // Claim it first so two servers never send the same offer twice.
        const [claimed] = await this.db
          .update(promotions)
          .set({ announcedAt: now })
          .where(and(eq(promotions.id, promo.id), isNull(promotions.announcedAt)))
          .returning();
        if (claimed) sent += await this.broadcast(claimed);
      }
      return sent;
    })().finally(() => {
      this.announcing = null;
    });
    return this.announcing;
  }

  /** Sends the offer again (dashboard button). Returns how many customers were told. */
  async announce(id: string): Promise<number> {
    const [promo] = await this.db.select().from(promotions).where(and(eq(promotions.id, id), isNull(promotions.ownerId))).limit(1);
    if (!promo) throw notFound("Promotion");
    if (!promo.active || (promo.endsAt && promo.endsAt <= new Date())) throw badRequest("promotion_not_live", "Only a live promotion can be announced");
    await this.db.update(promotions).set({ announcedAt: new Date() }).where(eq(promotions.id, id));
    return this.broadcast(promo);
  }

  private async broadcast(promo: Promotion): Promise<number> {
    if (!this.notifications) return 0;
    let audience = await this.db
      .select({ id: users.id, locale: users.locale, optIn: users.marketingOptIn })
      .from(users)
      .where(and(eq(users.role, "customer"), isNull(users.deletedAt), isNull(users.blockedAt)));
    if (promo.firstBookingOnly) {
      // A first-booking offer is only news to people who haven't paid for a booking yet.
      const booked = await this.db
        .selectDistinct({ id: bookings.customerId })
        .from(bookings)
        .where(inArray(bookings.paymentStatus, [...PAID]));
      const has = new Set(booked.map((b) => b.id));
      audience = audience.filter((u) => !has.has(u.id));
    }
    const optedIn = audience.filter((u) => u.optIn).map((u) => u.id);
    const data = { type: "offer", promotionId: promo.id, code: promo.code };
    for (const lang of ["en", "ar"] as const) {
      const ids = audience.filter((u) => (u.locale === "ar" ? "ar" : "en") === lang).map((u) => u.id);
      if (!ids.length) continue;
      await this.notifications.notify(ids, { ...offerText(promo, lang), data }, { pushTo: optedIn });
    }
    return audience.length;
  }

  // ------------------------------------------------------------ customer

  /** Applies a promo code to an unpaid booking. The best discount the booking qualifies for wins. */
  async applyCode(bookingId: string, customer: Actor, code: string) {
    const booking = await this.bookingsSvc.loadFor(bookingId, customer);
    if (booking.customerId !== customer.id) throw notFound("Booking");
    this.assertOpen(booking);
    const normalised = code.trim().toUpperCase();
    const [promo] = await this.db.select().from(promotions).where(eq(promotions.code, normalised)).limit(1);
    if (!promo) {
      // A friend's invite code (refer a friend).
      const referrer = await this.referrerFor(normalised);
      if (!referrer) throw badRequest("invalid_code", "This code is not valid");
      const why = await this.referralIneligible(referrer.id, booking);
      if (why) throw badRequest("code_not_applicable", why);
      await this.db.update(bookings).set({ promoCode: normalised, updatedAt: new Date() }).where(eq(bookings.id, booking.id));
      const refreshed = await this.refresh(booking.id);
      const better = refreshed.promotionId != null;
      return {
        ...(await this.bookingsSvc.get(booking.id, customer)),
        promoMessage: better ? "You already have a better discount on this booking" : `${referrer.firstName}'s invite applied`,
      };
    }
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

    let best: { promo: Promotion | null; discount: number } | null = null;
    if (booking.priceAed != null && booking.priceAed > MIN_CHARGE_AED) {
      const candidates = await this.db
        .select()
        .from(promotions)
        .where(
          and(
            eq(promotions.active, true),
            or(isNull(promotions.ownerId), eq(promotions.ownerId, booking.customerId)),
            booking.promoCode ? sql`(${promotions.autoApply} or ${promotions.code} = ${booking.promoCode})` : eq(promotions.autoApply, true),
          ),
        );
      for (const promo of candidates) {
        if (await this.ineligible(promo, booking)) continue;
        const discount = discountFor(promo, booking.priceAed);
        if (discount > 0 && (!best || discount > best.discount)) best = { promo, discount };
      }
      // A friend's invite code competes like any other discount.
      const friendAed = pricing().referral.friendAed;
      if (booking.promoCode && friendAed > 0) {
        const referrer = await this.referrerFor(booking.promoCode);
        if (referrer && !(await this.referralIneligible(referrer.id, booking))) {
          const discount = discountFor({ kind: "fixed", value: friendAed, maxDiscountAed: null }, booking.priceAed);
          if (discount > 0 && (!best || discount > best.discount)) best = { promo: null, discount };
        }
      }
    }
    const discountAed = best?.discount ?? 0;
    const promotionId = best?.promo?.id ?? null;
    if (discountAed === booking.discountAed && promotionId === booking.promotionId) return booking;
    const [updated] = await this.db
      .update(bookings)
      .set({ discountAed, promotionId, updatedAt: new Date() })
      .where(and(eq(bookings.id, booking.id), inArray(bookings.paymentStatus, ["unpaid", "pending"])))
      .returning();
    return updated ?? booking;
  }

  /**
   * Refer a friend: the inviter's wallet credit is added once the friend's first booking has
   * actually happened (completed), so a booking that is cancelled and refunded earns nothing.
   * A cancelled booking that had used wallet credit gets that credit back.
   */
  async onBookingStatus(booking: Booking) {
    if (booking.status === "completed" && !booking.promotionId && booking.discountAed > 0 && booking.promoCode && PAID.includes(booking.paymentStatus as (typeof PAID)[number])) {
      await this.rewardReferrer(booking);
    }
    if (booking.status === "cancelled" && booking.promotionId && booking.discountAed > 0 && PAID.includes(booking.paymentStatus as (typeof PAID)[number])) {
      const [promo] = await this.db.select().from(promotions).where(eq(promotions.id, booking.promotionId)).limit(1);
      if (promo?.ownerId) await this.addToWallet(promo.ownerId, booking.discountAed);
    }
  }

  /** Counts a use once the booking is paid. */
  async onBookingPaid(bookingId: string) {
    const [booking] = await this.db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking?.promotionId || booking.discountAed <= 0) return;
    const [promo] = await this.db.select().from(promotions).where(eq(promotions.id, booking.promotionId)).limit(1);
    if (promo?.ownerId) {
      // Wallet credit: spend what this booking used and keep the rest for later.
      await this.db
        .update(promotions)
        .set({ value: sql`greatest(${promotions.value} - ${booking.discountAed}, 0)`, active: sql`${promotions.value} - ${booking.discountAed} > 0`, updatedAt: new Date() })
        .where(eq(promotions.id, promo.id));
      return;
    }
    await this.db
      .update(promotions)
      .set({ usedCount: sql`${promotions.usedCount} + 1` })
      .where(eq(promotions.id, booking.promotionId));
  }

  /** Why a promotion does not apply to this booking, or null when it does. */
  private async ineligible(promo: Promotion, booking: Booking): Promise<string | null> {
    const now = Date.now();
    if (!promo.active) return "This offer has ended";
    if (promo.ownerId && promo.ownerId !== booking.customerId) return "This code belongs to another account";
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

  // ------------------------------------------------------------ refer a friend

  /** The customer's invite code (created on first use), what friends get, and rewards earned. */
  async myReferral(userId: string) {
    const code = await this.ensureReferralCode(userId);
    const [{ invited }] = (await this.db.select({ invited: count() }).from(referrals).where(eq(referrals.referrerId, userId))) as [{ invited: number }];
    const credits = await this.db
      .select({ value: promotions.value })
      .from(promotions)
      .where(and(eq(promotions.ownerId, userId), eq(promotions.active, true)));
    const { friendAed, rewardAed } = pricing().referral;
    return {
      code,
      enabled: friendAed > 0 || rewardAed > 0,
      friendAed,
      rewardAed,
      invited,
      walletAed: credits.reduce((n, c) => n + c.value, 0),
    };
  }

  private async ensureReferralCode(userId: string): Promise<string> {
    const [user] = await this.db.select({ code: users.referralCode, name: users.fullName }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw notFound("Account");
    if (user.code) return user.code;
    const stem = (user.name ?? "").split(/\s+/)[0]!.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) || "XTREME";
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let i = 0; i < 6; i++) {
      const code = stem + Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
      const taken = await this.db.select({ id: promotions.id }).from(promotions).where(eq(promotions.code, code)).limit(1);
      if (taken.length) continue;
      const [set] = await this.db
        .update(users)
        .set({ referralCode: code })
        .where(and(eq(users.id, userId), isNull(users.referralCode)))
        .returning({ code: users.referralCode })
        .catch(() => []);
      if (set?.code) return set.code;
      const [again] = await this.db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId)).limit(1);
      if (again?.code) return again.code;
    }
    throw conflict("code_unavailable", "Could not create an invite code. Please try again.");
  }

  private async referrerFor(code: string) {
    const [u] = await this.db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(and(eq(users.referralCode, code.trim().toUpperCase()), isNull(users.deletedAt)))
      .limit(1);
    return u ? { id: u.id, firstName: (u.fullName ?? "Your friend").split(/\s+/)[0]! } : null;
  }

  /** Invite codes are for a new customer's first paid booking, from someone else. */
  private async referralIneligible(referrerId: string, booking: Booking): Promise<string | null> {
    if (pricing().referral.friendAed <= 0) return "Invite codes are not active right now";
    if (referrerId === booking.customerId) return "You can't use your own invite code. Share it with friends!";
    if (booking.priceAed == null) return "Codes can be used once your price is ready";
    const [prior] = await this.db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.customerId, booking.customerId), ne(bookings.id, booking.id), inArray(bookings.paymentStatus, [...PAID])))
      .limit(1);
    if (prior) return "Invite codes are for your first booking";
    const [already] = await this.db.select({ id: referrals.id }).from(referrals).where(eq(referrals.refereeId, booking.customerId)).limit(1);
    if (already) return "You have already used an invite";
    return null;
  }

  /** After a referred friend's first payment: record it and give the inviter a personal credit. */
  private async rewardReferrer(booking: Booking) {
    const referrer = await this.referrerFor(booking.promoCode!);
    if (!referrer || referrer.id === booking.customerId) return;
    const [row] = await this.db
      .insert(referrals)
      .values({ referrerId: referrer.id, refereeId: booking.customerId, bookingId: booking.id })
      .onConflictDoNothing()
      .returning();
    if (!row) return;
    const rewardAed = pricing().referral.rewardAed;
    if (rewardAed <= 0) return;
    const [friend] = await this.db.select({ name: users.fullName }).from(users).where(eq(users.id, booking.customerId)).limit(1);
    const friendName = (friend?.name ?? "a friend").split(/\s+/)[0];
    const walletId = await this.addToWallet(referrer.id, rewardAed);
    await this.db.update(referrals).set({ rewardPromotionId: walletId }).where(eq(referrals.id, row.id));
    void this.notifications?.notify([referrer.id], {
      title: `AED ${rewardAed} added to your wallet`,
      body: `${friendName}'s first clean is done. Your wallet credit comes off your next booking automatically.`,
      data: { type: "referral" },
    });
  }

  /** The customer's wallet is one personal, automatic credit whose value is the balance. */
  private async addToWallet(userId: string, amountAed: number): Promise<string> {
    const [wallet] = await this.db.select().from(promotions).where(and(eq(promotions.ownerId, userId), eq(promotions.name, WALLET))).limit(1);
    if (wallet) {
      await this.db
        .update(promotions)
        .set({ value: sql`${promotions.value} + ${amountAed}`, active: true, updatedAt: new Date() })
        .where(eq(promotions.id, wallet.id));
      return wallet.id;
    }
    const [created] = await this.db
      .insert(promotions)
      .values({ name: WALLET, kind: "fixed", value: amountAed, autoApply: true, firstBookingOnly: false, ownerId: userId, active: true })
      .returning();
    return created!.id;
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
    notifyCustomers: p.notifyCustomers ?? true,
    message: p.message?.trim() || null,
    messageAr: p.messageAr?.trim() || null,
  };
}

const AR_DATE = new Intl.DateTimeFormat("ar-AE-u-nu-latn", { day: "numeric", month: "long", timeZone: "Asia/Dubai" });
const EN_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" });

/** The notification customers see: the office's own words if given, otherwise written from the offer. */
export function offerText(p: Pick<Promotion, "name" | "kind" | "value" | "maxDiscountAed" | "minOrderAed" | "code" | "autoApply" | "firstBookingOnly" | "endsAt" | "message" | "messageAr">, lang: "en" | "ar") {
  if (lang === "ar") {
    const off = p.kind === "percent" ? `خصم ${p.value}%` : `خصم ${p.value} درهم`;
    const parts = [
      `${off}${p.kind === "percent" && p.maxDiscountAed ? ` (حتى ${p.maxDiscountAed} درهم)` : ""}${p.firstBookingOnly ? " على أول حجز" : " على حجزك"}`,
      p.code && !p.autoApply ? `استخدم الرمز ${p.code}` : "يُطبّق تلقائياً عند الدفع",
      p.minOrderAed ? `للطلبات من ${p.minOrderAed} درهم` : null,
      p.endsAt ? `حتى ${AR_DATE.format(p.endsAt)}` : null,
    ].filter(Boolean);
    return { title: `🎉 عرض جديد من Xtreme`, body: p.messageAr?.trim() || `${parts.join(" · ")}. احجز الآن في التطبيق.` };
  }
  const off = p.kind === "percent" ? `${p.value}% off` : `AED ${p.value} off`;
  const parts = [
    `${off}${p.kind === "percent" && p.maxDiscountAed ? ` (up to AED ${p.maxDiscountAed})` : ""}${p.firstBookingOnly ? " your first booking" : " your booking"}`,
    p.code && !p.autoApply ? `use code ${p.code}` : "applied automatically at checkout",
    p.minOrderAed ? `on orders from AED ${p.minOrderAed}` : null,
    p.endsAt ? `until ${EN_DATE.format(p.endsAt)}` : null,
  ].filter(Boolean);
  return { title: `🎉 ${p.name}`, body: p.message?.trim() || `${parts.join(" · ")}. Book now in the app.` };
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
    notifyCustomers: p.notifyCustomers,
    message: p.message,
    messageAr: p.messageAr,
    announcedAt: p.announcedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}
