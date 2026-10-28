import { timingSafeEqual } from "node:crypto";
import { unauthorized } from "../../lib/errors.js";
import type { HostedCardGateway, HostedCardOrder } from "./gateways.js";

type FetchLike = typeof fetch;

const PAYMENT_TYPE = "application/vnd.ni-payment.v2+json";
const IDENTITY_TYPE = "application/vnd.ni-identity.v1+json";

interface NiPayment {
  state?: string;
  authResponse?: { resultMessage?: string };
  _links?: Record<string, { href: string } | undefined>;
  _embedded?: Record<string, { state?: string; amount?: { value: number }; _links?: Record<string, { href: string } | undefined> }[] | undefined>;
}

interface NiOrder {
  reference: string;
  _links?: { payment?: { href: string } };
  _embedded?: { payment?: NiPayment[] };
}

/**
 * Network International N-Genius: the customer pays on N-Genius's secure page (card, Apple Pay,
 * Google Pay as enabled on the outlet), then comes back to the app. The order is always re-read
 * from N-Genius; redirect parameters and webhook bodies are never trusted on their own.
 */
export class NGeniusGateway implements HostedCardGateway {
  readonly name = "Network International";
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    private readonly outletRef: string | undefined,
    private readonly webhookSecret: string | undefined,
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  get configured() {
    return Boolean(this.apiKey && this.outletRef);
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const res = await this.fetchFn(`${this.baseUrl}/identity/auth/access-token`, {
      method: "POST",
      headers: { Authorization: `Basic ${this.apiKey}`, "Content-Type": IDENTITY_TYPE, Accept: IDENTITY_TYPE },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`N-Genius sign-in failed: ${res.status} ${text.slice(0, 300)}`);
    const body = JSON.parse(text) as { access_token: string; expires_in?: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 300) * 1000 };
    return this.token.value;
  }

  private async call<T>(method: "GET" | "POST", url: string, body?: unknown): Promise<T> {
    if (!this.configured) throw new Error("Network International is not configured");
    const res = await this.fetchFn(url.startsWith("http") ? url : `${this.baseUrl}${url}`, {
      method,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, "Content-Type": PAYMENT_TYPE, Accept: PAYMENT_TYPE },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`N-Genius ${method} failed: ${res.status} ${text.slice(0, 500)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  private orderPath(orderRef: string) {
    return `/transactions/outlets/${encodeURIComponent(this.outletRef!)}/orders/${encodeURIComponent(orderRef)}`;
  }

  async createOrder(i: Parameters<HostedCardGateway["createOrder"]>[0]) {
    const order = await this.call<NiOrder>("POST", `/transactions/outlets/${encodeURIComponent(this.outletRef!)}/orders`, {
      action: "PURCHASE",
      amount: { currencyCode: i.currency, value: i.amountMinor },
      merchantOrderReference: i.paymentId,
      ...(i.email ? { emailAddress: i.email } : {}),
      language: i.language,
      merchantAttributes: {
        redirectUrl: i.redirectUrl,
        cancelUrl: i.cancelUrl,
        cancelText: "Back to Xtreme",
        skipConfirmationPage: true,
        merchantOrderReference: i.reference,
      },
    });
    const paymentUrl = order._links?.payment?.href;
    if (!order.reference || !paymentUrl) throw new Error("N-Genius did not return a payment page");
    return { orderRef: order.reference, paymentUrl };
  }

  async getOrder(orderRef: string): Promise<HostedCardOrder> {
    const order = await this.call<NiOrder>("GET", this.orderPath(orderRef));
    const payment = order._embedded?.payment?.[0];
    const state = payment?.state ?? "STARTED";
    const refunds = payment?._embedded?.["cnp:refund"] ?? [];
    const refundedMinor = refunds.filter((r) => !r.state || r.state === "SUCCESS").reduce((n, r) => n + (r.amount?.value ?? 0), 0);
    const status: HostedCardOrder["status"] = ["PURCHASED", "CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(state)
      ? "captured"
      : ["FAILED", "DECLINED"].includes(state)
        ? "failed"
        : ["REVERSED", "CANCELLED"].includes(state)
          ? "cancelled"
          : "pending";
    return { orderRef, status, refundedMinor, failureReason: status === "failed" ? (payment?.authResponse?.resultMessage ?? `Payment ${state.toLowerCase()}`) : null };
  }

  async refund(orderRef: string, amountMinor: number, currency: string) {
    const order = await this.call<NiOrder>("GET", this.orderPath(orderRef));
    const payment = order._embedded?.payment?.[0];
    // Purchases carry the refund link on the payment; sales on their capture.
    const href = payment?._links?.["cnp:refund"]?.href ?? payment?._embedded?.["cnp:capture"]?.[0]?._links?.["cnp:refund"]?.href;
    if (!href) throw new Error("This N-Genius payment cannot be refunded online; refund it in the N-Genius portal");
    await this.call("POST", href, { amount: { currencyCode: currency, value: amountMinor } });
  }

  verifyWebhook(headerValue: string | null) {
    // Without a configured secret every webhook still only triggers a re-read from N-Genius.
    if (!this.webhookSecret) return;
    const a = Buffer.from(headerValue ?? "");
    const b = Buffer.from(this.webhookSecret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw unauthorized("Invalid webhook");
  }
}
