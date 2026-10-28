import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { book, createTestApp, resetDb, signInAs, signInPhone, type TestContext } from "./helpers.js";

// A small stand-in for the N-Genius API: sign-in, orders, order status and refunds.
const NI = "https://api-gateway.sandbox.ngenius-payments.com";
const orders = new Map<string, { state: string; amount: number; body: Record<string, unknown>; refunds: number[] }>();
const fakeFetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (url.endsWith("/identity/auth/access-token")) {
    expect((init?.headers as Record<string, string>).Authorization).toBe("Basic ni-key");
    return json({ access_token: "ni-token", expires_in: 300 });
  }
  expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer ni-token");
  const refund = url.match(/\/refund\/(ord-\d+)$/);
  if (refund) {
    const o = orders.get(refund[1]!)!;
    o.refunds.push((JSON.parse(String(init!.body)) as { amount: { value: number } }).amount.value);
    return json({});
  }
  if (init?.method === "POST" && url.endsWith("/transactions/outlets/outlet-1/orders")) {
    const body = JSON.parse(String(init.body)) as { amount: { value: number } } & Record<string, unknown>;
    const ref = `ord-${orders.size + 1}`;
    orders.set(ref, { state: "STARTED", amount: body.amount.value, body, refunds: [] });
    return json({ reference: ref, _links: { payment: { href: `https://paypage.sandbox.ngenius-payments.com/?code=${ref}` } } }, 201);
  }
  const get = url.match(/\/transactions\/outlets\/outlet-1\/orders\/(ord-\d+)$/);
  if (get) {
    const o = orders.get(get[1]!)!;
    return json({
      reference: get[1],
      _embedded: {
        payment: [
          {
            state: o.state,
            _links: { "cnp:refund": { href: `${NI}/refund/${get[1]}` } },
            _embedded: { "cnp:refund": o.refunds.map((value) => ({ state: "SUCCESS", amount: { value } })) },
          },
        ],
      },
    });
  }
  return json({ message: `unexpected ${url}` }, 404);
});

let t: TestContext;
beforeAll(async () => {
  vi.stubGlobal("fetch", fakeFetch);
  t = await createTestApp({ NGENIUS_API_KEY: "ni-key", NGENIUS_OUTLET_REF: "outlet-1", NGENIUS_WEBHOOK_SECRET: "hook-secret" });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await t.app.close();
});
beforeEach(resetDb);

describe("card payments (Network International N-Genius)", () => {
  it("pays on the N-Genius page, confirms on return, takes webhooks and refunds", async () => {
    const me = await signInPhone(t, undefined, "Sara Al Mansoori");
    const admin = await signInAs(t, "admin");
    const booking = await book(t, me.auth); // AED 150

    const start = await t.app.inject({ method: "POST", url: `/v1/bookings/${booking.id}/payments`, headers: me.auth, payload: { method: "card" } });
    expect(start.statusCode).toBe(201);
    const { paymentId, provider, hosted, stripe } = start.json();
    expect(provider).toBe("ngenius");
    expect(stripe).toBeUndefined();
    expect(hosted).toEqual({ url: "https://paypage.sandbox.ngenius-payments.com/?code=ord-1", returnUrlPrefix: "xtreme://payments/" });
    const order = orders.get("ord-1")!;
    expect(order.body).toMatchObject({ action: "PURCHASE", amount: { currencyCode: "AED", value: 15000 }, merchantOrderReference: paymentId });
    expect((order.body.merchantAttributes as { redirectUrl: string }).redirectUrl).toContain(`/v1/payments/ngenius/return?paymentId=${paymentId}`);

    // Coming back before paying is not a success; after paying it is.
    const early = await t.app.inject({ method: "GET", url: `/v1/payments/ngenius/return?paymentId=${paymentId}&result=done&ref=ord-1` });
    expect(early.headers.location).toBe(`xtreme://payments/${paymentId}?result=pending`);
    order.state = "PURCHASED";
    const back = await t.app.inject({ method: "GET", url: `/v1/payments/ngenius/return?paymentId=${paymentId}&result=done&ref=ord-1` });
    expect(back.headers.location).toBe(`xtreme://payments/${paymentId}?result=success`);
    const detail = (await t.app.inject({ method: "GET", url: `/v1/bookings/${booking.id}`, headers: me.auth })).json();
    expect(detail).toMatchObject({ paymentStatus: "paid", paymentMethod: "card" });

    // Webhooks need the shared secret and only trigger a re-read.
    const hook = (secret: string) =>
      t.app.inject({ method: "POST", url: "/v1/webhooks/ngenius", headers: { "content-type": "application/json", "x-webhook-secret": secret }, payload: JSON.stringify({ eventId: "e1", eventName: "PURCHASED", order: { reference: "ord-1" } }) });
    expect((await hook("wrong")).statusCode).toBe(401);
    expect((await hook("hook-secret")).statusCode).toBe(200);

    // Partial refund from the dashboard goes to N-Genius.
    const refund = await t.app.inject({ method: "POST", url: `/v1/admin/payments/${paymentId}/refund`, headers: admin.auth, payload: { amountAed: 50, reason: "Goodwill" } });
    expect(refund.statusCode).toBe(200);
    expect(order.refunds).toEqual([5000]);
    expect(refund.json()).toMatchObject({ status: "partially_refunded", refundedAed: 50, method: "card" });
  });

  it("a cancelled or failed page leaves the booking unpaid", async () => {
    const me = await signInPhone(t);
    const booking = await book(t, me.auth);
    const { paymentId } = (await t.app.inject({ method: "POST", url: `/v1/bookings/${booking.id}/payments`, headers: me.auth, payload: { method: "card" } })).json();
    const ref = [...orders.keys()].at(-1)!;
    orders.get(ref)!.state = "FAILED";
    const back = await t.app.inject({ method: "GET", url: `/v1/payments/ngenius/return?paymentId=${paymentId}&result=done` });
    expect(back.headers.location).toBe(`xtreme://payments/${paymentId}?result=failure`);
    const detail = (await t.app.inject({ method: "GET", url: `/v1/bookings/${booking.id}`, headers: me.auth })).json();
    expect(detail.paymentStatus).toBe("unpaid");
  });
});
