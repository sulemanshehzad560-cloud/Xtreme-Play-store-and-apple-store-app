import type { SocialProfile, SocialProvider, SocialVerifier } from "../src/modules/auth/providers/types.js";
import { unauthorized } from "../src/lib/errors.js";
import type { BnplCheckoutInput, BnplGateway, BnplOrder, CardGateway, CardIntent } from "../src/modules/payments/gateways.js";

/** Accepts tokens of the form "valid:<subject>:<email>". */
export class FakeVerifier implements SocialVerifier {
  configured = true;
  constructor(readonly provider: SocialProvider) {}
  async verify(token: string): Promise<SocialProfile> {
    const [kind, subject, email] = token.split(":");
    if (kind !== "valid" || !subject) throw unauthorized("bad token", "invalid_provider_token");
    return { provider: this.provider, subject, email: email ?? null, emailVerified: true, name: "Social User", picture: null };
  }
}

export class FakeCard implements CardGateway {
  configured = true;
  publishableKey = "pk_test_fake";
  intents = new Map<string, CardIntent>();
  refunds: { intentId: string; amountMinor: number }[] = [];
  cancelled: string[] = [];
  private n = 0;

  async ensureCustomer(u: { existingId: string | null }) {
    return u.existingId ?? `cus_${++this.n}`;
  }
  async sheetSession(customerId: string) {
    return { customerId, ephemeralKey: "ek_test" };
  }
  async createIntent(i: { amountMinor: number }) {
    const intent: CardIntent = { id: `pi_${++this.n}`, clientSecret: `pi_secret_${this.n}`, status: "pending", amountMinor: i.amountMinor, amountRefundedMinor: 0, failureReason: null };
    this.intents.set(intent.id, intent);
    return intent;
  }
  async getIntent(id: string) {
    return { ...this.intents.get(id)! };
  }
  async cancelIntent(id: string) {
    this.cancelled.push(id);
    this.intents.get(id)!.status = "cancelled";
  }
  async refund(intentId: string, amountMinor: number) {
    this.refunds.push({ intentId, amountMinor });
    this.intents.get(intentId)!.amountRefundedMinor += amountMinor;
  }
  parseWebhook(raw: Buffer, signature: string) {
    if (signature !== "good") throw unauthorized("bad sig", "invalid_signature");
    const e = JSON.parse(raw.toString()) as { id: string; type: string; intentId: string };
    return { id: e.id, type: e.type, intentId: e.intentId };
  }
  /** Simulates the customer finishing the PaymentSheet. */
  succeed(id: string) {
    this.intents.get(id)!.status = "captured";
  }
}

export class FakeTamara implements BnplGateway {
  configured = true;
  orders = new Map<string, BnplOrder & { amountMinor: number }>();
  checkouts: BnplCheckoutInput[] = [];
  calls: string[] = [];
  private n = 0;

  async eligibility() {
    return { eligible: true, label: "Split into 4 interest-free payments" };
  }
  async createCheckout(i: BnplCheckoutInput) {
    this.checkouts.push(i);
    const orderId = `tam_${++this.n}`;
    this.orders.set(orderId, { orderId, status: "pending", capturedMinor: 0, refundedMinor: 0, amountMinor: i.amountMinor });
    return { orderId, checkoutUrl: `https://checkout.tamara.test/${orderId}` };
  }
  async getOrder(id: string) {
    const { amountMinor: _a, ...o } = this.orders.get(id)!;
    return { ...o };
  }
  async authorise(id: string) {
    this.calls.push(`authorise:${id}`);
    this.orders.get(id)!.status = "authorised";
  }
  async capture(id: string, amountMinor: number) {
    this.calls.push(`capture:${id}:${amountMinor}`);
    const o = this.orders.get(id)!;
    o.status = "captured";
    o.capturedMinor = amountMinor;
  }
  async cancel(id: string) {
    this.calls.push(`cancel:${id}`);
    this.orders.get(id)!.status = "cancelled";
  }
  async refund(id: string, amountMinor: number) {
    this.calls.push(`refund:${id}:${amountMinor}`);
    this.orders.get(id)!.refundedMinor += amountMinor;
  }
  async verifyNotification(token: string | null) {
    if (token !== "tamara-ok") throw unauthorized("bad token", "invalid_signature");
  }
  approve(id: string) {
    this.orders.get(id)!.status = "approved";
  }
}
