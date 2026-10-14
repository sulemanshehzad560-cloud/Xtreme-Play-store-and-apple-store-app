import type { FastifyBaseLogger } from "fastify";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { bookingEvents, bookings, paymentWebhookEvents, payments, users, type Booking, type Payment, type PaymentStatus } from "../../db/schema.js";
import { COMPANY } from "../../config/company.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import type { Actor, BookingService } from "../bookings/booking.service.js";
import { findService } from "../catalog/catalog.js";
import type { NotificationService } from "../notifications/notification.service.js";
import type { BnplGateway, CardGateway } from "./gateways.js";

export interface PaymentConfig {
  vatRate: number;
  publicUrl: string;
  appScheme: string;
  merchantName: string;
  tamaraInstalments: number;
}

export type PayMethod = "card" | "tamara";

const CURRENCY = COMPANY.currency;
const SETTLED: PaymentStatus[] = ["captured", "partially_refunded", "refunded"];

export class PaymentService {
  constructor(
    private readonly db: Database,
    private readonly bookingsSvc: BookingService,
    private readonly notifications: NotificationService,
    private readonly card: CardGateway,
    private readonly bnpl: BnplGateway,
    private readonly config: PaymentConfig,
    private readonly log: FastifyBaseLogger,
  ) {
    bookingsSvc.onStatusChange(async (booking, _from) => {
      if (booking.status === "cancelled") await this.settleCancelledBooking(booking);
    });
  }

  // ------------------------------------------------------------ customer

  /** What the checkout screen offers for this booking. */
  async options(bookingId: string, customer: Actor) {
    const booking = await this.payable(bookingId, customer);
    const amountMinor = booking.priceAed! * 100;
    const [user] = await this.db.select().from(users).where(eq(users.id, customer.id)).limit(1);
    const tamara =
      this.bnpl.configured && user?.phone
        ? await this.bnpl.eligibility({ amountMinor, currency: CURRENCY, phone: user.phone })
        : { eligible: false, label: null };
    return {
      bookingId,
      amount: { totalAed: booking.priceAed!, vatAed: this.vatMinor(amountMinor) / 100, vatIncluded: true, currency: CURRENCY },
      methods: [
        { method: "card", available: this.card.configured, label: "Credit / debit card, Apple Pay or Google Pay" },
        { method: "tamara", available: tamara.eligible, label: tamara.label ?? `Pay in ${this.config.tamaraInstalments} with Tamara` },
        { method: "cash", available: true, label: "Pay the team on the day (cash or card)" },
      ],
    };
  }

  /** Starts (or restarts) paying for a booking with card or Tamara. */
  async start(bookingId: string, customer: Actor, method: PayMethod, opts: { locale?: "en" | "ar" | undefined } = {}) {
    const booking = await this.payable(bookingId, customer);
    if (method === "card" && !this.card.configured) throw badRequest("method_unavailable", "Card payments are not available right now");
    if (method === "tamara" && !this.bnpl.configured) throw badRequest("method_unavailable", "Tamara is not available right now");
    const [user] = await this.db.select().from(users).where(eq(users.id, customer.id)).limit(1);
    if (!user) throw notFound("Account");

    await this.retirePendingAttempts(booking.id);

    const amountMinor = booking.priceAed! * 100;
    const [payment] = await this.db
      .insert(payments)
      .values({
        bookingId: booking.id,
        customerId: customer.id,
        provider: method === "card" ? "stripe" : "tamara",
        amountMinor,
        currency: CURRENCY,
        instalments: method === "tamara" ? this.config.tamaraInstalments : null,
      })
      .returning();
    const serviceName = findService(booking.serviceKey)?.name ?? "Xtreme service";
    const description = `${serviceName} · ${booking.reference}`;

    try {
      if (method === "card") {
        const customerId = await this.card.ensureCustomer({
          id: user.id,
          email: user.email,
          name: user.fullName,
          phone: user.phone,
          existingId: user.stripeCustomerId,
        });
        if (!user.stripeCustomerId) await this.db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, user.id));
        const intent = await this.card.createIntent({
          paymentId: payment!.id,
          amountMinor,
          currency: CURRENCY,
          customerId,
          description,
          metadata: { bookingId: booking.id, reference: booking.reference },
        });
        const sheet = await this.card.sheetSession(customerId);
        await this.db.update(payments).set({ providerRef: intent.id, updatedAt: new Date() }).where(eq(payments.id, payment!.id));
        await this.markBookingPending(booking, "card");
        return {
          paymentId: payment!.id,
          provider: "stripe" as const,
          status: "pending" as const,
          stripe: {
            publishableKey: this.card.publishableKey!,
            paymentIntentClientSecret: intent.clientSecret,
            customerId: sheet.customerId,
            customerEphemeralKeySecret: sheet.ephemeralKey,
            merchantDisplayName: this.config.merchantName,
            merchantCountryCode: COMPANY.address.countryCode,
            currency: CURRENCY,
          },
        };
      }

      if (!user.email) throw badRequest("email_required", "Add your email address in your profile to pay with Tamara");
      if (!user.fullName?.trim()) throw badRequest("name_required", "Add your full name in your profile to pay with Tamara");
      const [firstName, ...rest] = user.fullName.trim().split(/\s+/);
      const ret = (result: string) =>
        `${this.config.publicUrl}/v1/payments/tamara/return?paymentId=${payment!.id}&result=${result}`;
      const checkout = await this.bnpl.createCheckout({
        paymentId: payment!.id,
        reference: booking.reference,
        amountMinor,
        taxMinor: this.vatMinor(amountMinor),
        currency: CURRENCY,
        description,
        instalments: this.config.tamaraInstalments,
        item: { reference: booking.id, name: serviceName, sku: booking.serviceKey },
        consumer: { firstName: firstName!, lastName: rest.join(" "), phone: user.phone!, email: user.email },
        address: {
          line1: [booking.address.unit, booking.address.building, booking.address.street, booking.address.area].filter(Boolean).join(", "),
          city: COMPANY.address.city,
          countryCode: COMPANY.address.countryCode,
        },
        urls: {
          success: ret("success"),
          failure: ret("failure"),
          cancel: ret("cancel"),
          notification: `${this.config.publicUrl}/v1/webhooks/tamara`,
        },
        locale: opts.locale === "ar" ? "ar_SA" : "en_US",
      });
      await this.db
        .update(payments)
        .set({ providerRef: checkout.orderId, checkoutUrl: checkout.checkoutUrl, updatedAt: new Date() })
        .where(eq(payments.id, payment!.id));
      await this.markBookingPending(booking, "tamara");
      return {
        paymentId: payment!.id,
        provider: "tamara" as const,
        status: "pending" as const,
        tamara: { checkoutUrl: checkout.checkoutUrl, returnUrlPrefix: `${this.config.appScheme}://payments/` },
      };
    } catch (err) {
      await this.db
        .update(payments)
        .set({ status: "failed", failureReason: err instanceof Error ? err.message.slice(0, 500) : "start failed", updatedAt: new Date() })
        .where(eq(payments.id, payment!.id));
      await this.rollUp(booking.id);
      throw err;
    }
  }

  async listForBooking(bookingId: string, actor: Actor) {
    await this.bookingsSvc.loadFor(bookingId, actor);
    const rows = await this.db.select().from(payments).where(eq(payments.bookingId, bookingId)).orderBy(desc(payments.createdAt));
    return rows.map((p) => this.view(p));
  }

  /** Called by the app after the payment screen closes, so it need not wait for the webhook. */
  async sync(paymentId: string, actor: Actor) {
    const payment = await this.load(paymentId);
    await this.bookingsSvc.loadFor(payment.bookingId, actor);
    return this.view(await this.reconcile(payment));
  }

  // ------------------------------------------------------------ webhooks

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    const event = this.card.parseWebhook(rawBody, signature);
    if (await this.seen("stripe", event.id)) return;
    if (event.intentId) {
      const [payment] = await this.db
        .select()
        .from(payments)
        .where(and(eq(payments.provider, "stripe"), eq(payments.providerRef, event.intentId)))
        .limit(1);
      if (payment) await this.reconcile(payment);
    }
    await this.remember("stripe", event.id, event.type);
  }

  async handleTamaraWebhook(token: string | null, body: { order_id?: string; event_type?: string; order_status?: string }) {
    await this.bnpl.verifyNotification(token);
    if (!body.order_id) return;
    const eventId = `${body.order_id}:${body.event_type ?? body.order_status ?? "update"}`;
    if (await this.seen("tamara", eventId)) return;
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.provider, "tamara"), eq(payments.providerRef, body.order_id)))
      .limit(1);
    if (payment) await this.reconcile(payment);
    await this.remember("tamara", eventId, body.event_type ?? "update");
  }

  // ------------------------------------------------------------ admin

  async listForAdmin(filter: { status?: PaymentStatus[] | undefined; limit: number }) {
    const rows = await this.db
      .select({ payment: payments, reference: bookings.reference })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .where(filter.status?.length ? inArray(payments.status, filter.status) : undefined)
      .orderBy(desc(payments.createdAt))
      .limit(filter.limit);
    return rows.map((r) => ({ ...this.view(r.payment), bookingReference: r.reference }));
  }

  /** Refunds part or all of what is left on a payment. */
  async refund(paymentId: string, admin: Actor, input: { amountMinor?: number | undefined; reason: string }) {
    let payment = await this.reconcile(await this.load(paymentId));
    if (!SETTLED.includes(payment.status) || payment.status === "refunded") {
      throw conflict("not_refundable", "Only captured payments with a balance can be refunded");
    }
    const remaining = payment.amountMinor - payment.refundedMinor;
    const amount = input.amountMinor ?? remaining;
    if (amount <= 0 || amount > remaining) throw badRequest("invalid_amount", `You can refund up to ${CURRENCY} ${remaining / 100}`);

    if (payment.provider === "stripe") await this.card.refund(payment.providerRef!, amount, input.reason);
    else await this.bnpl.refund(payment.providerRef!, amount, payment.currency, input.reason);

    const refunded = payment.refundedMinor + amount;
    const [after] = await this.db
      .update(payments)
      .set({ refundedMinor: refunded, status: refunded >= payment.amountMinor ? "refunded" : "partially_refunded", updatedAt: new Date() })
      .where(eq(payments.id, payment.id))
      .returning();
    payment = after!;
    await this.db.insert(bookingEvents).values({
      bookingId: payment.bookingId,
      type: "refund",
      actorId: admin.id === "system" ? null : admin.id,
      actorRole: admin.role,
      data: { paymentId, amountMinor: amount, reason: input.reason },
    });
    await this.rollUp(payment.bookingId);
    void this.notifications.notify([payment.customerId], {
      title: "Refund issued",
      body: `${CURRENCY} ${amount / 100} is on its way back to you. It can take 5–10 working days to appear.`,
      data: { type: "booking", bookingId: payment.bookingId },
    });
    return this.view(payment);
  }

  // ------------------------------------------------------------ internals

  /**
   * Brings our record in line with the provider, which is always the source of truth.
   * Safe to call any number of times, from webhooks, the app or an admin.
   */
  async reconcile(payment: Payment): Promise<Payment> {
    if (!payment.providerRef) return payment;
    let next: { status: PaymentStatus; refundedMinor: number; failureReason?: string | null };

    if (payment.provider === "stripe") {
      const intent = await this.card.getIntent(payment.providerRef);
      const refunded = Math.max(payment.refundedMinor, intent.amountRefundedMinor);
      next =
        intent.status === "captured"
          ? { status: refundStatus(refunded, payment.amountMinor), refundedMinor: refunded }
          : { status: intent.status, refundedMinor: refunded, failureReason: intent.failureReason };
    } else {
      let order = await this.bnpl.getOrder(payment.providerRef);
      // Approved means the customer finished on Tamara's side; we confirm and take the money.
      if (order.status === "approved") {
        await this.bnpl.authorise(order.orderId);
        order = { ...order, status: "authorised" };
      }
      if (order.status === "authorised") {
        await this.bnpl.capture(order.orderId, payment.amountMinor, payment.currency);
        order = { ...order, status: "captured" };
      }
      const refunded = Math.max(payment.refundedMinor, order.refundedMinor);
      next =
        order.status === "captured" || order.status === "refunded" || order.status === "partially_refunded"
          ? { status: refundStatus(refunded, payment.amountMinor), refundedMinor: refunded }
          : order.status === "declined" || order.status === "expired"
            ? { status: "failed", refundedMinor: refunded, failureReason: `Tamara order ${order.status}` }
            : order.status === "cancelled"
              ? { status: "cancelled", refundedMinor: refunded }
              : { status: "pending", refundedMinor: refunded };
    }

    if (next.status === payment.status && next.refundedMinor === payment.refundedMinor) return payment;
    const becameCaptured = !SETTLED.includes(payment.status) && SETTLED.includes(next.status);
    // Compare-and-set on the old status so two concurrent reconciles announce once.
    const [updated] = await this.db
      .update(payments)
      .set({
        status: next.status,
        refundedMinor: next.refundedMinor,
        ...(next.failureReason !== undefined ? { failureReason: next.failureReason } : {}),
        ...(becameCaptured ? { capturedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(payments.id, payment.id), eq(payments.status, payment.status)))
      .returning();
    if (!updated) return this.load(payment.id);

    await this.rollUp(updated.bookingId);
    if (becameCaptured) await this.onCaptured(updated);
    return updated;
  }

  private async onCaptured(payment: Payment) {
    const [booking] = await this.db.select().from(bookings).where(eq(bookings.id, payment.bookingId)).limit(1);
    await this.db.insert(bookingEvents).values({
      bookingId: payment.bookingId,
      type: "payment",
      actorId: payment.customerId,
      actorRole: "customer",
      data: { paymentId: payment.id, provider: payment.provider, amountMinor: payment.amountMinor },
    });
    const amount = `${CURRENCY} ${payment.amountMinor / 100}`;
    void this.notifications.notify([payment.customerId], {
      title: "Payment received",
      body: `Thank you! ${amount} received for ${booking?.reference ?? "your booking"}.`,
      data: { type: "booking", bookingId: payment.bookingId },
    });
    void this.notifications.notifyAdmins({
      title: `Paid: ${booking?.reference}`,
      body: `${amount} via ${payment.provider === "stripe" ? "card" : "Tamara"}`,
      data: { type: "booking", bookingId: payment.bookingId },
    });
    // A booking cancelled while the customer was still paying gets its money back.
    if (booking?.status === "cancelled") await this.settleCancelledBooking(booking);
  }

  /** On cancellation: stop unfinished payments and refund what was paid. */
  private async settleCancelledBooking(booking: Booking) {
    const rows = await this.db.select().from(payments).where(eq(payments.bookingId, booking.id));
    for (const p of rows) {
      try {
        if (p.status === "pending" && p.providerRef && p.provider === "stripe") {
          await this.card.cancelIntent(p.providerRef);
          await this.db.update(payments).set({ status: "cancelled", updatedAt: new Date() }).where(eq(payments.id, p.id));
        } else if (p.status === "authorised" && p.providerRef && p.provider === "tamara") {
          await this.bnpl.cancel(p.providerRef, p.amountMinor, p.currency);
          await this.db.update(payments).set({ status: "cancelled", updatedAt: new Date() }).where(eq(payments.id, p.id));
        } else if (p.status === "captured" || p.status === "partially_refunded") {
          await this.refund(p.id, { id: "system", role: "admin" }, { reason: `Booking ${booking.reference} cancelled` });
        }
      } catch (err) {
        this.log.error({ err, paymentId: p.id }, "automatic refund/cancel failed");
        void this.notifications.notifyAdmins({
          title: `Refund needed: ${booking.reference}`,
          body: "The automatic refund failed. Please refund this payment manually from the dashboard.",
          data: { type: "payment", paymentId: p.id, bookingId: booking.id },
        });
      }
    }
    await this.rollUp(booking.id);
  }

  private async retirePendingAttempts(bookingId: string) {
    const pending = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.bookingId, bookingId), inArray(payments.status, ["pending", "authorised"])));
    for (const p of pending) {
      const synced = await this.reconcile(p);
      if (SETTLED.includes(synced.status)) throw conflict("already_paid", "This booking is already paid");
      if (synced.status === "authorised") throw conflict("payment_in_progress", "A Tamara payment is being completed. Please wait a moment.");
      if (synced.status === "pending") {
        if (synced.provider === "stripe" && synced.providerRef) await this.card.cancelIntent(synced.providerRef).catch(() => undefined);
        await this.db
          .update(payments)
          .set({ status: "cancelled", failureReason: "Replaced by a new attempt", updatedAt: new Date() })
          .where(and(eq(payments.id, synced.id), eq(payments.status, "pending")));
      }
    }
  }

  /** Recomputes the booking's payment summary from its payments. */
  private async rollUp(bookingId: string) {
    const rows = await this.db.select().from(payments).where(eq(payments.bookingId, bookingId));
    const settled = rows.filter((p) => SETTLED.includes(p.status));
    const paid = settled.reduce((n, p) => n + p.amountMinor, 0);
    const refunded = settled.reduce((n, p) => n + p.refundedMinor, 0);
    const status = settled.length
      ? refunded >= paid
        ? "refunded"
        : refunded > 0
          ? "partially_refunded"
          : "paid"
      : rows.some((p) => p.status === "pending" || p.status === "authorised")
        ? "pending"
        : "unpaid";
    const method = settled.at(-1)?.provider ?? rows.find((p) => p.status === "pending")?.provider;
    await this.db
      .update(bookings)
      .set({
        paymentStatus: status,
        ...(method ? { paymentMethod: method === "stripe" ? "card" : "tamara" } : {}),
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId));
  }

  private async markBookingPending(booking: Booking, method: PayMethod) {
    await this.db
      .update(bookings)
      .set({ paymentStatus: "pending", paymentMethod: method, updatedAt: new Date() })
      .where(and(eq(bookings.id, booking.id), ne(bookings.paymentStatus, "paid")));
  }

  private async payable(bookingId: string, customer: Actor): Promise<Booking> {
    const booking = await this.bookingsSvc.loadFor(bookingId, customer);
    if (booking.customerId !== customer.id) throw notFound("Booking");
    if (booking.status === "cancelled" || booking.status === "completed") throw conflict("not_payable", "This booking is closed");
    if (booking.priceAed == null) throw conflict("awaiting_quote", "We'll send your price after the survey. You can pay then.");
    if (booking.paymentStatus === "paid" || booking.paymentStatus === "partially_refunded") {
      throw conflict("already_paid", "This booking is already paid");
    }
    return booking;
  }

  private async load(paymentId: string): Promise<Payment> {
    const [p] = await this.db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (!p) throw notFound("Payment");
    return p;
  }

  private async seen(provider: "stripe" | "tamara", eventId: string) {
    const [row] = await this.db
      .select({ id: paymentWebhookEvents.eventId })
      .from(paymentWebhookEvents)
      .where(and(eq(paymentWebhookEvents.provider, provider), eq(paymentWebhookEvents.eventId, eventId)))
      .limit(1);
    return Boolean(row);
  }

  private async remember(provider: "stripe" | "tamara", eventId: string, type: string) {
    await this.db.insert(paymentWebhookEvents).values({ provider, eventId, type }).onConflictDoNothing();
  }

  /** VAT contained in a VAT-inclusive amount. */
  private vatMinor(totalMinor: number) {
    return Math.round(totalMinor - totalMinor / (1 + this.config.vatRate));
  }

  view(p: Payment) {
    return {
      id: p.id,
      bookingId: p.bookingId,
      method: p.provider === "stripe" ? "card" : "tamara",
      status: p.status,
      amountAed: p.amountMinor / 100,
      refundedAed: p.refundedMinor / 100,
      vatAed: this.vatMinor(p.amountMinor) / 100,
      currency: p.currency,
      instalments: p.instalments,
      failureReason: p.failureReason,
      capturedAt: p.capturedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    };
  }
}

function refundStatus(refundedMinor: number, amountMinor: number): PaymentStatus {
  return refundedMinor <= 0 ? "captured" : refundedMinor >= amountMinor ? "refunded" : "partially_refunded";
}
