import type { FastifyBaseLogger } from "fastify";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { bookingAssignments, bookingEvents, bookings, paymentWebhookEvents, payments, users, type Booking, type Payment, type PaymentStatus } from "../../db/schema.js";
import { COMPANY } from "../../config/company.js";
import { badRequest, conflict, notFound, unauthorized } from "../../lib/errors.js";
import type { Actor, BookingService } from "../bookings/booking.service.js";
import { serviceName } from "../catalog/catalog.js";
import type { NotificationService } from "../notifications/notification.service.js";
import type { BnplGateway, CardGateway, HostedCardGateway, HostedProvider } from "./gateways.js";
import { ZiinaGateway } from "./ziina.gateway.js";

export interface PaymentConfig {
  vatRate: number;
  companyTrn?: string | undefined;
  publicUrl: string;
  appScheme: string;
  merchantName: string;
  tamaraInstalments: number;
  /** Fee added to Tamara payments, in percent. */
  tamaraFeePercent: number;
  /** Fee added to card payments, in percent. */
  cardFeePercent: number;
  /** Flat service fee added to every payment, in AED. */
  serviceFeeAed: number;
  /** Service charge added to every payment, in percent of the amount due. */
  serviceFeePercent: number;
  /** Cash bookings: percent of the total paid online as a deposit. */
  cashDepositPercent: number;
}

export type PayMethod = "card" | "tamara" | "cash";

const CURRENCY = COMPANY.currency;
const SETTLED: PaymentStatus[] = ["captured", "partially_refunded", "refunded"];

export class PaymentService {
  private readonly paidListeners: ((bookingId: string) => Promise<void>)[] = [];

  /** Called after a payment is captured (e.g. to email the invoice for a completed job). */
  onPaid(listener: (bookingId: string) => Promise<void>) {
    this.paidListeners.push(listener);
  }

  constructor(
    private readonly db: Database,
    private readonly bookingsSvc: BookingService,
    private readonly notifications: NotificationService,
    private readonly card: CardGateway,
    private readonly hosted: HostedCardGateway,
    private readonly bnpl: BnplGateway,
    private readonly config: PaymentConfig,
    private readonly log: FastifyBaseLogger,
    /** Every hosted-page provider we can still reach, so older payments are refunded where they were made. */
    private readonly hostedByProvider: Partial<Record<HostedProvider, HostedCardGateway>> = {},
  ) {
    bookingsSvc.onStatusChange(async (booking, _from) => {
      if (booking.status === "cancelled") await this.settleCancelledBooking(booking);
      if (booking.status === "completed") await this.thankTeam(booking.id).catch((err: unknown) => this.log.error({ err }, "tip notification failed"));
    });
  }

  // ------------------------------------------------------------ customer

  /** What the checkout screen offers for this booking. */
  async options(bookingId: string, customer: Actor) {
    const booking = await this.payable(bookingId, customer);
    const amountMinor = dueMinor(booking);
    const serviceFee = this.serviceFeeMinor(amountMinor);
    const cardFee = this.methodFeeMinor("card", amountMinor);
    const cash = this.cashSplit(amountMinor + serviceFee);
    return {
      bookingId,
      amount: {
        priceAed: booking.priceAed!,
        discountAed: booking.discountAed,
        totalAed: amountMinor / 100,
        serviceFeeAed: serviceFee / 100,
        serviceFeePercent: this.config.serviceFeePercent,
        vatAed: this.vatMinor(amountMinor) / 100,
        vatIncluded: true,
        currency: CURRENCY,
      },
      promoCode: booking.promoCode,
      methods: [
        {
          method: "card",
          available: this.cardAvailable,
          label: "Credit / debit card, Apple Pay or Google Pay",
          feePercent: this.config.cardFeePercent,
          feeAed: (serviceFee + cardFee) / 100,
          totalAed: (amountMinor + serviceFee + cardFee) / 100,
        },
        {
          method: "cash",
          available: this.cardAvailable,
          label: `Cash on the day: pay ${this.config.cashDepositPercent}% now to confirm`,
          feePercent: 0,
          feeAed: serviceFee / 100,
          totalAed: (amountMinor + serviceFee) / 100,
          depositPercent: this.config.cashDepositPercent,
          depositAed: cash.depositMinor / 100,
          cashDueAed: cash.balanceMinor / 100,
        },
      ],
    };
  }

  /** Starts (or restarts) paying for a booking with card or Tamara. */
  async start(bookingId: string, customer: Actor, method: PayMethod, opts: { locale?: "en" | "ar" | undefined; tipAed?: number | undefined } = {}) {
    const booking = await this.payable(bookingId, customer);
    if ((method === "card" || method === "cash") && !this.cardAvailable) throw badRequest("method_unavailable", "Card payments are not available right now");
    if (method === "tamara") throw badRequest("method_unavailable", "Tamara is no longer offered. Please pay by card or choose cash.");
    const [user] = await this.db.select().from(users).where(eq(users.id, customer.id)).limit(1);
    if (!user) throw notFound("Account");

    await this.retirePendingAttempts(booking.id);

    const serviceFeeMinor = this.serviceFeeMinor(dueMinor(booking));
    const feeMinor = serviceFeeMinor + (method === "cash" ? 0 : this.methodFeeMinor(method, dueMinor(booking)));
    const tipMinor = Math.max(0, Math.round((opts.tipAed ?? 0) * 100));
    // Cash: only the deposit (plus any tip) is paid online now; the rest is collected on the day.
    const cash = method === "cash" ? this.cashSplit(dueMinor(booking) + serviceFeeMinor) : null;
    const amountMinor = cash ? cash.depositMinor + tipMinor : dueMinor(booking) + feeMinor + tipMinor;
    const [payment] = await this.db
      .insert(payments)
      .values({
        bookingId: booking.id,
        customerId: customer.id,
        provider: this.hosted.configured ? this.hosted.provider : "stripe",
        amountMinor,
        feeMinor,
        serviceFeeMinor,
        tipMinor,
        currency: CURRENCY,
        instalments: null,
        kind: cash ? "deposit" : "full",
        balanceMinor: cash?.balanceMinor ?? 0,
      })
      .returning();
    const itemName = serviceName(booking.serviceKey);
    const description = cash ? `Deposit · ${itemName} · ${booking.reference}` : `${itemName} · ${booking.reference}`;

    try {
      // Network International or Ziina: the customer pays on the provider's secure page, then returns to the app.
      if (this.hosted.configured) {
        const ret = (result: string) => `${this.config.publicUrl}/v1/payments/${this.hosted.provider}/return?paymentId=${payment!.id}&result=${result}`;
        const order = await this.hosted.createOrder({
          paymentId: payment!.id,
          reference: booking.reference,
          amountMinor,
          currency: CURRENCY,
          email: user.email,
          redirectUrl: ret("done"),
          cancelUrl: ret("cancel"),
          language: opts.locale === "ar" ? "ar" : "en",
        });
        await this.db
          .update(payments)
          .set({ providerRef: order.orderRef, checkoutUrl: order.paymentUrl, updatedAt: new Date() })
          .where(eq(payments.id, payment!.id));
        await this.markBookingPending(booking, method);
        return {
          paymentId: payment!.id,
          provider: this.hosted.provider,
          status: "pending" as const,
          hosted: { url: order.paymentUrl, returnUrlPrefix: `${this.config.appScheme}://payments/` },
        };
      }

      // Stripe's in-app payment sheet.
      {
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
        await this.markBookingPending(booking, method);
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

  /**
   * Tax invoice for a paid booking. Prices are VAT-inclusive, so the invoice is the one
   * place the VAT amount is broken out.
   */
  async invoice(bookingId: string, actor: Actor) {
    const booking = await this.bookingsSvc.loadFor(bookingId, actor);
    if (!["paid", "partially_refunded", "refunded"].includes(booking.paymentStatus) || booking.priceAed == null) {
      throw conflict("not_paid", "The invoice is available once the booking is paid");
    }
    const settled = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.bookingId, booking.id), inArray(payments.status, ["captured", "partially_refunded", "refunded"])))
      .orderBy(desc(payments.capturedAt));
    const paid = settled[0];
    const sum = (f: (p: Payment) => number) => settled.reduce((n, p) => n + f(p), 0);
    const [customer] = await this.db.select().from(users).where(eq(users.id, booking.customerId)).limit(1);
    const totalMinor = settled.length ? sum((p) => p.amountMinor) : dueMinor(booking);
    const tipMinor = sum((p) => p.tipMinor);
    const feeMinor = sum((p) => p.feeMinor);
    const serviceFeeMinor = sum((p) => p.serviceFeeMinor);
    const cashMinor = sum((p) => (p.kind === "cash" ? p.amountMinor : 0));
    const methodFeeMinor = feeMinor - serviceFeeMinor;
    const discountMinor = booking.priceAed * 100 - (totalMinor - feeMinor - tipMinor);
    // The tip goes to the team in full and is not part of the VAT-able price.
    const vatMinor = this.vatMinor(totalMinor - tipMinor);
    const a = booking.address;
    return {
      invoiceNumber: `INV-${booking.reference.replace(/^XT-/, "")}`,
      issuedAt: (paid?.capturedAt ?? booking.updatedAt).toISOString(),
      bookingReference: booking.reference,
      seller: {
        name: COMPANY.name,
        trn: this.config.companyTrn ?? null,
        address: `${COMPANY.address.line1}, ${COMPANY.address.city}, ${COMPANY.address.country}`,
        phone: COMPANY.phoneDisplay,
        email: COMPANY.email,
      },
      customer: {
        name: customer?.fullName ?? null,
        phone: customer?.phone ?? null,
        email: customer?.email ?? null,
        address: [a.unit, a.building, a.street, a.area].filter(Boolean).join(", "),
      },
      lines: [
        {
          description: `${serviceName(booking.serviceKey)} (${booking.propertyType}, ${booking.propertySize.toUpperCase()})`,
          serviceDate: booking.scheduledAt.toISOString(),
          amountAed: booking.priceAed,
        },
        ...(discountMinor > 0 ? [{ description: "Promotional discount", serviceDate: null, amountAed: -discountMinor / 100 }] : []),
        ...(serviceFeeMinor > 0 ? [{ description: "Service fee", serviceDate: null, amountAed: serviceFeeMinor / 100 }] : []),
        ...(methodFeeMinor > 0
          ? [{ description: paid?.provider === "tamara" ? "Tamara instalment fee" : "Card processing fee", serviceDate: null, amountAed: methodFeeMinor / 100 }]
          : []),
        ...(tipMinor > 0 ? [{ description: "Tip for your team (passed on in full)", serviceDate: null, amountAed: tipMinor / 100 }] : []),
      ],
      currency: CURRENCY,
      vatRate: this.config.vatRate,
      subtotalAed: (totalMinor - tipMinor - vatMinor) / 100,
      vatAed: vatMinor / 100,
      totalAed: totalMinor / 100,
      refundedAed: sum((p) => p.refundedMinor) / 100,
      payment: paid
        ? {
            method: cashMinor > 0 ? `Card deposit ${CURRENCY} ${(totalMinor - cashMinor) / 100} + cash ${CURRENCY} ${cashMinor / 100}` : paid.provider === "tamara" ? "Tamara" : "Card",
            paidAt: paid.capturedAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  /**
   * The team (or an admin) confirms they collected the cash balance of a cash booking.
   * Records it as a payment so the booking shows as paid and the invoice is sent.
   */
  async collectCash(bookingId: string, actor: Actor) {
    const booking = await this.bookingsSvc.loadFor(bookingId, actor);
    if (actor.role === "customer") throw notFound("Booking");
    if (booking.paymentStatus !== "deposit_paid" || booking.cashDueMinor <= 0) {
      throw conflict("no_cash_due", "There is no cash to collect for this booking");
    }
    const [row] = await this.db
      .insert(payments)
      .values({
        bookingId: booking.id,
        customerId: booking.customerId,
        provider: "cash",
        kind: "cash",
        status: "captured",
        amountMinor: booking.cashDueMinor,
        currency: CURRENCY,
        providerRef: `cash-${booking.id}`,
        capturedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (!row) throw conflict("no_cash_due", "The cash for this booking is already recorded");
    await this.db.insert(bookingEvents).values({
      bookingId: booking.id,
      type: "cash_collected",
      actorId: actor.id,
      actorRole: actor.role,
      data: { paymentId: row.id, amountMinor: row.amountMinor },
    });
    await this.rollUp(booking.id);
    await this.onCaptured(row);
    return this.view(row);
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

  /** Ziina tells us a payment intent or refund changed; we re-read the payment from Ziina. */
  async handleZiinaWebhook(rawBody: Buffer, signature: string | null) {
    const ziina = this.hostedByProvider.ziina;
    if (!ziina || !(ziina instanceof ZiinaGateway)) throw unauthorized("Invalid webhook");
    ziina.verifySignature(rawBody, signature);
    let body: { event?: string; data?: { id?: string; payment_intent_id?: string } } = {};
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw badRequest("bad_webhook", "Invalid JSON");
    }
    const intentId = body.event === "refund.status.updated" ? body.data?.payment_intent_id : body.data?.id;
    if (!intentId) return;
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.provider, "ziina"), eq(payments.providerRef, intentId)))
      .limit(1);
    if (payment) await this.reconcile(payment);
  }

  async handleNGeniusWebhook(secret: string | null, body: { eventId?: string; eventName?: string; order?: { reference?: string } }) {
    this.hostedFor("ngenius").verifyWebhook(secret);
    const orderRef = body.order?.reference;
    if (!orderRef) return;
    const eventId = body.eventId ?? `${orderRef}:${body.eventName ?? "update"}`;
    if (await this.seen("ngenius", eventId)) return;
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.provider, "ngenius"), eq(payments.providerRef, orderRef)))
      .limit(1);
    if (payment) await this.reconcile(payment);
    await this.remember("ngenius", eventId, body.eventName ?? "update");
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
    else if (payment.provider === "ngenius" || payment.provider === "ziina") await this.hostedFor(payment.provider).refund(payment.providerRef!, amount, payment.currency);
    else if (payment.provider === "tamara") await this.bnpl.refund(payment.providerRef!, amount, payment.currency, input.reason);
    // Cash: the money is handed back in person; we only record it.

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
    if (!payment.providerRef || payment.provider === "cash") return payment;
    let next: { status: PaymentStatus; refundedMinor: number; failureReason?: string | null };

    if (payment.provider === "ngenius" || payment.provider === "ziina") {
      const order = await this.hostedFor(payment.provider).getOrder(payment.providerRef);
      const refunded = Math.max(payment.refundedMinor, order.refundedMinor);
      next =
        order.status === "captured"
          ? { status: refundStatus(refunded, payment.amountMinor), refundedMinor: refunded }
          : { status: order.status, refundedMinor: refunded, failureReason: order.failureReason };
    } else if (payment.provider === "stripe") {
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
      body:
        payment.kind === "deposit"
          ? `${amount} card deposit · ${CURRENCY} ${payment.balanceMinor / 100} cash to collect on the day`
          : `${amount} via ${payment.kind === "cash" ? "cash" : payment.provider === "tamara" ? "Tamara" : "card"}`,
      data: { type: "booking", bookingId: payment.bookingId },
    });
    // Tips paid after the job (e.g. a quote paid on completion) reach the team now; others when the job is done.
    if (payment.tipMinor > 0 && booking?.status === "completed") await this.thankTeam(payment.bookingId);
    // A booking cancelled while the customer was still paying gets its money back.
    if (booking?.status === "cancelled") await this.settleCancelledBooking(booking);
    for (const listener of this.paidListeners) await listener(payment.bookingId).catch((err: unknown) => this.log.error({ err }, "paid listener failed"));
  }

  /** Tells the booking's team about the customer's tip (paid tips only). */
  async thankTeam(bookingId: string) {
    const rows = await this.db.select({ tip: payments.tipMinor }).from(payments).where(and(eq(payments.bookingId, bookingId), inArray(payments.status, SETTLED)));
    const tipMinor = rows.reduce((n, r) => n + r.tip, 0);
    if (tipMinor <= 0) return;
    const team = await this.db.select({ id: bookingAssignments.staffId }).from(bookingAssignments).where(eq(bookingAssignments.bookingId, bookingId));
    const [b] = await this.db.select({ reference: bookings.reference }).from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!team.length) return;
    await this.notifications.notify(
      team.map((m) => m.id),
      { title: `You got an ${CURRENCY} ${tipMinor / 100} tip!`, body: `Thank you from the customer for ${b?.reference ?? "your job"}.`, data: { type: "booking", bookingId } },
    );
  }

  /** On cancellation: stop unfinished payments and refund what was paid. */
  private async settleCancelledBooking(booking: Booking) {
    const rows = await this.db.select().from(payments).where(eq(payments.bookingId, booking.id));
    for (const p of rows) {
      try {
        if (p.status === "pending" && p.providerRef && (p.provider === "stripe" || p.provider === "ngenius" || p.provider === "ziina")) {
          // An unfinished N-Genius or Ziina page simply expires; Stripe intents are cancelled.
          if (p.provider === "stripe") await this.card.cancelIntent(p.providerRef);
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
    // A cash booking whose deposit is in but whose cash is not yet collected.
    const deposit = settled.find((p) => p.kind === "deposit");
    const awaitingCash = Boolean(deposit) && !settled.some((p) => p.kind === "cash") && refunded === 0;
    const status = settled.length
      ? refunded >= paid
        ? "refunded"
        : refunded > 0
          ? "partially_refunded"
          : awaitingCash
            ? "deposit_paid"
            : "paid"
      : rows.some((p) => p.status === "pending" || p.status === "authorised")
        ? "pending"
        : "unpaid";
    const latest = settled.at(-1) ?? rows.find((p) => p.status === "pending");
    const method = latest ? (latest.kind !== "full" ? "cash" : latest.provider === "tamara" ? "tamara" : "card") : null;
    await this.db
      .update(bookings)
      .set({
        paymentStatus: status,
        cashDueMinor: awaitingCash ? deposit!.balanceMinor : 0,
        ...(method ? { paymentMethod: method } : {}),
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
    // Completed jobs stay payable: a price quoted on site is often paid once the work is done.
    if (booking.status === "cancelled") throw conflict("not_payable", "This booking is closed");
    if (booking.priceAed == null) throw conflict("awaiting_quote", "We'll send your price after the survey. You can pay then.");
    if (booking.paymentStatus === "included" || booking.priceAed <= 0) throw conflict("nothing_to_pay", "This visit is included in your subscription");
    if (booking.paymentStatus === "paid" || booking.paymentStatus === "partially_refunded" || booking.paymentStatus === "deposit_paid") {
      throw conflict("already_paid", "This booking is already paid");
    }
    // Promotions are re-checked right before paying, so an ended offer no longer applies.
    return this.bookingsSvc.reprice(booking);
  }

  private async load(paymentId: string): Promise<Payment> {
    const [p] = await this.db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (!p) throw notFound("Payment");
    return p;
  }

  /** Splits a cash booking's total into the online deposit and whole-dirham cash due on the day. */
  private cashSplit(totalMinor: number) {
    const balanceMinor = Math.floor((totalMinor * (100 - this.config.cashDepositPercent)) / 100 / 100) * 100;
    return { depositMinor: totalMinor - balanceMinor, balanceMinor };
  }

  private hostedFor(provider: HostedProvider): HostedCardGateway {
    return this.hostedByProvider[provider] ?? this.hosted;
  }

  private get cardAvailable() {
    return this.hosted.configured || this.card.configured;
  }

  private async seen(provider: "stripe" | "tamara" | "ngenius", eventId: string) {
    const [row] = await this.db
      .select({ id: paymentWebhookEvents.eventId })
      .from(paymentWebhookEvents)
      .where(and(eq(paymentWebhookEvents.provider, provider), eq(paymentWebhookEvents.eventId, eventId)))
      .limit(1);
    return Boolean(row);
  }

  private async remember(provider: "stripe" | "tamara" | "ngenius", eventId: string, type: string) {
    await this.db.insert(paymentWebhookEvents).values({ provider, eventId, type }).onConflictDoNothing();
  }

  /** Card or Tamara fee on the amount due, as set in the dashboard's price list. */
  private methodFeeMinor(method: PayMethod, amountMinor: number) {
    const pct = method === "tamara" ? this.config.tamaraFeePercent : this.config.cardFeePercent;
    return Math.round((amountMinor * pct) / 100);
  }

  /** Flat service fee plus the percentage service charge on the amount due. */
  private serviceFeeMinor(amountMinor: number) {
    return Math.round(this.config.serviceFeeAed * 100) + Math.round((amountMinor * this.config.serviceFeePercent) / 100);
  }

  /** VAT contained in a VAT-inclusive amount. */
  private vatMinor(totalMinor: number) {
    return Math.round(totalMinor - totalMinor / (1 + this.config.vatRate));
  }

  view(p: Payment) {
    return {
      id: p.id,
      bookingId: p.bookingId,
      method: p.kind === "cash" ? "cash" : p.provider === "tamara" ? "tamara" : "card",
      kind: p.kind,
      status: p.status,
      amountAed: p.amountMinor / 100,
      cashDueAed: p.kind === "deposit" ? p.balanceMinor / 100 : 0,
      refundedAed: p.refundedMinor / 100,
      vatAed: this.vatMinor(p.amountMinor - p.tipMinor) / 100,
      tipAed: p.tipMinor / 100,
      currency: p.currency,
      instalments: p.instalments,
      failureReason: p.failureReason,
      capturedAt: p.capturedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    };
  }
}

/** What the customer pays: the price less any promotional discount. */
function dueMinor(b: Booking) {
  return (b.priceAed! - b.discountAed) * 100;
}

function refundStatus(refundedMinor: number, amountMinor: number): PaymentStatus {
  return refundedMinor <= 0 ? "captured" : refundedMinor >= amountMinor ? "refunded" : "partially_refunded";
}
