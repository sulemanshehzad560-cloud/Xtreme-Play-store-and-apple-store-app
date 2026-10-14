import { jwtVerify } from "jose";
import { unauthorized } from "../../lib/errors.js";
import type { BnplCheckoutInput, BnplGateway, BnplOrder, BnplOrderStatus } from "./gateways.js";

type FetchLike = typeof fetch;

/**
 * Tamara "buy now, pay later". Flow: create a checkout session, send the customer to
 * Tamara's page, then on the approved notification authorise and capture the order.
 * Webhook bodies are never trusted on their own: the order is re-read from Tamara.
 */
export class TamaraGateway implements BnplGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly apiToken: string | undefined,
    private readonly notificationToken: string | undefined,
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  get configured() {
    return Boolean(this.apiToken && this.notificationToken);
  }

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    if (!this.apiToken) throw new Error("Tamara is not configured");
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Tamara ${method} ${path} failed: ${res.status} ${text.slice(0, 500)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  async eligibility(input: { amountMinor: number; currency: string; phone: string }) {
    try {
      const res = await this.call<{ has_available_payment_options?: boolean; available_payment_labels?: { payment_type: string; instalment: number }[] }>(
        "POST",
        "/checkout/payment-options-pre-check",
        { country: "AE", phone_number: input.phone, total_amount: money(input.amountMinor, input.currency) },
      );
      const best = res.available_payment_labels?.find((l) => l.payment_type === "PAY_BY_INSTALMENTS");
      return {
        eligible: Boolean(res.has_available_payment_options),
        label: best ? `Split into ${best.instalment} interest-free payments` : null,
      };
    } catch {
      return { eligible: false, label: null };
    }
  }

  async createCheckout(i: BnplCheckoutInput) {
    const total = money(i.amountMinor, i.currency);
    const [first, ...rest] = [i.consumer.firstName, i.consumer.lastName];
    const res = await this.call<{ order_id: string; checkout_url: string }>("POST", "/checkout", {
      order_reference_id: i.paymentId,
      order_number: i.reference,
      total_amount: total,
      description: i.description,
      country_code: "AE",
      payment_type: "PAY_BY_INSTALMENTS",
      instalments: i.instalments,
      locale: i.locale,
      items: [
        {
          reference_id: i.item.reference,
          type: "Service",
          name: i.item.name,
          sku: i.item.sku,
          quantity: 1,
          total_amount: total,
          unit_price: total,
          tax_amount: money(i.taxMinor, i.currency),
        },
      ],
      consumer: { first_name: first, last_name: rest.join(" ") || first, phone_number: i.consumer.phone, email: i.consumer.email },
      shipping_address: {
        first_name: first,
        last_name: rest.join(" ") || first,
        line1: i.address.line1,
        city: i.address.city,
        country_code: i.address.countryCode,
        phone_number: i.consumer.phone,
      },
      tax_amount: money(i.taxMinor, i.currency),
      shipping_amount: money(0, i.currency),
      merchant_url: i.urls,
      platform: "Xtreme-Home Partner app",
      is_mobile: true,
    });
    return { orderId: res.order_id, checkoutUrl: res.checkout_url };
  }

  async getOrder(orderId: string): Promise<BnplOrder> {
    const o = await this.call<{
      order_id: string;
      status: string;
      captured_amount?: { amount: number };
      refunded_amount?: { amount: number };
    }>("GET", `/orders/${encodeURIComponent(orderId)}`);
    return {
      orderId: o.order_id,
      status: mapStatus(o.status),
      capturedMinor: toMinor(o.captured_amount?.amount ?? 0),
      refundedMinor: toMinor(o.refunded_amount?.amount ?? 0),
    };
  }

  async authorise(orderId: string) {
    await this.call("POST", `/orders/${encodeURIComponent(orderId)}/authorise`);
  }

  async capture(orderId: string, amountMinor: number, currency: string) {
    await this.call("POST", "/payments/capture", {
      order_id: orderId,
      total_amount: money(amountMinor, currency),
      shipping_info: { shipped_at: new Date().toISOString(), shipping_company: "Xtreme Facilities Management (service)" },
    });
  }

  async cancel(orderId: string, amountMinor: number, currency: string) {
    await this.call("POST", `/orders/${encodeURIComponent(orderId)}/cancel`, { total_amount: money(amountMinor, currency) });
  }

  async refund(orderId: string, amountMinor: number, currency: string, comment: string) {
    await this.call("POST", `/payments/simplified-refund/${encodeURIComponent(orderId)}`, {
      total_amount: money(amountMinor, currency),
      comment: comment.slice(0, 250),
    });
  }

  async verifyNotification(token: string | null) {
    if (!token || !this.notificationToken) throw unauthorized("Missing Tamara token", "invalid_signature");
    try {
      await jwtVerify(token, new TextEncoder().encode(this.notificationToken), { algorithms: ["HS256"] });
    } catch {
      throw unauthorized("Invalid Tamara token", "invalid_signature");
    }
  }
}

const money = (minor: number, currency: string) => ({ amount: minor / 100, currency });
const toMinor = (amount: number) => Math.round(amount * 100);

function mapStatus(s: string): BnplOrderStatus {
  switch (s) {
    case "approved":
      return "approved";
    case "authorised":
      return "authorised";
    case "fully_captured":
    case "partially_captured":
    case "captured":
      return "captured";
    case "declined":
      return "declined";
    case "expired":
      return "expired";
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "fully_refunded":
      return "refunded";
    case "partially_refunded":
      return "partially_refunded";
    default:
      return "pending";
  }
}
