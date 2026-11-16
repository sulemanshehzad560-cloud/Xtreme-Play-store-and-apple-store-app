import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { book, createTestApp, resetDb, signInAs, signInPhone, ziinaHook, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.app.close());
beforeEach(resetDb);

const post = (url: string, auth: Record<string, string>, payload: unknown = {}) => t.app.inject({ method: "POST", url, headers: auth, payload: payload as object });
const get = (url: string, auth: Record<string, string>) => t.app.inject({ method: "GET", url, headers: auth });
const hook = (intentId: string, signature = "good") => ziinaHook(t, intentId, signature);

async function profiled() {
  const me = await signInPhone(t, undefined, "Sara Al Mansoori");
  await t.app.inject({ method: "PATCH", url: "/v1/me", headers: me.auth, payload: { email: "sara@example.com" } });
  return me;
}

describe("card payments (Ziina)", () => {
  it("shows options with VAT and pays on Ziina's page + webhook", async () => {
    const me = await profiled();
    const booking = await book(t, me.auth); // regular, 2bhk apartment = AED 150

    const options = (await get(`/v1/bookings/${booking.id}/payment-options`, me.auth)).json();
    expect(options.amount).toEqual({ priceAed: 150, discountAed: 0, totalAed: 150, serviceFeeAed: 0, serviceFeePercent: 0, vatAed: 7.14, vatIncluded: true, currency: "AED" });
    expect(options.methods.map((m: { method: string; available: boolean }) => [m.method, m.available])).toEqual([["card", true], ["cash", true]]);

    const start = await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "card" });
    expect(start.statusCode).toBe(201);
    const { paymentId, provider, hosted } = start.json();
    expect(provider).toBe("ziina");
    expect(hosted.url).toMatch(/^https:\/\/pay\.ziina\.test\//);
    const intentId = [...t.ziina.intents.keys()].at(-1)!;
    expect(t.ziina.intents.get(intentId)!.amountMinor).toBe(15000);
    expect((await get(`/v1/bookings/${booking.id}`, me.auth)).json().paymentStatus).toBe("pending");

    // Bad signatures are rejected; good ones re-read the payment from Ziina, and repeats change nothing.
    expect((await hook(intentId, "forged")).statusCode).toBe(401);
    t.ziina.succeed(intentId);
    expect((await hook(intentId)).statusCode).toBe(200);
    await hook(intentId);

    const detail = (await get(`/v1/bookings/${booking.id}`, me.auth)).json();
    expect(detail).toMatchObject({ paymentStatus: "paid", paymentMethod: "card", canPay: false });
    const inbox = (await get("/v1/me/notifications", me.auth)).json();
    expect(inbox.filter((n: { title: string }) => n.title === "Payment received")).toHaveLength(1);
    expect((await get(`/v1/bookings/${booking.id}/payments`, me.auth)).json()[0]).toMatchObject({ id: paymentId, status: "captured", amountAed: 150 });

    // The tax invoice is the one place VAT is broken out (prices are VAT-inclusive).
    const invoice = (await get(`/v1/bookings/${booking.id}/invoice`, me.auth)).json();
    expect(invoice).toMatchObject({ totalAed: 150, vatAed: 7.14, subtotalAed: 142.86, vatRate: 0.05, currency: "AED", payment: { method: "Card" } });
    expect(invoice.invoiceNumber).toMatch(/^INV-/);
    expect(invoice.lines[0].description).toContain("Regular cleaning");

    // Can't pay twice.
    expect((await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "card" })).json().error.code).toBe("already_paid");
  });

  it("replaces an abandoned attempt instead of charging twice", async () => {
    const me = await profiled();
    const booking = await book(t, me.auth);
    await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "card" });
    await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "card" });
    const list = (await get(`/v1/bookings/${booking.id}/payments`, me.auth)).json();
    expect(list.map((p: { status: string }) => p.status)).toEqual(["pending", "cancelled"]);
  });

  it("refunds automatically when a paid booking is cancelled", async () => {
    const me = await profiled();
    const booking = await book(t, me.auth);
    const { paymentId } = (await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "card" })).json();
    const intentId = [...t.ziina.intents.keys()].at(-1)!;
    t.ziina.succeed(intentId);
    await post(`/v1/payments/${paymentId}/sync`, me.auth);

    const cancelled = await post(`/v1/bookings/${booking.id}/cancel`, me.auth, { reason: "Travelling" });
    expect(cancelled.statusCode).toBe(200);
    expect(t.ziina.refunds).toEqual([{ intentId, amountMinor: 15000 }]);
    const detail = (await get(`/v1/bookings/${booking.id}`, me.auth)).json();
    expect(detail.paymentStatus).toBe("refunded");
    expect(detail.timeline.some((e: { type: string }) => e.type === "refund")).toBe(true);
  });

  it("supports partial refunds by the office and blocks repricing paid bookings", async () => {
    const me = await profiled();
    const admin = await signInAs(t, "admin");
    const booking = await book(t, me.auth);
    const { paymentId } = (await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "card" })).json();
    t.ziina.succeed([...t.ziina.intents.keys()].at(-1)!);
    await post(`/v1/payments/${paymentId}/sync`, me.auth);

    expect((await post(`/v1/admin/bookings/${booking.id}/price`, admin.auth, { priceAed: 500 })).json().error.code).toBe("already_paid");
    const part = await post(`/v1/admin/payments/${paymentId}/refund`, admin.auth, { amountAed: 50, reason: "Late arrival" });
    expect(part.json()).toMatchObject({ status: "partially_refunded", refundedAed: 50 });
    const over = await post(`/v1/admin/payments/${paymentId}/refund`, admin.auth, { amountAed: 401, reason: "Too much" });
    expect(over.json().error.code).toBe("invalid_amount");
    expect((await get(`/v1/bookings/${booking.id}`, me.auth)).json().paymentStatus).toBe("partially_refunded");
  });

  it("has no invoice before payment", async () => {
    const me = await profiled();
    const booking = await book(t, me.auth);
    expect((await get(`/v1/bookings/${booking.id}/invoice`, me.auth)).statusCode).toBe(409);
  });

  it("only lets customers pay once a survey price is set", async () => {
    const me = await profiled();
    const admin = await signInAs(t, "admin");
    const booking = await book(t, me.auth, { serviceKey: "sofa" });
    expect((await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "card" })).json().error.code).toBe("awaiting_quote");
    await post(`/v1/admin/bookings/${booking.id}/price`, admin.auth, { priceAed: 275 });
    expect((await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "card" })).statusCode).toBe(201);
    expect([...t.ziina.intents.values()].at(-1)!.amountMinor).toBe(27500);
  });
});

describe("cash on the day with an online deposit", () => {
  it("takes 20% online to confirm, then the team collects the cash and the invoice covers both", async () => {
    const me = await profiled();
    const admin = await signInAs(t, "admin");
    const staff = await signInAs(t, "staff");
    const other = await signInAs(t, "staff", "Bilal");
    const booking = await book(t, me.auth); // AED 150

    const options = (await get(`/v1/bookings/${booking.id}/payment-options`, me.auth)).json();
    expect(options.methods[1]).toMatchObject({ method: "cash", available: true, totalAed: 150, depositPercent: 20, depositAed: 30, cashDueAed: 120 });

    // The deposit is paid by card; the booking is then confirmed with cash still due.
    const start = await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "cash" });
    expect(start.statusCode).toBe(201);
    const intentId = [...t.ziina.intents.keys()].at(-1)!;
    expect(t.ziina.intents.get(intentId)!.amountMinor).toBe(3000);
    expect((await get(`/v1/bookings/${booking.id}`, me.auth)).json()).toMatchObject({ paymentStatus: "pending", paymentMethod: "cash" });
    t.ziina.succeed(intentId);
    expect((await hook(intentId)).statusCode).toBe(200);
    let detail = (await get(`/v1/bookings/${booking.id}`, me.auth)).json();
    expect(detail).toMatchObject({ paymentStatus: "deposit_paid", paymentMethod: "cash", cashDueAed: 120, canPay: false, awaitingPayment: false });
    expect((await get(`/v1/bookings/${booking.id}/payments`, me.auth)).json()[0]).toMatchObject({ kind: "deposit", amountAed: 30, cashDueAed: 120, status: "captured" });
    expect((await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "card" })).json().error.code).toBe("already_paid");
    expect((await get(`/v1/bookings/${booking.id}/invoice`, me.auth)).json().error.code).toBe("not_paid");

    // Paid deposit lets the office assign a team, who see the cash to collect.
    expect((await post(`/v1/admin/bookings/${booking.id}/assign`, admin.auth, { staffIds: [staff.user.id] })).statusCode).toBe(200);
    const job = (await get(`/v1/bookings/${booking.id}`, staff.auth)).json();
    expect(job).toMatchObject({ paymentStatus: "deposit_paid", cashDueAed: 120 });

    // Only the assigned team or the office can record the cash, and only once.
    expect((await post(`/v1/bookings/${booking.id}/cash-collected`, me.auth)).statusCode).toBe(403);
    expect((await post(`/v1/bookings/${booking.id}/cash-collected`, other.auth)).statusCode).toBe(404);
    const collected = await post(`/v1/bookings/${booking.id}/cash-collected`, staff.auth);
    expect(collected.statusCode).toBe(200);
    expect(collected.json()).toMatchObject({ method: "cash", kind: "cash", amountAed: 120, status: "captured" });
    expect((await post(`/v1/bookings/${booking.id}/cash-collected`, staff.auth)).json().error.code).toBe("no_cash_due");

    detail = (await get(`/v1/bookings/${booking.id}`, me.auth)).json();
    expect(detail).toMatchObject({ paymentStatus: "paid", paymentMethod: "cash", cashDueAed: 0 });
    const invoice = (await get(`/v1/bookings/${booking.id}/invoice`, me.auth)).json();
    expect(invoice).toMatchObject({ totalAed: 150, vatAed: 7.14, payment: { method: "Card deposit AED 30 + cash AED 120" } });
  });

  it("refunds the deposit if a cash booking is cancelled before the visit", async () => {
    const me = await profiled();
    const booking = await book(t, me.auth);
    await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "cash" });
    const intentId = [...t.ziina.intents.keys()].at(-1)!;
    t.ziina.succeed(intentId);
    await hook(intentId);
    expect((await post(`/v1/bookings/${booking.id}/cancel`, me.auth, { reason: "Plans changed" })).statusCode).toBe(200);
    const detail = (await get(`/v1/bookings/${booking.id}`, me.auth)).json();
    expect(detail).toMatchObject({ paymentStatus: "refunded", cashDueAed: 0 });
  });

  it("no longer offers Tamara", async () => {
    const me = await profiled();
    const booking = await book(t, me.auth);
    const res = await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "tamara" });
    expect(res.statusCode).toBe(400);
  });
});
