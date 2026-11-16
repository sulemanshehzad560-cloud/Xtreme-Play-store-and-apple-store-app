import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { book, createTestApp, resetDb, signInAs, signInPhone, type TestContext } from "./helpers.js";

// A small stand-in for the Ziina API: payment intents and refunds.
const ZIINA = "https://api-v2.ziina.com/api";
const intents = new Map<string, { status: string; body: Record<string, unknown> }>();
const refunds: Record<string, unknown>[] = [];
let refundStatus = "pending";
const fakeFetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  expect(url.startsWith(ZIINA)).toBe(true);
  expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer zi-key");
  if (init?.method === "POST" && url.endsWith("/payment_intent")) {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const id = `pi-${intents.size + 1}`;
    intents.set(id, { status: "requires_payment_instrument", body });
    return json({ id, amount: body.amount, status: "requires_payment_instrument", redirect_url: `https://pay.ziina.com/${id}` }, 201);
  }
  const get = url.match(/\/payment_intent\/(pi-\d+)$/);
  if (get) {
    const pi = intents.get(get[1]!)!;
    return json({ id: get[1], amount: pi.body.amount, status: pi.status, latest_error: pi.status === "failed" ? { message: "Card declined" } : null });
  }
  if (init?.method === "POST" && url.endsWith("/refund")) {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    refunds.push(body);
    return json({ id: body.id, payment_intent_id: body.payment_intent_id, amount: body.amount, currency_code: "AED", status: refundStatus, error: refundStatus === "failed" ? { message: "Insufficient balance" } : null });
  }
  return json({ message: `unexpected ${url}` }, 404);
});

const secret = createHmac("sha256", "zi-key").update("xtreme-ziina-webhook").digest("hex");
const sign = (body: string, key = secret) => createHmac("sha256", key).update(body).digest("hex");

let t: TestContext;
beforeAll(async () => {
  vi.stubGlobal("fetch", fakeFetch);
  t = await createTestApp({ ZIINA_API_KEY: "zi-key" });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await t.app.close();
});
beforeEach(async () => {
  await resetDb();
  refunds.length = 0;
  refundStatus = "pending";
});

describe("card payments (Ziina)", () => {
  it("pays on the Ziina page, confirms on return, takes signed webhooks and refunds", async () => {
    const me = await signInPhone(t, undefined, "Sara Al Mansoori");
    const admin = await signInAs(t, "admin");
    const booking = await book(t, me.auth); // AED 150

    const start = await t.app.inject({ method: "POST", url: `/v1/bookings/${booking.id}/payments`, headers: me.auth, payload: { method: "card" } });
    expect(start.statusCode).toBe(201);
    const { paymentId, provider, hosted, stripe } = start.json();
    expect(provider).toBe("ziina");
    expect(stripe).toBeUndefined();
    const id = [...intents.keys()].at(-1)!;
    expect(hosted).toEqual({ url: `https://pay.ziina.com/${id}`, returnUrlPrefix: "xtreme://payments/" });
    const pi = intents.get(id)!;
    expect(pi.body).toMatchObject({ amount: 15000, currency_code: "AED", test: false, allow_tips: false });
    expect(pi.body.success_url).toContain(`/v1/payments/ziina/return?paymentId=${paymentId}&result=done`);
    expect(pi.body.cancel_url).toContain(`/v1/payments/ziina/return?paymentId=${paymentId}&result=cancel`);

    // Coming back before paying is not a success; after paying it is.
    const early = await t.app.inject({ method: "GET", url: `/v1/payments/ziina/return?paymentId=${paymentId}&result=done` });
    expect(early.headers.location).toBe(`xtreme://payments/${paymentId}?result=pending`);
    pi.status = "completed";
    const back = await t.app.inject({ method: "GET", url: `/v1/payments/ziina/return?paymentId=${paymentId}&result=done` });
    expect(back.headers.location).toBe(`xtreme://payments/${paymentId}?result=success`);
    const detail = (await t.app.inject({ method: "GET", url: `/v1/bookings/${booking.id}`, headers: me.auth })).json();
    expect(detail).toMatchObject({ paymentStatus: "paid", paymentMethod: "card" });

    // Webhooks must carry a valid HMAC of the exact body, and only trigger a re-read.
    const payload = JSON.stringify({ event: "payment_intent.status.updated", data: { id, status: "completed" } });
    const hook = (signature: string) =>
      t.app.inject({ method: "POST", url: "/v1/webhooks/ziina", headers: { "content-type": "application/json", "x-hmac-signature": signature }, payload });
    expect((await hook(sign(payload, "wrong-secret"))).statusCode).toBe(401);
    expect((await hook("")).statusCode).toBe(401);
    expect((await hook(sign(payload))).statusCode).toBe(200);

    // Partial refund from the dashboard goes to Ziina.
    const refund = await t.app.inject({ method: "POST", url: `/v1/admin/payments/${paymentId}/refund`, headers: admin.auth, payload: { amountAed: 50, reason: "Goodwill" } });
    expect(refund.statusCode).toBe(200);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ payment_intent_id: id, amount: 5000, currency_code: "AED" });
    expect(refund.json()).toMatchObject({ status: "partially_refunded", refundedAed: 50, method: "card" });

    // A later status re-read from Ziina keeps the refund we recorded.
    const again = await hook(sign(payload));
    expect(again.statusCode).toBe(200);
    const payments = (await t.app.inject({ method: "GET", url: `/v1/admin/payments`, headers: admin.auth })).json();
    const row = (Array.isArray(payments) ? payments : payments.items).find((p: { id: string }) => p.id === paymentId);
    expect(row).toMatchObject({ status: "partially_refunded", refundedAed: 50 });
  });

  it("a refused refund is reported and nothing is marked refunded", async () => {
    const me = await signInPhone(t);
    const admin = await signInAs(t, "admin");
    const booking = await book(t, me.auth);
    const { paymentId } = (await t.app.inject({ method: "POST", url: `/v1/bookings/${booking.id}/payments`, headers: me.auth, payload: { method: "card" } })).json();
    intents.get([...intents.keys()].at(-1)!)!.status = "completed";
    await t.app.inject({ method: "GET", url: `/v1/payments/ziina/return?paymentId=${paymentId}&result=done` });
    refundStatus = "failed";
    const refund = await t.app.inject({ method: "POST", url: `/v1/admin/payments/${paymentId}/refund`, headers: admin.auth, payload: { reason: "Test" } });
    expect(refund.statusCode).toBeGreaterThanOrEqual(400);
    const detail = (await t.app.inject({ method: "GET", url: `/v1/bookings/${booking.id}`, headers: me.auth })).json();
    expect(detail.paymentStatus).toBe("paid");
  });

  it("a failed or cancelled page leaves the booking unpaid", async () => {
    const me = await signInPhone(t);
    const booking = await book(t, me.auth);
    const { paymentId } = (await t.app.inject({ method: "POST", url: `/v1/bookings/${booking.id}/payments`, headers: me.auth, payload: { method: "card" } })).json();
    intents.get([...intents.keys()].at(-1)!)!.status = "failed";
    const back = await t.app.inject({ method: "GET", url: `/v1/payments/ziina/return?paymentId=${paymentId}&result=done` });
    expect(back.headers.location).toBe(`xtreme://payments/${paymentId}?result=failure`);
    const detail = (await t.app.inject({ method: "GET", url: `/v1/bookings/${booking.id}`, headers: me.auth })).json();
    expect(detail.paymentStatus).toBe("unpaid");

    const cancel = await t.app.inject({ method: "GET", url: `/v1/payments/ziina/return?paymentId=${paymentId}&result=cancel` });
    expect(cancel.headers.location).toBe(`xtreme://payments/${paymentId}?result=cancel`);
  });
});
