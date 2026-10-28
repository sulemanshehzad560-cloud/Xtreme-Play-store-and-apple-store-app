// Gateway seams. The payment service talks to these interfaces only, so tests use fakes
// and another card acquirer (e.g. Network International, Checkout.com) can be swapped in.

export interface CardIntent {
  id: string;
  clientSecret: string;
  status: "pending" | "captured" | "failed" | "cancelled";
  amountMinor: number;
  amountRefundedMinor: number;
  failureReason: string | null;
}

export interface CardSheetSession {
  customerId: string;
  ephemeralKey: string;
}

export interface CardWebhookEvent {
  id: string;
  type: string;
  /** PaymentIntent id the event is about, if any. */
  intentId: string | null;
}

export interface CardGateway {
  readonly configured: boolean;
  readonly publishableKey: string | undefined;
  ensureCustomer(user: { id: string; email: string | null; name: string | null; phone: string | null; existingId: string | null }): Promise<string>;
  sheetSession(customerId: string): Promise<CardSheetSession>;
  createIntent(input: {
    paymentId: string;
    amountMinor: number;
    currency: string;
    customerId: string;
    description: string;
    metadata: Record<string, string>;
  }): Promise<CardIntent>;
  getIntent(id: string): Promise<CardIntent>;
  cancelIntent(id: string): Promise<void>;
  refund(intentId: string, amountMinor: number, reason: string): Promise<void>;
  /** Verifies the signature and returns the event, or throws. */
  parseWebhook(rawBody: Buffer, signature: string): CardWebhookEvent;
}

export type BnplOrderStatus = "pending" | "approved" | "authorised" | "captured" | "declined" | "expired" | "cancelled" | "refunded" | "partially_refunded";

export interface BnplOrder {
  orderId: string;
  status: BnplOrderStatus;
  capturedMinor: number;
  refundedMinor: number;
}

export interface BnplCheckoutInput {
  paymentId: string;
  reference: string;
  amountMinor: number;
  taxMinor: number;
  currency: string;
  description: string;
  instalments: number;
  item: { reference: string; name: string; sku: string };
  consumer: { firstName: string; lastName: string; phone: string; email: string };
  address: { line1: string; city: string; countryCode: string };
  urls: { success: string; failure: string; cancel: string; notification: string };
  locale: "en_US" | "ar_SA";
}

export interface BnplGateway {
  readonly configured: boolean;
  eligibility(input: { amountMinor: number; currency: string; phone: string }): Promise<{ eligible: boolean; label: string | null }>;
  createCheckout(input: BnplCheckoutInput): Promise<{ orderId: string; checkoutUrl: string }>;
  getOrder(orderId: string): Promise<BnplOrder>;
  authorise(orderId: string): Promise<void>;
  capture(orderId: string, amountMinor: number, currency: string): Promise<void>;
  cancel(orderId: string, amountMinor: number, currency: string): Promise<void>;
  refund(orderId: string, amountMinor: number, currency: string, comment: string): Promise<void>;
  /** Checks the webhook's signed token. Throws if it is missing or invalid. */
  verifyNotification(token: string | null): Promise<void>;
}

/** A card payment taken on the acquirer's own secure page (e.g. Network International N-Genius). */
export interface HostedCardOrder {
  orderRef: string;
  status: "pending" | "captured" | "failed" | "cancelled";
  refundedMinor: number;
  failureReason: string | null;
}

export interface HostedCardGateway {
  readonly configured: boolean;
  readonly name: string;
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
  /** Checks the shared secret header on a webhook. Throws if it is wrong. */
  verifyWebhook(headerValue: string | null): void;
}
