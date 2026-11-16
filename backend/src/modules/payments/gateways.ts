// Gateway seam. The payment service talks to this interface only, so tests use a fake.

/** A card payment taken on the provider's own secure page (Ziina). */
export interface HostedCardOrder {
  orderRef: string;
  status: "pending" | "captured" | "failed" | "cancelled";
  refundedMinor: number;
  failureReason: string | null;
}

export type HostedProvider = "ziina";

export interface HostedCardGateway {
  readonly configured: boolean;
  readonly name: string;
  /** Stored on the payment so refunds and status checks go back to the same provider. */
  readonly provider: HostedProvider;
  createOrder(input: {
    paymentId: string;
    reference: string;
    amountMinor: number;
    currency: string;
    email: string | null;
    redirectUrl: string;
    cancelUrl: string;
    language: "en" | "ar";
  }): Promise<{ orderRef: string; paymentUrl: string }>;
  getOrder(orderRef: string): Promise<HostedCardOrder>;
  refund(orderRef: string, amountMinor: number, currency: string): Promise<void>;
  /** Checks a webhook's signature over its exact body. Throws if it is wrong. */
  verifyWebhook(rawBody: Buffer, signature: string | null): void;
}
