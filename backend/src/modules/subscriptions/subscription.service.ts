import { randomInt } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { bookings, subscriptionPlans, subscriptions, users, type Subscription, type SubscriptionPlan } from "../../db/schema.js";
import { COMPANY } from "../../config/company.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { isUniqueViolation, type Actor, type AddressInput, type BookingService } from "../bookings/booking.service.js";
import { findService, quote, serviceName, type PropertyType } from "../catalog/catalog.js";
import type { NotificationService } from "../notifications/notification.service.js";

export type Interval = "monthly" | "yearly";

export interface PlanInput {
  name: string;
  description?: string | null | undefined;
  serviceKey: string;
  visitsPerMonth: number;
  priceMonthlyAed?: number | null | undefined;
  priceYearlyAed?: number | null | undefined;
  active?: boolean | undefined;
  sortOrder?: number | undefined;
}

export interface SubscribeInput {
  planId: string;
  interval: Interval;
  propertyType: PropertyType;
  propertySize: string;
  addressId?: string | undefined;
  address?: AddressInput | undefined;
  firstVisitAt: Date;
  notes?: string | undefined;
}

const MONTHS: Record<Interval, number> = { monthly: 1, yearly: 12 };

/**
 * Cleaning contracts sold as monthly or yearly subscriptions at prices the office sets.
 *
 * Each paid period is charged on its first visit: that booking carries the period price and
 * goes through the normal card / Tamara checkout. When it is paid the period starts; further
 * visits in the period are booked as "included" (nothing to pay). There is no automatic card
 * re-billing yet: the customer renews from the app when a period ends.
 */
export class SubscriptionService {
  constructor(
    private readonly db: Database,
    private readonly bookingsSvc: BookingService,
    private readonly notifications: NotificationService,
  ) {}

  // ------------------------------------------------------------ plans

  async plans(opts: { includeInactive?: boolean } = {}) {
    const rows = await this.db
      .select()
      .from(subscriptionPlans)
      .where(opts.includeInactive ? undefined : eq(subscriptionPlans.active, true))
      .orderBy(asc(subscriptionPlans.sortOrder), asc(subscriptionPlans.createdAt));
    return rows.map(planView);
  }

  async createPlan(input: PlanInput) {
    this.validatePlan(input);
    const [row] = await this.db
      .insert(subscriptionPlans)
      .values({
        name: input.name,
        description: input.description ?? null,
        serviceKey: input.serviceKey,
        visitsPerMonth: input.visitsPerMonth,
        priceMonthlyAed: input.priceMonthlyAed ?? null,
        priceYearlyAed: input.priceYearlyAed ?? null,
        active: input.active ?? true,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();
    return planView(row!);
  }

  async updatePlan(id: string, patch: Partial<PlanInput>) {
    const [current] = await this.db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id)).limit(1);
    if (!current) throw notFound("Plan");
    const next = { ...current, ...patch };
    this.validatePlan(next);
    const [row] = await this.db
      .update(subscriptionPlans)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(subscriptionPlans.id, id))
      .returning();
    return planView(row!);
  }

  private validatePlan(p: { serviceKey: string; priceMonthlyAed?: number | null | undefined; priceYearlyAed?: number | null | undefined }) {
    if (!findService(p.serviceKey)) throw badRequest("unknown_service", "Choose one of the app's services");
    if (p.priceMonthlyAed == null && p.priceYearlyAed == null) throw badRequest("price_required", "Set a monthly price, a yearly price or both");
  }

  // ------------------------------------------------------------ customer

  async subscribe(customer: Actor, input: SubscribeInput) {
    const [plan] = await this.db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, input.planId)).limit(1);
    if (!plan || !plan.active) throw notFound("Plan");
    const priceAed = input.interval === "monthly" ? plan.priceMonthlyAed : plan.priceYearlyAed;
    if (priceAed == null) throw badRequest("interval_unavailable", `This plan is not offered ${input.interval}`);
    const sized = quote({ serviceKey: plan.serviceKey, propertyType: input.propertyType, propertySize: input.propertySize });
    if ("error" in sized) throw badRequest("invalid_property", sized.error);

    const [user] = await this.db.select().from(users).where(eq(users.id, customer.id)).limit(1);
    if (!user?.phone || !user.phoneVerifiedAt) throw badRequest("phone_required", "Add and verify your mobile number so the team can reach you");

    const place = await this.bookingsSvc.resolveAddress(customer.id, input);
    const sub = await this.insertWithReference({
      customerId: customer.id,
      planId: plan.id,
      planName: plan.name,
      serviceKey: plan.serviceKey,
      interval: input.interval,
      priceAed,
      visitsPerMonth: plan.visitsPerMonth,
      propertyType: input.propertyType,
      propertySize: input.propertySize,
      addressId: place.addressId,
      address: place.snapshot,
      lat: place.lat,
      lng: place.lng,
      notes: input.notes ?? null,
    });

    try {
      const visit = await this.chargeVisit(sub, input.firstVisitAt, input.notes);
      return { subscription: await this.view(sub, customer), paymentBookingId: visit.id };
    } catch (err) {
      await this.db.delete(subscriptions).where(eq(subscriptions.id, sub.id));
      throw err;
    }
  }

  async mine(customer: Actor) {
    const rows = await this.db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.customerId, customer.id), ne(subscriptions.status, "cancelled")))
      .orderBy(desc(subscriptions.createdAt));
    return Promise.all(rows.map(async (r) => this.view(await this.refreshExpiry(r), customer)));
  }

  async get(id: string, actor: Actor) {
    return this.view(await this.refreshExpiry(await this.load(id, actor)), actor);
  }

  /** Book a visit that the subscription already covers. */
  async requestVisit(id: string, actor: Actor, scheduledAt: Date, notes?: string) {
    const sub = await this.refreshExpiry(await this.load(id, actor));
    if (sub.status !== "active" || !sub.currentPeriodStart || !sub.currentPeriodEnd) {
      throw conflict("not_active", "This subscription is not active. Renew it to book visits.");
    }
    if (scheduledAt > sub.currentPeriodEnd) {
      throw badRequest("after_period", `Your current period ends on ${fmtDate(sub.currentPeriodEnd)}. Renew to book later visits.`);
    }
    const used = await this.visitsUsed(sub);
    if (used >= allowance(sub)) throw conflict("no_visits_left", "All visits in this period are booked. Renew or book a one-off service.");
    const booking = await this.bookingsSvc.create(
      { id: sub.customerId, role: "customer" },
      this.bookingInput(sub, scheduledAt, notes, 0),
    );
    return booking;
  }

  /** Start the next paid period (or retry an unpaid one). Returns the booking to pay. */
  async renew(id: string, customer: Actor, firstVisitAt: Date) {
    const sub = await this.refreshExpiry(await this.load(id, customer));
    if (sub.status === "cancelled") throw conflict("cancelled", "This subscription was cancelled");
    const open = await this.openCharge(sub.id);
    if (open) return { subscription: await this.view(sub, customer), paymentBookingId: open.id };
    const visit = await this.chargeVisit(sub, firstVisitAt);
    return { subscription: await this.view(sub, customer), paymentBookingId: visit.id };
  }

  async cancel(id: string, actor: Actor, reason?: string) {
    const sub = await this.load(id, actor);
    if (sub.status === "cancelled") return this.view(sub, actor);
    if (actor.role === "customer" && sub.status === "active") {
      throw conflict("contact_office", "Your subscription is paid until the end of the period. Contact us to cancel early or ask for a refund.");
    }
    const open = await this.openCharge(sub.id);
    if (open) await this.bookingsSvc.transition(open.id, actor, "cancelled", { reason: reason ?? "Subscription cancelled" }).catch(() => undefined);
    const [row] = await this.db
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id))
      .returning();
    if (actor.role === "admin") {
      void this.notifications.notify([sub.customerId], {
        title: `Subscription ${sub.reference} cancelled`,
        body: reason ? `Reason: ${reason}` : "Contact us if you have any questions.",
        data: { type: "subscription", subscriptionId: sub.id },
      });
    }
    return this.view(row!, actor);
  }

  // ------------------------------------------------------------ admin

  async listForAdmin(filter: { status?: Subscription["status"][] | undefined; limit: number }) {
    const rows = await this.db
      .select({ sub: subscriptions, name: users.fullName, phone: users.phone })
      .from(subscriptions)
      .innerJoin(users, eq(users.id, subscriptions.customerId))
      .where(filter.status?.length ? inArray(subscriptions.status, filter.status) : undefined)
      .orderBy(desc(subscriptions.createdAt))
      .limit(filter.limit);
    const admin: Actor = { id: "system", role: "admin" };
    return Promise.all(
      rows.map(async (r) => ({ ...(await this.view(await this.refreshExpiry(r.sub), admin)), customer: { fullName: r.name, phone: r.phone } })),
    );
  }

  // ------------------------------------------------------------ payments hook

  /** Called when a booking is paid: if it is a subscription's period charge, start or extend the period. */
  async onBookingPaid(bookingId: string) {
    const [booking] = await this.db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking?.subscriptionId || !booking.priceAed) return;
    const [sub] = await this.db.select().from(subscriptions).where(eq(subscriptions.id, booking.subscriptionId)).limit(1);
    if (!sub || sub.status === "cancelled") return;
    // The same charge may be reported twice (webhook and app); only extend once per charge.
    if (sub.currentPeriodStart && booking.createdAt <= sub.currentPeriodStart && sub.status === "active") return;

    const now = new Date();
    const start = sub.status === "active" && sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
    const end = addMonths(start, MONTHS[sub.interval]);
    await this.db
      .update(subscriptions)
      .set({ status: "active", currentPeriodStart: start, currentPeriodEnd: end, updatedAt: now })
      .where(eq(subscriptions.id, sub.id));
    void this.notifications.notify([sub.customerId], {
      title: "Subscription active",
      body: `${sub.planName} is active until ${fmtDate(end)}. Book your included visits any time in the app.`,
      data: { type: "subscription", subscriptionId: sub.id },
    });
    void this.notifications.notifyAdmins({
      title: `Subscription ${sub.reference} paid`,
      body: `${sub.planName} · ${sub.interval} · ${COMPANY.currency} ${sub.priceAed} · until ${fmtDate(end)}`,
      data: { type: "subscription", subscriptionId: sub.id },
    });
  }

  // ------------------------------------------------------------ internals

  private async chargeVisit(sub: Subscription, scheduledAt: Date, notes?: string | null) {
    return this.bookingsSvc.create({ id: sub.customerId, role: "customer" }, this.bookingInput(sub, scheduledAt, notes, sub.priceAed));
  }

  private bookingInput(sub: Subscription, scheduledAt: Date, notes: string | null | undefined, priceAed: number) {
    return {
      serviceKey: sub.serviceKey,
      propertyType: sub.propertyType,
      propertySize: sub.propertySize,
      plan: "one_off" as const,
      scheduledAt,
      ...(sub.addressId ? { addressId: sub.addressId } : { address: { ...sub.address, label: sub.address.label, lat: sub.lat, lng: sub.lng } }),
      notes: [`Subscription ${sub.reference}${priceAed ? " (period payment)" : " (included visit)"}`, notes ?? sub.notes].filter(Boolean).join(" · "),
      paymentMethod: "card" as const,
      subscription: { id: sub.id, priceAed },
    };
  }

  /** The unpaid period charge, if one is waiting. */
  private async openCharge(subscriptionId: string) {
    const [row] = await this.db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.subscriptionId, subscriptionId),
          sql`${bookings.priceAed} > 0`,
          inArray(bookings.paymentStatus, ["unpaid", "pending"]),
          ne(bookings.status, "cancelled"),
        ),
      )
      .orderBy(desc(bookings.createdAt))
      .limit(1);
    return row ?? null;
  }

  private async visitsUsed(sub: Subscription) {
    if (!sub.currentPeriodStart || !sub.currentPeriodEnd) return 0;
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookings)
      .where(
        and(
          eq(bookings.subscriptionId, sub.id),
          ne(bookings.status, "cancelled"),
          gte(bookings.scheduledAt, sub.currentPeriodStart),
          lte(bookings.scheduledAt, sub.currentPeriodEnd),
        ),
      );
    return row?.n ?? 0;
  }

  private async refreshExpiry(sub: Subscription) {
    if (sub.status === "active" && sub.currentPeriodEnd && sub.currentPeriodEnd < new Date()) {
      const [row] = await this.db
        .update(subscriptions)
        .set({ status: "expired", updatedAt: new Date() })
        .where(and(eq(subscriptions.id, sub.id), eq(subscriptions.status, "active")))
        .returning();
      return row ?? sub;
    }
    return sub;
  }

  private async load(id: string, actor: Actor) {
    const [sub] = await this.db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
    if (!sub || (actor.role !== "admin" && sub.customerId !== actor.id)) throw notFound("Subscription");
    return sub;
  }

  private async insertWithReference(values: Omit<typeof subscriptions.$inferInsert, "reference">): Promise<Subscription> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const reference = `SUB-${randomInt(100_000, 1_000_000)}`;
      try {
        const [row] = await this.db.insert(subscriptions).values({ ...values, reference }).returning();
        return row!;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    throw conflict("busy", "Please try again");
  }

  private async view(sub: Subscription, actor: Actor) {
    const visits = await this.db
      .select({ id: bookings.id, reference: bookings.reference, status: bookings.status, scheduledAt: bookings.scheduledAt, priceAed: bookings.priceAed, paymentStatus: bookings.paymentStatus })
      .from(bookings)
      .where(eq(bookings.subscriptionId, sub.id))
      .orderBy(desc(bookings.scheduledAt))
      .limit(30);
    const open = visits.find((v) => (v.priceAed ?? 0) > 0 && (v.paymentStatus === "unpaid" || v.paymentStatus === "pending") && v.status !== "cancelled");
    const used = await this.visitsUsed(sub);
    const left = sub.status === "active" ? Math.max(0, allowance(sub) - used) : 0;
    return {
      id: sub.id,
      reference: sub.reference,
      planId: sub.planId,
      planName: sub.planName,
      service: { key: sub.serviceKey, name: serviceName(sub.serviceKey) },
      interval: sub.interval,
      priceAed: sub.priceAed,
      visitsPerMonth: sub.visitsPerMonth,
      visitsPerPeriod: allowance(sub),
      visitsUsed: used,
      visitsLeft: left,
      property: { type: sub.propertyType, size: sub.propertySize },
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      address: { ...sub.address, lat: sub.lat, lng: sub.lng },
      notes: sub.notes,
      paymentBookingId: open?.id ?? null,
      canBookVisit: sub.status === "active" && left > 0,
      canRenew: sub.status !== "cancelled" && !open,
      canCancel: actor.role === "admin" ? sub.status !== "cancelled" : sub.status === "pending_payment",
      visits: visits.map((v) => ({ ...v, scheduledAt: v.scheduledAt.toISOString(), included: (v.priceAed ?? 0) === 0 })),
      createdAt: sub.createdAt.toISOString(),
    };
  }
}

function planView(p: SubscriptionPlan) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    service: { key: p.serviceKey, name: serviceName(p.serviceKey) },
    visitsPerMonth: p.visitsPerMonth,
    priceMonthlyAed: p.priceMonthlyAed,
    priceYearlyAed: p.priceYearlyAed,
    active: p.active,
    sortOrder: p.sortOrder,
  };
}

function allowance(sub: Pick<Subscription, "visitsPerMonth" | "interval">) {
  return sub.visitsPerMonth * MONTHS[sub.interval];
}

function addMonths(d: Date, months: number) {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: COMPANY.timezone }).format(d);
}
