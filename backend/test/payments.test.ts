import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { book, createTestApp, resetDb, signInAs, signInPhone, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.app.close());
beforeEach(resetDb);

const post = (url: string, auth: Record<string, string>, payload: unknown = {}) => t.app.inject({ method: "POST", url, headers: auth, payload: payload as object });
const get = (url: string, auth: Record<string, string>) => t.app.inject({ method: "GET", url, headers: auth });
const stripeHook = (body: object, signature = "good") =>
  t.app.inject({ method: "POST", url: "/v1/webhooks/stripe", headers: { "stripe-signature": signature, "content-type": "application/json" }, payload: JSON.stringify(body) });

async function profiled() {
  const me = await signInPhone(t, undefined, "Sara Al Mansoori");
  await t.app.inject({ method: "PATCH", url: "/v1/me", headers: me.auth, payload: { email: "sara@example.com" } });
  return me;
}

describe("card payments (Stripe)", () => {
  it("shows options with VAT and pays through PaymentSheet + webhook", async () => {
    const me = await profiled();
    const booking = await book(t, me.auth); // deep, 2bhk apartment = AED 450

    const options = (await get(`/v1/bookings/${booking.id}/payment-options`, me.auth)).json();
    expect(options.amount).toEqual({ totalAed: 450, vatAed: 21.43, vatIncluded: true, currency: "AED" });
    expect(options.methods.map((m: { method: string; available: boolean }) => [m.method, m.available])).toEqual([["card", true], ["tamara", true], ["cash", true]]);

    const start = await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "card" });
    expect(start.statusCode).toBe(201);
    const { paymentId, stripe } = start.json();
    expect(stripe).toMatchObject({ publishableKey: "pk_test_fake", customerEphemeralKeySecret: "ek_test", currency: "AED" });
    const intentId = [...t.card.intents.keys()].at(-1)!;
    expect(t.card.intents.get(intentId)!.amountMinor).toBe(45000);
    expect((await get(`/v1/bookings/${booking.id}`, me.auth)).json().paymentStatus).toBe("pending");

    // Bad signatures are rejected; good ones reconcile with Stripe and are processed once.
    expect((await stripeHook({ id: "evt_1", type: "payment_intent.succeeded", intentId }, "forged")).statusCode).toBe(401);
    t.card.succeed(intentId);
    expect((await stripeHook({ id: "evt_1", type: "payment_intent.succeeded", intentId })).statusCode).toBe(200);
    await stripeHook({ id: "evt_1", type: "payment_intent.succeeded", intentId });

    const detail = (await get(`/v1/bookings/${booking.id}`, me.auth)).json();
    expect(detail).toMatchObject({ paymentStatus: "paid", paymentMethod: "card", canPay: false });
    const inbox = (await get("/v1/me/notifications", me.auth)).json();
    expect(inbox.filter((n: { title: string }) => n.title === "Payment received")).toHaveLength(1);
    expect((await get(`/v1/bookings/${booking.id}/payments`, me.auth)).json()[0]).toMatchObject({ id: paymentId, status: "captured", amountAed: 450 });

    // Can't pay twice.
    expect((await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "card" })).json().error.code).toBe("already_paid");
  });

  it("replaces an abandoned attempt instead of charging twice", async () => {
    const me = await profiled();
    const booking = await book(t, me.auth);
    await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "card" });
    const first = [...t.card.intents.keys()].at(-1)!;
    await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "card" });
    expect(t.card.cancelled).toContain(first);
    const list = (await get(`/v1/bookings/${booking.id}/payments`, me.auth)).json();
    expect(list.map((p: { status: string }) => p.status)).toEqual(["pending", "cancelled"]);
  });

  it("refunds automatically when a paid booking is cancelled", async () => {
    const me = await profiled();
    const booking = await book(t, me.auth);
    const { paymentId } = (await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "card" })).json();
    const intentId = [...t.card.intents.keys()].at(-1)!;
    t.card.succeed(intentId);
    await post(`/v1/payments/${paymentId}/sync`, me.auth);

    const cancelled = await post(`/v1/bookings/${booking.id}/cancel`, me.auth, { reason: "Travelling" });
    expect(cancelled.statusCode).toBe(200);
    expect(t.card.refunds).toEqual([{ intentId, amountMinor: 45000 }]);
    const detail = (await get(`/v1/bookings/${booking.id}`, me.auth)).json();
    expect(detail.paymentStatus).toBe("refunded");
    expect(detail.timeline.some((e: { type: string }) => e.type === "refund")).toBe(true);
  });

  it("supports partial refunds by the office and blocks repricing paid bookings", async () => {
    const me = await profiled();
    const admin = await signInAs(t, "admin");
    const booking = await book(t, me.auth);
    const { paymentId } = (await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "card" })).json();
    t.card.succeed([...t.card.intents.keys()].at(-1)!);
    await post(`/v1/payments/${paymentId}/sync`, me.auth);

    expect((await post(`/v1/admin/bookings/${booking.id}/price`, admin.auth, { priceAed: 500 })).json().error.code).toBe("already_paid");
    const part = await post(`/v1/admin/payments/${paymentId}/refund`, admin.auth, { amountAed: 50, reason: "Late arrival" });
    expect(part.json()).toMatchObject({ status: "partially_refunded", refundedAed: 50 });
    const over = await post(`/v1/admin/payments/${paymentId}/refund`, admin.auth, { amountAed: 401, reason: "Too much" });
    expect(over.json().error.code).toBe("invalid_amount");
    expect((await get(`/v1/bookings/${booking.id}`, me.auth)).json().paymentStatus).toBe("partially_refunded");
  });

  it("only lets customers pay once a survey price is set", async () => {
    const me = await profiled();
    const admin = await signInAs(t, "admin");
    const booking = await book(t, me.auth, { serviceKey: "pest" });
    expect((await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "card" })).json().error.code).toBe("awaiting_quote");
    await post(`/v1/admin/bookings/${booking.id}/price`, admin.auth, { priceAed: 275 });
    expect((await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "card" })).statusCode).toBe(201);
    expect([...t.card.intents.values()].at(-1)!.amountMinor).toBe(27500);
  });
});

describe("Tamara (pay later)", () => {
  it("creates a checkout, then authorises and captures on the approved notification", async () => {
    const me = await profiled();
    const booking = await book(t, me.auth);
    const start = await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "tamara" });
    expect(start.statusCode).toBe(201);
    expect(start.json().tamara.checkoutUrl).toMatch(/^https:\/\/checkout\.tamara\.test\//);

    const checkout = t.tamara.checkouts.at(-1)!;
    expect(checkout).toMatchObject({
      amountMinor: 45000,
      taxMinor: 2143,
      instalments: 4,
      consumer: { firstName: "Sara", lastName: "Al Mansoori", email: "sara@example.com" },
      urls: { notification: "https://api.xtreme.test/v1/webhooks/tamara" },
    });
    const orderId = [...t.tamara.orders.keys()].at(-1)!;

    const forged = await t.app.inject({ method: "POST", url: "/v1/webhooks/tamara?tamaraToken=bad", headers: { "content-type": "application/json" }, payload: JSON.stringify({ order_id: orderId, event_type: "order_approved" }) });
    expect(forged.statusCode).toBe(401);

    t.tamara.approve(orderId);
    const hook = await t.app.inject({ method: "POST", url: "/v1/webhooks/tamara?tamaraToken=tamara-ok", headers: { "content-type": "application/json" }, payload: JSON.stringify({ order_id: orderId, event_type: "order_approved" }) });
    expect(hook.statusCode).toBe(200);
    expect(t.tamara.calls).toEqual([`authorise:${orderId}`, `capture:${orderId}:45000`]);
    expect((await get(`/v1/bookings/${booking.id}`, me.auth)).json()).toMatchObject({ paymentStatus: "paid", paymentMethod: "tamara" });
  });

  it("sends the customer back to the app after checkout", async () => {
    const me = await profiled();
    const booking = await book(t, me.auth);
    const { paymentId } = (await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "tamara" })).json();
    t.tamara.approve([...t.tamara.orders.keys()].at(-1)!);
    const res = await t.app.inject({ method: "GET", url: `/v1/payments/tamara/return?paymentId=${paymentId}&result=success` });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`xtreme://payments/${paymentId}?result=success`);
    expect((await get(`/v1/bookings/${booking.id}`, me.auth)).json().paymentStatus).toBe("paid");
  });

  it("needs an email and name for Tamara", async () => {
    const me = await signInPhone(t);
    const booking = await book(t, me.auth);
    expect((await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "tamara" })).json().error.code).toBe("email_required");
  });
});
