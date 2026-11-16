import type { SocialProfile, SocialProvider, SocialVerifier } from "../src/modules/auth/providers/types.js";
import { unauthorized } from "../src/lib/errors.js";
import type { HostedCardGateway, HostedCardOrder } from "../src/modules/payments/gateways.js";

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

/** A stand-in for Ziina: payment pages, status checks, refunds and signed webhooks ("good" passes). */
export class FakeZiina implements HostedCardGateway {
  configured = true;
  name = "Ziina";
  provider = "ziina" as const;
  intents = new Map<string, { status: HostedCardOrder["status"]; amountMinor: number }>();
  refunds: { intentId: string; amountMinor: number }[] = [];
  private n = 0;

  async createOrder(i: { amountMinor: number }) {
    const id = `zi_${++this.n}`;
    this.intents.set(id, { status: "pending", amountMinor: i.amountMinor });
    return { orderRef: id, paymentUrl: `https://pay.ziina.test/${id}` };
  }
  async getOrder(id: string): Promise<HostedCardOrder> {
    const intent = this.intents.get(id)!;
    return { orderRef: id, status: intent.status, refundedMinor: 0, failureReason: intent.status === "failed" ? "Card declined" : null };
  }
  async refund(intentId: string, amountMinor: number) {
    this.refunds.push({ intentId, amountMinor });
  }
  verifyWebhook(_raw: Buffer, signature: string | null) {
    if (signature !== "good") throw unauthorized("bad sig", "invalid_signature");
  }
  /** Simulates the customer finishing payment on Ziina's page. */
  succeed(id: string) {
    this.intents.get(id)!.status = "captured";
  }
}
