import Stripe from "stripe";
import { unauthorized } from "../../lib/errors.js";
import type { CardGateway, CardIntent } from "./gateways.js";

/**
 * Stripe card payments. The app shows Stripe's PaymentSheet, which handles card entry,
 * 3-D Secure, saved cards, Apple Pay and Google Pay, so card data never touches our servers.
 */
export class StripeGateway implements CardGateway {
  private readonly stripe: Stripe | null;

  constructor(
    secretKey: string | undefined,
    readonly publishableKey: string | undefined,
    private readonly webhookSecret: string | undefined,
  ) {
    this.stripe = secretKey ? new Stripe(secretKey, { maxNetworkRetries: 2, appInfo: { name: "xtreme-backend" } }) : null;
  }

  get configured() {
    return Boolean(this.stripe && this.publishableKey);
  }

  private client(): Stripe {
    if (!this.stripe) throw new Error("Stripe is not configured");
    return this.stripe;
  }

  async ensureCustomer(user: { id: string; email: string | null; name: string | null; phone: string | null; existingId: string | null }) {
    if (user.existingId) return user.existingId;
    const customer = await this.client().customers.create(
      {
        email: user.email ?? undefined,
        name: user.name ?? undefined,
        phone: user.phone ?? undefined,
        metadata: { userId: user.id },
      },
      { idempotencyKey: `customer:${user.id}` },
    );
    return customer.id;
  }

  async sheetSession(customerId: string) {
    const key = await this.client().ephemeralKeys.create({ customer: customerId }, { apiVersion: "2024-06-20" });
    return { customerId, ephemeralKey: key.secret! };
  }

  async createIntent(input: Parameters<CardGateway["createIntent"]>[0]): Promise<CardIntent> {
    const pi = await this.client().paymentIntents.create(
      {
        amount: input.amountMinor,
        currency: input.currency.toLowerCase(),
        customer: input.customerId,
        description: input.description,
        metadata: { ...input.metadata, paymentId: input.paymentId },
        automatic_payment_methods: { enabled: true },
        setup_future_usage: "off_session",
      },
      { idempotencyKey: `payment:${input.paymentId}` },
    );
    return toIntent(pi);
  }

  async getIntent(id: string) {
    return toIntent(await this.client().paymentIntents.retrieve(id, { expand: ["latest_charge"] }));
  }

  async cancelIntent(id: string) {
    await this.client().paymentIntents.cancel(id);
  }

  async refund(intentId: string, amountMinor: number, reason: string) {
    await this.client().refunds.create({
      payment_intent: intentId,
      amount: amountMinor,
      reason: "requested_by_customer",
      metadata: { note: reason.slice(0, 450) },
    });
  }

  parseWebhook(rawBody: Buffer, signature: string) {
    if (!this.webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
    let event: Stripe.Event;
    try {
      event = this.client().webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw unauthorized("Invalid Stripe signature", "invalid_signature");
    }
    const obj = event.data.object as { object?: string; id?: string; payment_intent?: string | { id: string } | null };
    const intentId =
      obj.object === "payment_intent"
        ? (obj.id ?? null)
        : typeof obj.payment_intent === "string"
          ? obj.payment_intent
          : (obj.payment_intent?.id ?? null);
    return { id: event.id, type: event.type, intentId };
  }
}

function toIntent(pi: Stripe.PaymentIntent): CardIntent {
  const charge = typeof pi.latest_charge === "object" && pi.latest_charge ? pi.latest_charge : null;
  const status: CardIntent["status"] =
    pi.status === "succeeded"
      ? "captured"
      : pi.status === "canceled"
        ? "cancelled"
        : pi.last_payment_error && pi.status === "requires_payment_method"
          ? "failed"
          : "pending";
  return {
    id: pi.id,
    clientSecret: pi.client_secret ?? "",
    status,
    amountMinor: pi.amount,
    amountRefundedMinor: charge?.amount_refunded ?? 0,
    failureReason: pi.last_payment_error?.message ?? null,
  };
}
