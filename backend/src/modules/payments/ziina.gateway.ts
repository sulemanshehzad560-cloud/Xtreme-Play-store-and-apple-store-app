import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { unauthorized } from "../../lib/errors.js";
import type { HostedCardGateway, HostedCardOrder } from "./gateways.js";

type FetchLike = typeof fetch;

/** Ziina payment intent, as returned by POST/GET /payment_intent. Amounts are in fils. */
interface ZiinaIntent {
  id: string;
  amount: number;
  status: "requires_payment_instrument" | "requires_user_action" | "pending" | "completed" | "failed" | "canceled";
  redirect_url?: string;
  latest_error?: { message?: string; code?: string } | null;
}

interface ZiinaRefund {
  id: string;
  status: "pending" | "completed" | "failed";
  error?: { message?: string } | null;
}

/**
 * Ziina (UAE): the customer pays on Ziina's secure page (card, Apple Pay, Google Pay), then
 * comes back to the app. The payment intent is always re-read from Ziina;
 * redirects and webhook bodies only tell us when to look.
 *
 * Ziina reports refunds separately from the payment intent, so refunded amounts are tracked
 * on our side when the refund is issued.
 */
export class ZiinaGateway implements HostedCardGateway {
  readonly name = "Ziina";
  readonly provider = "ziina" as const;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    private readonly opts: { webhookSecret?: string | undefined },
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  get configured() {
    return Boolean(this.apiKey);
  }

  /** Secret Ziina signs webhooks with. Derived from the API key unless one is set. */
  get webhookSecret(): string | null {
    if (this.opts.webhookSecret) return this.opts.webhookSecret;
    if (!this.apiKey) return null;
    return createHmac("sha256", this.apiKey).update("xtreme-ziina-webhook").digest("hex");
  }

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    if (!this.configured) throw new Error("Ziina is not configured");
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Ziina ${method} ${path} failed: ${res.status} ${text.slice(0, 500)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  async createOrder(i: Parameters<HostedCardGateway["createOrder"]>[0]) {
    const intent = await this.call<ZiinaIntent>("POST", "/payment_intent", {
      amount: i.amountMinor,
      currency_code: i.currency,
      message: `Xtreme booking ${i.reference}`,
      success_url: i.redirectUrl,
      cancel_url: i.cancelUrl,
      failure_url: i.redirectUrl,
      // Always live: real payments only.
      test: false,
      allow_tips: false,
    });
    if (!intent.id || !intent.redirect_url) throw new Error("Ziina did not return a payment page");
    return { orderRef: intent.id, paymentUrl: intent.redirect_url };
  }

  async getOrder(orderRef: string): Promise<HostedCardOrder> {
    const intent = await this.call<ZiinaIntent>("GET", `/payment_intent/${encodeURIComponent(orderRef)}`);
    const status: HostedCardOrder["status"] =
      intent.status === "completed" ? "captured" : intent.status === "failed" ? "failed" : intent.status === "canceled" ? "cancelled" : "pending";
    return {
      orderRef,
      status,
      refundedMinor: 0,
      failureReason: status === "failed" ? (intent.latest_error?.message ?? "Payment failed") : null,
    };
  }

  async refund(orderRef: string, amountMinor: number, currency: string) {
    const refund = await this.call<ZiinaRefund>("POST", "/refund", {
      id: randomUUID(),
      payment_intent_id: orderRef,
      amount: amountMinor,
      currency_code: currency,
      test: false,
    });
    if (refund.status === "failed") throw new Error(`Ziina refused the refund: ${refund.error?.message ?? "unknown reason"}`);
  }

  /** Points Ziina's webhooks at our server. Ziina keeps one URL per account, so this simply overwrites it. */
  async registerWebhook(url: string) {
    const res = await this.call<{ success: boolean; error?: string }>("POST", "/webhook", { url, secret: this.webhookSecret });
    if (!res.success) throw new Error(`Ziina webhook setup failed: ${res.error ?? "unknown error"}`);
  }

  /** Checks the X-Hmac-Signature header: hex SHA-256 HMAC of the exact request body. */
  verifySignature(rawBody: Buffer, signature: string | null) {
    const secret = this.webhookSecret;
    if (!secret) throw unauthorized("Invalid webhook");
    const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
    const given = Buffer.from((signature ?? "").trim().toLowerCase());
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw unauthorized("Invalid webhook");
  }

  verifyWebhook(rawBody: Buffer, signature: string | null) {
    this.verifySignature(rawBody, signature);
  }
}
