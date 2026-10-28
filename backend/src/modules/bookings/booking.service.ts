import { and, desc, eq, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import {
  addresses,
  bookingAssignments,
  bookingEvents,
  bookings,
  reviews,
  staffProfiles,
  users,
  type AddressSnapshot,
  type Booking,
  type BookingStatus,
  type UserRole,
} from "../../db/schema.js";
import { COMPANY } from "../../config/company.js";
import { assertInServiceZone } from "../../config/service-zone.js";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";
import { estimateEtaMinutes } from "../../lib/geo.js";
import { findService, quote, serviceName, type PropertyType } from "../catalog/catalog.js";
import type { NotificationService } from "../notifications/notification.service.js";
import { rooms, type RealtimeHub } from "../tracking/realtime.js";
import { ACTIVE, ON_SITE_QUOTE, TERMINAL, TRACKABLE, canTransition, staffStatusFor } from "./state.js";

export interface Actor {
  id: string;
  role: UserRole;
}

export interface AddressInput {
  label: string;
  area: string;
  building?: string | null | undefined;
  unit?: string | null | undefined;
  street?: string | null | undefined;
  notes?: string | null | undefined;
  lat: number;
  lng: number;
}

export interface CreateBookingInput {
  serviceKey: string;
  propertyType: PropertyType;
  propertySize: string;
  plan: "one_off" | "amc";
  scheduledAt: Date;
  addressId?: string | undefined;
  address?: AddressInput | undefined;
  notes?: string | undefined;
  paymentMethod: "card" | "tamara" | "cash" | "card_on_site" | "bank_transfer";
  idempotencyKey?: string | undefined;
  /** Regular cleaning only: repeat weekly or every two weeks. */
  frequency?: "one_time" | "weekly" | "biweekly" | undefined;
  /** Set only for the next visit of a repeating series (never from the request body). */
  repeatOfId?: string | undefined;
  /**
   * Set only by the subscriptions module (never from the request body): a visit that belongs
   * to a subscription. priceAed > 0 is the period charge the customer pays; 0 is an included visit.
   */
  subscription?: { id: string; priceAed: number } | undefined;
}

export interface BookingRules {
  minLeadMinutes: number;
  maxAdvanceDays: number;
  /** Earliest and latest start hour, Abu Dhabi time. */
  openHour: number;
  lastStartHour: number;
  etaSpeedKmh: number;
}

export const DEFAULT_RULES: BookingRules = { minLeadMinutes: 60, maxAdvanceDays: 90, openHour: 7, lastStartHour: 20, etaSpeedKmh: 32 };

/** Automated actions (account deletion, jobs) act with admin rights but no user id. */
export const SYSTEM_ACTOR: Actor = { id: "system", role: "admin" };

const STALE_LOCATION_MS = 5 * 60_000;

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type StatusListener = (booking: Booking, from: BookingStatus, actor: Actor) => Promise<void>;

/** Days between visits of a repeating booking. */
const REPEAT_DAYS = { weekly: 7, biweekly: 14 } as const;

/**
 * Fixed-price bookings are paid in advance: they stay "requested" (out of dispatch and the
 * staff app) until the payment is captured, which confirms them automatically. Survey-priced
 * jobs are quoted on site and included subscription visits are prepaid, so neither waits.
 */
export function awaitingPayment(b: Pick<Booking, "pricing" | "priceAed" | "paymentStatus">) {
  return b.pricing === "fixed" && (b.priceAed ?? 0) > 0 && (b.paymentStatus === "unpaid" || b.paymentStatus === "pending");
}

export class BookingService {
  private readonly listeners: StatusListener[] = [];
  private readonly pricedListeners: ((bookingId: string) => Promise<unknown>)[] = [];

  /** Runs when a booking gets (or changes) its price, e.g. to apply promotions. */
  onPriced(listener: (bookingId: string) => Promise<unknown>) {
    this.pricedListeners.push(listener);
  }

  /** Lets other modules (payments) react to status changes without a circular import. */
  onStatusChange(listener: StatusListener) {
    this.listeners.push(listener);
  }

  constructor(
    private readonly db: Database,
    private readonly notifications: NotificationService,
    private readonly hub: RealtimeHub,
    private readonly rules: BookingRules = DEFAULT_RULES,
  ) {}

  // ------------------------------------------------------------ customer actions

  async create(customer: Actor, input: CreateBookingInput) {
    if (input.idempotencyKey) {
      const [dup] = await this.db
        .select()
        .from(bookings)
        .where(and(eq(bookings.customerId, customer.id), eq(bookings.idempotencyKey, input.idempotencyKey)))
        .limit(1);
      if (dup) return this.view(dup, customer);
    }

    const [user] = await this.db.select().from(users).where(eq(users.id, customer.id)).limit(1);
    if (!user?.phone || !user.phoneVerifiedAt) {
      throw badRequest("phone_required", "Add and verify your mobile number so the team can reach you");
    }

    const service = findService(input.serviceKey)!;
    const quoted = quote(input);
    if ("error" in quoted) throw badRequest("invalid_booking", quoted.error);
    const sub = input.subscription;
    const priced = sub ? { priceAed: sub.priceAed, pricing: "fixed" as const } : quoted;
    this.assertSchedulable(input.scheduledAt);

    const place = await this.resolveAddress(customer.id, input);

    let booking: Booking;
    try {
      booking = await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(bookings)
          .values({
            customerId: customer.id,
            serviceKey: service.key,
            propertyType: input.propertyType,
            propertySize: input.propertySize,
            plan: input.plan,
            pricing: priced.pricing,
            priceAed: priced.priceAed,
            paymentMethod: input.paymentMethod,
            scheduledAt: input.scheduledAt,
            durationMinutes: quoted.durationMinutes ?? service.durationMinutes,
            frequency: service.key === "regular" && !sub ? (input.frequency ?? "one_time") : "one_time",
            repeatOfId: input.repeatOfId ?? null,
            addressId: place.addressId,
            address: place.snapshot,
            lat: place.lat,
            lng: place.lng,
            notes: input.notes ?? null,
            idempotencyKey: input.idempotencyKey ?? null,
            subscriptionId: sub?.id ?? null,
            ...(sub && sub.priceAed === 0 ? { paymentStatus: "included" as const } : {}),
          })
          .returning();
        await this.event(tx, created!.id, customer, "created", null, "requested", { priceAed: priced.priceAed });
        return created!;
      });
    } catch (err) {
      // Same idempotency key sent twice at once: return the booking that won.
      if (input.idempotencyKey && isUniqueViolation(err)) {
        const [dup] = await this.db
          .select()
          .from(bookings)
          .where(and(eq(bookings.customerId, customer.id), eq(bookings.idempotencyKey, input.idempotencyKey)));
        if (dup) return this.view(dup, customer);
      }
      throw err;
    }

    if (booking.priceAed != null) booking = await this.reprice(booking);
    const unpaid = awaitingPayment(booking);
    void this.notifications.notifyAdmins({
      title: unpaid ? `New booking ${booking.reference} (awaiting payment)` : `New booking ${booking.reference}`,
      body: `${service.name} · ${place.snapshot.area} · ${formatWhen(booking.scheduledAt)}`,
      data: { type: "booking", bookingId: booking.id },
    });
    // Staff hear about prepaid jobs only once the payment has confirmed them.
    if (!unpaid) void this.alertStaffOfNewOrder(booking, service.name, place.snapshot.area);
    this.hub.emit(rooms.admins, "booking:created", { bookingId: booking.id });
    return this.view(booking, customer);
  }

  /** Re-applies pricing rules (promotions) and returns the fresh booking. */
  async reprice(booking: Booking): Promise<Booking> {
    for (const listener of this.pricedListeners) await listener(booking.id);
    const [fresh] = await this.db.select().from(bookings).where(eq(bookings.id, booking.id)).limit(1);
    return fresh ?? booking;
  }

  /** Called once a booking is paid: a prepaid booking waiting for payment is confirmed. */
  async confirmPaid(bookingId: string) {
    const [booking] = await this.db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking || booking.status !== "requested") return;
    await this.transition(bookingId, SYSTEM_ACTOR, "confirmed", { reason: "Paid in advance" }).catch((err: unknown) => {
      if ((err as { code?: string }).code !== "booking_changed") throw err;
    });
    void this.alertStaffOfNewOrder(booking, serviceName(booking.serviceKey), booking.address.area);
  }

  /** Push "new order" to every active staff member who has new-order alerts switched on. */
  private async alertStaffOfNewOrder(booking: Booking, serviceLabel: string, area: string) {
    const rows = await this.db
      .select({ id: staffProfiles.userId })
      .from(staffProfiles)
      .innerJoin(users, eq(users.id, staffProfiles.userId))
      .where(and(eq(staffProfiles.active, true), eq(staffProfiles.notifyNewOrders, true), eq(users.role, "staff"), isNull(users.deletedAt), isNull(users.blockedAt)));
    if (!rows.length) return;
    await this.notifications.notify(
      rows.map((r) => r.id),
      { title: `New order ${booking.reference}`, body: `${serviceLabel} · ${area} · ${formatWhen(booking.scheduledAt)}`, data: { type: "new_order", bookingId: booking.id } },
    );
  }

  async listForCustomer(customerId: string, opts: { scope: "active" | "past" | "all"; limit: number; before?: Date | undefined }) {
    const scope =
      opts.scope === "active"
        ? inArray(bookings.status, [...ACTIVE])
        : opts.scope === "past"
          ? inArray(bookings.status, [...TERMINAL])
          : undefined;
    const rows = await this.db
      .select()
      .from(bookings)
      .where(and(eq(bookings.customerId, customerId), scope, opts.before ? lt(bookings.createdAt, opts.before) : undefined))
      .orderBy(desc(bookings.createdAt))
      .limit(opts.limit);
    return this.views(rows, { id: customerId, role: "customer" });
  }

  async get(bookingId: string, actor: Actor) {
    const booking = await this.loadFor(bookingId, actor);
    return this.view(booking, actor, { withTimeline: true });
  }

  async reschedule(bookingId: string, actor: Actor, patch: { scheduledAt?: Date | undefined; notes?: string | undefined }) {
    const booking = await this.loadFor(bookingId, actor);
    const editable: BookingStatus[] = actor.role === "admin" ? ["requested", "confirmed", "assigned"] : ["requested", "confirmed"];
    if (!editable.includes(booking.status)) {
      throw conflict("not_editable", "This booking can no longer be changed in the app. Please call us.");
    }
    if (patch.scheduledAt) this.assertSchedulable(patch.scheduledAt);
    const [updated] = await this.db.transaction(async (tx) => {
      const rows = await tx
        .update(bookings)
        .set({
          ...(patch.scheduledAt ? { scheduledAt: patch.scheduledAt } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(bookings.id, booking.id), eq(bookings.status, booking.status)))
        .returning();
      if (rows.length === 0) throw conflict("booking_changed", "This booking was just updated. Refresh and try again.");
      await this.event(tx, booking.id, actor, "updated", null, null, {
        scheduledAt: patch.scheduledAt?.toISOString(),
        previousScheduledAt: booking.scheduledAt.toISOString(),
        notesChanged: patch.notes !== undefined,
      });
      return rows;
    });
    if (patch.scheduledAt && actor.role === "customer") {
      void this.notifications.notifyAdmins({
        title: `Booking ${booking.reference} rescheduled`,
        body: `New time: ${formatWhen(patch.scheduledAt)}`,
        data: { type: "booking", bookingId: booking.id },
      });
    }
    return this.view(updated!, actor);
  }

  async cancel(bookingId: string, actor: Actor, reason?: string) {
    return this.transition(bookingId, actor, "cancelled", { reason });
  }

  async review(bookingId: string, customer: Actor, input: { rating: number; comment?: string | undefined }) {
    const booking = await this.loadFor(bookingId, customer);
    if (booking.customerId !== customer.id) throw forbidden();
    if (booking.status !== "completed") throw conflict("not_completed", "You can rate the service once it is completed");
    const inserted = await this.db
      .insert(reviews)
      .values({ bookingId, customerId: customer.id, rating: input.rating, comment: input.comment ?? null })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) throw conflict("already_reviewed", "You have already rated this booking");
    if (input.rating <= 3) {
      void this.notifications.notifyAdmins({
        title: `${input.rating}★ review on ${booking.reference}`,
        body: input.comment?.slice(0, 140) || "No comment",
        data: { type: "booking", bookingId },
      });
    }
    return this.view(booking, customer);
  }

  // ------------------------------------------------------------ status changes

  /**
   * The single place a booking's status changes. Checks the state machine and the
   * actor's rights, applies the change with a compare-and-set on the old status, keeps
   * the assigned team's status in step, and tells everyone who needs to know.
   */
  async transition(bookingId: string, actor: Actor, to: BookingStatus, opts: { reason?: string | undefined } = {}) {
    const booking = await this.loadFor(bookingId, actor);
    const from = booking.status;
    if (!canTransition(from, to, actor.role)) {
      throw conflict("invalid_transition", `A booking that is ${label(from)} cannot be marked ${label(to)}`);
    }
    if (to === "assigned") throw badRequest("use_assign", "Assign a team to move a booking to assigned");
    if (actor.role === "staff" && !(await this.isLead(bookingId, actor.id))) {
      throw forbidden("Only the team lead can update this job");
    }
    if (to === "confirmed" && actor.id !== SYSTEM_ACTOR.id && awaitingPayment(booking)) {
      throw conflict("payment_required", "This booking is confirmed automatically once the customer pays");
    }
    if (to === "completed" && booking.priceAed == null) {
      throw conflict("quote_needed", "Enter the price for this job before marking it completed");
    }

    const team = await this.teamIds(bookingId);
    const updated = await this.db.transaction(async (tx) => {
      const now = new Date();
      const rows = await tx
        .update(bookings)
        .set({
          status: to,
          updatedAt: now,
          ...(to === "completed" ? { completedAt: now } : {}),
          ...(to === "cancelled" ? { cancelledAt: now, cancelReason: opts.reason ?? null } : {}),
        })
        .where(and(eq(bookings.id, bookingId), eq(bookings.status, from)))
        .returning();
      if (rows.length === 0) throw conflict("booking_changed", "This booking was just updated. Refresh and try again.");

      if (to === "confirmed" && from === "assigned") {
        await tx.delete(bookingAssignments).where(eq(bookingAssignments.bookingId, bookingId));
      }
      // Only a job under way moves the team's status; cancelling a job that has not
      // started must not mark staff available while they are busy elsewhere.
      const staffStatus = TRACKABLE.includes(to) || TRACKABLE.includes(from) ? staffStatusFor(to) : null;
      if (staffStatus && team.length) {
        // Setting off for a job puts the team on duty (so their location is shared with the
        // customer); other changes leave anyone who is off duty alone.
        await tx
          .update(staffProfiles)
          .set({ status: staffStatus, statusChangedAt: now })
          .where(and(inArray(staffProfiles.userId, team), to === "en_route" ? undefined : sql`${staffProfiles.status} <> 'off_duty'`));
      }
      await this.event(tx, bookingId, actor, "status", from, to, opts.reason ? { reason: opts.reason } : undefined);
      return rows[0]!;
    });

    if (to === "confirmed" && from === "assigned") for (const id of team) this.hub.leave(id, rooms.booking(bookingId));
    await this.announce(updated, actor, team);
    for (const listener of this.listeners) await listener(updated, from, actor);
    if (to === "completed" && updated.frequency !== "one_time") void this.scheduleNextVisit(updated).catch(() => undefined);
    return this.view(updated, actor);
  }

  /**
   * A repeating regular clean: once a visit is completed, the next one is booked at the same
   * time a week (or two) later. It waits for payment like any booking; skipping it (cancelling)
   * ends the series.
   */
  async scheduleNextVisit(done: Booking) {
    if (done.frequency === "one_time") return null;
    const [existing] = await this.db.select({ id: bookings.id }).from(bookings).where(eq(bookings.repeatOfId, done.id)).limit(1);
    if (existing) return null;
    const step = REPEAT_DAYS[done.frequency] * 86_400_000;
    let at = done.scheduledAt.getTime() + step;
    while (at < Date.now() + this.rules.minLeadMinutes * 60_000) at += step;
    const next = await this.create(
      { id: done.customerId, role: "customer" },
      {
        serviceKey: done.serviceKey,
        propertyType: done.propertyType,
        propertySize: done.propertySize,
        plan: "one_off",
        frequency: done.frequency,
        repeatOfId: done.id,
        scheduledAt: new Date(at),
        address: { ...done.address, label: done.address.label, area: done.address.area, lat: done.lat, lng: done.lng },
        notes: done.notes ?? undefined,
        paymentMethod: "card",
        idempotencyKey: `repeat-${done.id}`,
      },
    );
    void this.notifications.notify([done.customerId], {
      title: `Your next ${done.frequency === "weekly" ? "weekly" : "bi-weekly"} clean is ready`,
      body: `${formatWhen(new Date(at))} · ${next.reference}. Pay in the app to confirm it, or cancel to stop repeating.`,
      data: { type: "booking", bookingId: next.id },
    });
    return next;
  }

  /** Assigns (or reassigns) the team for a booking. Admin only. */
  async assign(bookingId: string, admin: Actor, staffIds: string[], leadId?: string) {
    const booking = await this.loadFor(bookingId, admin);
    if (!canTransition(booking.status, "assigned", admin.role)) {
      throw conflict("invalid_transition", `A booking that is ${label(booking.status)} cannot be assigned`);
    }
    if (awaitingPayment(booking)) throw conflict("payment_required", "Assign a team once the customer has paid");
    const unique = [...new Set(staffIds)];
    const lead = leadId ?? unique[0]!;
    if (!unique.includes(lead)) throw badRequest("invalid_lead", "The team lead must be one of the assigned staff");

    const staff = await this.db
      .select({ userId: staffProfiles.userId, active: staffProfiles.active })
      .from(staffProfiles)
      .innerJoin(users, eq(users.id, staffProfiles.userId))
      .where(and(inArray(staffProfiles.userId, unique), eq(users.role, "staff"), isNull(users.deletedAt)));
    const found = new Set(staff.filter((s) => s.active).map((s) => s.userId));
    const missing = unique.filter((id) => !found.has(id));
    if (missing.length) throw badRequest("invalid_staff", "Some staff are unknown or inactive", { staffIds: missing });

    const previous = await this.teamIds(bookingId);
    const updated = await this.db.transaction(async (tx) => {
      const rows = await tx
        .update(bookings)
        .set({ status: "assigned", updatedAt: new Date() })
        .where(and(eq(bookings.id, bookingId), eq(bookings.status, booking.status)))
        .returning();
      if (rows.length === 0) throw conflict("booking_changed", "This booking was just updated. Refresh and try again.");
      await tx.delete(bookingAssignments).where(eq(bookingAssignments.bookingId, bookingId));
      await tx.insert(bookingAssignments).values(unique.map((staffId) => ({ bookingId, staffId, isLead: staffId === lead })));
      await this.event(tx, bookingId, admin, "assigned", booking.status, "assigned", { staffIds: unique, leadId: lead });
      return rows[0]!;
    });

    const removed = previous.filter((id) => !unique.includes(id));
    for (const id of removed) this.hub.leave(id, rooms.booking(bookingId));
    if (removed.length) {
      void this.notifications.notify(removed, {
        title: `Job ${booking.reference} reassigned`,
        body: "You are no longer assigned to this job.",
        data: { type: "job", bookingId },
      });
    }
    await this.announce(updated, admin, unique);
    return this.view(updated, admin);
  }

  /** Office sets the price after a survey (for "price on inspection" services). */
  /**
   * Sets the price of a job, usually one quoted on inspection. Admins can price any open
   * booking; staff only jobs they are assigned to, from the moment they are on the way
   * (so the lead can quote on site). The customer is told straight away and can pay in the app.
   */
  async setPrice(bookingId: string, actor: Actor, priceAed: number, note?: string | undefined) {
    const booking = await this.loadFor(bookingId, actor);
    if (TERMINAL.includes(booking.status)) throw conflict("not_editable", "Closed bookings cannot be repriced");
    if (booking.paymentStatus !== "unpaid") throw conflict("already_paid", "This booking has a payment. Refund it before changing the price.");
    if (actor.role === "staff") {
      if (!(await this.isLead(bookingId, actor.id))) throw forbidden("Only the team lead can quote this job", "not_lead");
      if (!ON_SITE_QUOTE.includes(booking.status)) throw conflict("not_on_site", "You can quote once you are on the way or at the customer's home");
    }
    const [first] = await this.db.transaction(async (tx) => {
      const rows = await tx.update(bookings).set({ priceAed, updatedAt: new Date() }).where(eq(bookings.id, bookingId)).returning();
      await this.event(tx, bookingId, actor, "priced", null, null, { priceAed, previous: booking.priceAed, by: actor.role, ...(note ? { note } : {}) });
      return rows;
    });
    const updated = await this.reprice(first!);
    const due = priceAed - updated.discountAed;
    void this.notifications.notify([booking.customerId], {
      title: `Your quote for ${booking.reference}`,
      body: `${serviceName(booking.serviceKey)}: ${COMPANY.currency} ${due}${updated.discountAed ? ` after your ${COMPANY.currency} ${updated.discountAed} discount` : ""}${note ? ` (${note})` : ""}. Tap to review and pay securely in the app.`,
      data: { type: "quote", bookingId },
    });
    return this.view(updated, actor);
  }

  // ------------------------------------------------------------ tracking view

  /**
   * What the customer's live-tracking screen shows: who is coming, their status and,
   * only while the job is under way, where they are and roughly when they arrive.
   */
  async tracking(bookingId: string, actor: Actor) {
    const booking = await this.loadFor(bookingId, actor);
    const team = await this.team(bookingId);
    const live = TRACKABLE.includes(booking.status);
    const lead = team.find((m) => m.isLead) ?? team[0];
    const now = Date.now();

    const location =
      live && lead?.lastLat != null && lead.lastLng != null && lead.lastLocationAt
        ? {
            lat: lead.lastLat,
            lng: lead.lastLng,
            heading: lead.lastHeading,
            speed: lead.lastSpeed,
            at: lead.lastLocationAt.toISOString(),
            stale: now - lead.lastLocationAt.getTime() > STALE_LOCATION_MS,
          }
        : null;

    return {
      bookingId,
      reference: booking.reference,
      status: booking.status,
      live,
      destination: { lat: booking.lat, lng: booking.lng },
      team: team.map(publicStaff),
      location,
      // No arrival time from an outdated position: it would be misleading.
      etaMinutes:
        booking.status === "en_route" && location && !location.stale
          ? estimateEtaMinutes(location, { lat: booking.lat, lng: booking.lng }, this.rules.etaSpeedKmh)
          : null,
    };
  }

  // ------------------------------------------------------------ staff

  async jobsForStaff(staffId: string, scope: "active" | "past") {
    const statuses = scope === "active" ? [...ACTIVE] : [...TERMINAL];
    const rows = await this.db
      .select({ booking: bookings })
      .from(bookingAssignments)
      .innerJoin(bookings, eq(bookings.id, bookingAssignments.bookingId))
      .where(and(eq(bookingAssignments.staffId, staffId), inArray(bookings.status, statuses)))
      .orderBy(scope === "active" ? bookings.scheduledAt : desc(bookings.scheduledAt))
      .limit(100);
    return this.views(
      rows.map((r) => r.booking),
      { id: staffId, role: "staff" },
    );
  }

  /** The booking a staff member is currently travelling to or working on, if any. */
  async currentJobFor(staffId: string): Promise<Booking | null> {
    const [row] = await this.db
      .select({ booking: bookings })
      .from(bookingAssignments)
      .innerJoin(bookings, eq(bookings.id, bookingAssignments.bookingId))
      .where(and(eq(bookingAssignments.staffId, staffId), inArray(bookings.status, [...TRACKABLE])))
      .orderBy(bookings.scheduledAt)
      .limit(1);
    return row?.booking ?? null;
  }

  // ------------------------------------------------------------ admin

  async listForAdmin(filter: { status?: BookingStatus[] | undefined; from?: Date | undefined; to?: Date | undefined; limit: number }) {
    const rows = await this.db
      .select()
      .from(bookings)
      .where(
        and(
          filter.status?.length ? inArray(bookings.status, filter.status) : undefined,
          filter.from ? sql`${bookings.scheduledAt} >= ${filter.from}` : undefined,
          filter.to ? sql`${bookings.scheduledAt} < ${filter.to}` : undefined,
        ),
      )
      .orderBy(bookings.scheduledAt)
      .limit(filter.limit);
    return this.views(rows, SYSTEM_ACTOR);
  }

  /** Cancels a departing customer's open bookings (account deletion). */
  async cancelAllOpenFor(customerId: string) {
    const open = await this.db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.customerId, customerId), notInArray(bookings.status, [...TERMINAL])));
    for (const b of open) {
      await this.transition(b.id, SYSTEM_ACTOR, "cancelled", { reason: "Customer deleted account" }).catch(
        () => undefined,
      );
    }
  }

  // ------------------------------------------------------------ internals

  /** Loads a booking the actor may see. Others get 404 so ids cannot be probed. */
  async loadFor(bookingId: string, actor: Actor): Promise<Booking> {
    const [booking] = await this.db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking) throw notFound("Booking");
    if (actor.role === "admin") return booking;
    if (actor.role === "customer" && booking.customerId === actor.id) return booking;
    if (actor.role === "staff") {
      const [assigned] = await this.db
        .select({ staffId: bookingAssignments.staffId })
        .from(bookingAssignments)
        .where(and(eq(bookingAssignments.bookingId, bookingId), eq(bookingAssignments.staffId, actor.id)))
        .limit(1);
      if (assigned) return booking;
    }
    throw notFound("Booking");
  }

  private async isLead(bookingId: string, staffId: string) {
    const [row] = await this.db
      .select({ isLead: bookingAssignments.isLead })
      .from(bookingAssignments)
      .where(and(eq(bookingAssignments.bookingId, bookingId), eq(bookingAssignments.staffId, staffId)))
      .limit(1);
    return row?.isLead ?? false;
  }

  private async teamIds(bookingId: string) {
    const rows = await this.db
      .select({ staffId: bookingAssignments.staffId })
      .from(bookingAssignments)
      .where(eq(bookingAssignments.bookingId, bookingId));
    return rows.map((r) => r.staffId);
  }

  private async team(bookingId: string) {
    return this.teams([bookingId]).then((m) => m.get(bookingId) ?? []);
  }

  private async teams(bookingIds: string[]) {
    const map = new Map<string, (typeof staffProfiles.$inferSelect & { isLead: boolean })[]>();
    if (bookingIds.length === 0) return map;
    const rows = await this.db
      .select({ bookingId: bookingAssignments.bookingId, isLead: bookingAssignments.isLead, staff: staffProfiles })
      .from(bookingAssignments)
      .innerJoin(staffProfiles, eq(staffProfiles.userId, bookingAssignments.staffId))
      .where(inArray(bookingAssignments.bookingId, bookingIds))
      .orderBy(desc(bookingAssignments.isLead), staffProfiles.displayName);
    for (const r of rows) {
      const list = map.get(r.bookingId) ?? [];
      list.push({ ...r.staff, isLead: r.isLead });
      map.set(r.bookingId, list);
    }
    return map;
  }

  /** Saved or new address for a customer, checked against the service area. */
  async resolveAddress(customerId: string, input: Pick<CreateBookingInput, "addressId" | "address">) {
    if (input.addressId) {
      const [saved] = await this.db
        .select()
        .from(addresses)
        .where(and(eq(addresses.id, input.addressId), eq(addresses.userId, customerId), isNull(addresses.deletedAt)))
        .limit(1);
      if (!saved) throw notFound("Address");
      // Addresses saved before the service zone existed may be outside it.
      assertInServiceZone(saved);
      return {
        addressId: saved.id,
        lat: saved.lat,
        lng: saved.lng,
        snapshot: snapshotOf(saved),
      };
    }
    if (!input.address) throw badRequest("address_required", "Choose where the service should take place");
    assertInServiceZone(input.address);
    return { addressId: null, lat: input.address.lat, lng: input.address.lng, snapshot: snapshotOf(input.address) };
  }

  private assertSchedulable(at: Date) {
    const now = Date.now();
    if (at.getTime() < now + this.rules.minLeadMinutes * 60_000) {
      throw badRequest("too_soon", `Bookings need at least ${this.rules.minLeadMinutes / 60} hours' notice. For urgent jobs, call us.`);
    }
    if (at.getTime() > now + this.rules.maxAdvanceDays * 86_400_000) {
      throw badRequest("too_far", `Bookings can be made up to ${this.rules.maxAdvanceDays} days ahead`);
    }
    const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: COMPANY.timezone }).format(at));
    if (hour < this.rules.openHour || hour > this.rules.lastStartHour) {
      throw badRequest("outside_hours", `Start times are between ${this.rules.openHour}:00 and ${this.rules.lastStartHour}:00`);
    }
  }

  private async event(
    tx: Tx,
    bookingId: string,
    actor: Actor,
    type: string,
    fromStatus: BookingStatus | null,
    toStatus: BookingStatus | null,
    data?: Record<string, unknown>,
  ) {
    await tx.insert(bookingEvents).values({
      bookingId,
      type,
      fromStatus,
      toStatus,
      actorId: actor.id === SYSTEM_ACTOR.id ? null : actor.id,
      actorRole: actor.role,
      data: data ?? null,
    });
  }

  /** Pushes the new status to the customer, the team and the office dashboard. */
  private async announce(booking: Booking, actor: Actor, team: string[]) {
    const payload = { bookingId: booking.id, status: booking.status, updatedAt: booking.updatedAt.toISOString() };
    this.hub.emit([rooms.booking(booking.id), rooms.admins], "booking:status", payload);

    const ref = booking.reference;
    const when = formatWhen(booking.scheduledAt);
    const data = { type: "booking", bookingId: booking.id, status: booking.status };
    const customerMsg: Partial<Record<BookingStatus, { title: string; body: string }>> = {
      confirmed: { title: "Booking confirmed", body: `${ref} is confirmed for ${when}.` },
      assigned: { title: "Your team is assigned", body: `We've assigned your team for ${ref} on ${when}.` },
      en_route: { title: "Your team is on the way", body: `Track them live in the app (${ref}).` },
      arrived: { title: "Your team has arrived", body: `The Xtreme team is at your door (${ref}).` },
      completed: { title: "Job completed", body: `Thanks for choosing Xtreme! Tap to rate ${ref}.` },
      cancelled: { title: "Booking cancelled", body: `${ref} for ${when} has been cancelled.` },
    };
    const msg = customerMsg[booking.status];
    if (msg && actor.id !== booking.customerId) void this.notifications.notify([booking.customerId], { ...msg, data });

    if (booking.status === "assigned") {
      void this.notifications.notify(team, {
        title: `New job ${ref}`,
        body: `${serviceName(booking.serviceKey)} · ${booking.address.area} · ${when}`,
        data: { type: "job", bookingId: booking.id },
      });
    }
    if (booking.status === "cancelled") {
      void this.notifications.notify(team, { title: `Job ${ref} cancelled`, body: when, data: { type: "job", bookingId: booking.id } });
      if (actor.role === "customer") {
        void this.notifications.notifyAdmins({ title: `${ref} cancelled by customer`, body: when, data });
      }
    }
  }

  private async view(booking: Booking, actor: Actor, opts: { withTimeline?: boolean } = {}) {
    const [result] = await this.views([booking], actor, opts);
    return result!;
  }

  private async views(rows: Booking[], actor: Actor, opts: { withTimeline?: boolean } = {}) {
    const ids = rows.map((b) => b.id);
    const teams = await this.teams(ids);
    const reviewRows = ids.length ? await this.db.select().from(reviews).where(inArray(reviews.bookingId, ids)) : [];
    const reviewMap = new Map(reviewRows.map((r) => [r.bookingId, r]));
    const timeline =
      opts.withTimeline && ids.length
        ? await this.db.select().from(bookingEvents).where(inArray(bookingEvents.bookingId, ids)).orderBy(bookingEvents.id)
        : [];
    const customers =
      actor.role === "customer" || !ids.length
        ? new Map()
        : new Map(
            (
              await this.db
                .select({ id: users.id, fullName: users.fullName, phone: users.phone })
                .from(users)
                .where(inArray(users.id, [...new Set(rows.map((b) => b.customerId))]))
            ).map((u) => [u.id, u]),
          );

    return rows.map((b) => {
      const service = findService(b.serviceKey);
      const review = reviewMap.get(b.id);
      return {
        id: b.id,
        reference: b.reference,
        status: b.status,
        service: { key: b.serviceKey, name: serviceName(b.serviceKey), nameAr: service?.nameAr ?? null },
        property: { type: b.propertyType, size: b.propertySize },
        plan: b.plan,
        frequency: b.frequency,
        repeatOfId: b.repeatOfId,
        pricing: b.pricing,
        priceAed: b.priceAed,
        paymentMethod: b.paymentMethod,
        paymentStatus: b.paymentStatus,
        invoiceSentAt: b.invoiceSentAt?.toISOString() ?? null,
        subscriptionId: b.subscriptionId,
        discountAed: b.discountAed,
        amountDueAed: b.priceAed == null ? null : b.priceAed - b.discountAed,
        promoCode: b.promoCode,
        awaitingPayment: b.status === "requested" && awaitingPayment(b),
        canPay: b.priceAed != null && b.priceAed > 0 && (b.paymentStatus === "unpaid" || b.paymentStatus === "pending") && b.status !== "cancelled",
        scheduledAt: b.scheduledAt.toISOString(),
        durationMinutes: b.durationMinutes,
        address: { ...b.address, lat: b.lat, lng: b.lng },
        notes: b.notes,
        team: (teams.get(b.id) ?? []).map(publicStaff),
        trackable: TRACKABLE.includes(b.status),
        canCancel: canTransition(b.status, "cancelled", actor.role),
        canReschedule: actor.role === "customer" ? ["requested", "confirmed"].includes(b.status) : !TERMINAL.includes(b.status),
        review: review ? { rating: review.rating, comment: review.comment, createdAt: review.createdAt.toISOString() } : null,
        customer: actor.role === "customer" ? undefined : (customers.get(b.customerId) ?? null),
        cancelReason: b.cancelReason,
        completedAt: b.completedAt?.toISOString() ?? null,
        cancelledAt: b.cancelledAt?.toISOString() ?? null,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
        timeline: opts.withTimeline
          ? timeline
              .filter((e) => e.bookingId === b.id)
              .map((e) => ({ type: e.type, from: e.fromStatus, to: e.toStatus, by: e.actorRole, at: e.createdAt.toISOString() }))
          : undefined,
      };
    });
  }
}

export function publicStaff(s: typeof staffProfiles.$inferSelect & { isLead?: boolean }) {
  return {
    id: s.userId,
    displayName: s.displayName,
    photoUrl: s.photoUrl,
    teamName: s.teamName,
    status: s.status,
    isLead: s.isLead ?? false,
  };
}

function snapshotOf(a: AddressInput): AddressSnapshot {
  return {
    label: a.label,
    area: a.area,
    building: a.building ?? null,
    unit: a.unit ?? null,
    street: a.street ?? null,
    notes: a.notes ?? null,
  };
}

function label(status: BookingStatus) {
  return status.replace("_", " ");
}

export function formatWhen(d: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: COMPANY.timezone,
  }).format(d);
}

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}
