import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { book, bookPaid, createTestApp, pay, resetDb, signInAs, signInPhone, slot, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.app.close());
beforeEach(resetDb);

const post = (url: string, auth: Record<string, string>, payload?: unknown) => t.app.inject({ method: "POST", url, headers: auth, ...(payload ? { payload } : {}) });
const get = (url: string, auth: Record<string, string>) => t.app.inject({ method: "GET", url, headers: auth });

const FIRST = { name: "First booking 20% off", kind: "percent", value: 20, autoApply: true, firstBookingOnly: true, maxDiscountAed: 100, active: true };

describe("promotions", () => {
  it("gives a first-booking discount automatically, charges the reduced amount and shows it on the invoice", async () => {
    const admin = await signInAs(t, "admin");
    expect((await post("/v1/admin/promotions", admin.auth, FIRST)).statusCode).toBe(201);
    const customer = await signInPhone(t);

    // Regular clean 2BHK is AED 150: 20% is 30.
    const booking = await book(t, customer.auth);
    expect(booking).toMatchObject({ priceAed: 150, discountAed: 30, amountDueAed: 120 });
    const options = (await get(`/v1/bookings/${booking.id}/payment-options`, customer.auth)).json();
    expect(options.amount).toMatchObject({ priceAed: 150, discountAed: 30, totalAed: 120 });

    await pay(t, customer.auth, booking.id);
    const payments = (await get(`/v1/bookings/${booking.id}/payments`, customer.auth)).json();
    expect(payments[0]).toMatchObject({ amountAed: 120, status: "captured" });
    const invoice = (await get(`/v1/bookings/${booking.id}/invoice`, customer.auth)).json();
    expect(invoice.lines.map((l: { amountAed: number }) => l.amountAed)).toEqual([150, -30]);
    expect(invoice.totalAed).toBe(120);

    // Only the first booking qualifies.
    const second = await book(t, customer.auth, { scheduledAt: slot(3) });
    expect(second).toMatchObject({ discountAed: 0, amountDueAed: 150 });
    const promos = (await get("/v1/admin/promotions", admin.auth)).json();
    expect(promos[0]).toMatchObject({ usedCount: 1 });
  });

  it("applies codes with their rules, keeps the best discount and caps at the minimum charge", async () => {
    const admin = await signInAs(t, "admin");
    await post("/v1/admin/promotions", admin.auth, { ...FIRST, value: 10 });
    const res = await post("/v1/admin/promotions", admin.auth, { name: "Eid 100", code: "eid100", kind: "fixed", value: 100, autoApply: false, firstBookingOnly: false, serviceKeys: ["regular"], minOrderAed: 140, active: true });
    expect(res.json()).toMatchObject({ code: "EID100" });
    expect((await post("/v1/admin/promotions", admin.auth, { name: "Dup", code: "EID100", kind: "fixed", value: 5, autoApply: false, firstBookingOnly: false, active: true })).json().error.code).toBe("code_taken");
    expect((await post("/v1/admin/promotions", admin.auth, { name: "No code", kind: "fixed", value: 5, autoApply: false, firstBookingOnly: false, active: true })).json().error.code).toBe("code_required");

    const customer = await signInPhone(t);
    const booking = await book(t, customer.auth);
    expect(booking).toMatchObject({ discountAed: 15 });
    expect((await post(`/v1/bookings/${booking.id}/promo`, customer.auth, { code: "nope" })).json().error.code).toBe("invalid_code");
    const applied = (await post(`/v1/bookings/${booking.id}/promo`, customer.auth, { code: " eid100 " })).json();
    expect(applied).toMatchObject({ discountAed: 100, amountDueAed: 50, promoCode: "EID100" });

    // Wrong service and too small an order are refused with a reason.
    const small = await book(t, customer.auth, { propertySize: "1bhk", scheduledAt: slot(3) });
    expect((await post(`/v1/bookings/${small.id}/promo`, customer.auth, { code: "EID100" })).json().error.code).toBe("code_not_applicable");

    // Removing the code falls back to the automatic offer.
    expect((await t.app.inject({ method: "DELETE", url: `/v1/bookings/${booking.id}/promo`, headers: customer.auth })).json()).toMatchObject({ discountAed: 15, promoCode: null });

    // A paused promotion stops applying before payment.
    const auto = (await get("/v1/admin/promotions", admin.auth)).json().find((p: { autoApply: boolean }) => p.autoApply);
    await t.app.inject({ method: "PATCH", url: `/v1/admin/promotions/${auto.id}`, headers: admin.auth, payload: { active: false } });
    const options = (await get(`/v1/bookings/${booking.id}/payment-options`, customer.auth)).json();
    expect(options.amount).toMatchObject({ discountAed: 0, totalAed: 150 });

    // Customers cannot manage promotions.
    expect((await post("/v1/admin/promotions", customer.auth, FIRST)).statusCode).toBe(403);
  });

  it("releases unpaid bookings after the hold and keeps paid ones", async () => {
    const customer = await signInPhone(t);
    const unpaid = await book(t, customer.auth);
    const paid = await bookPaid(t, customer.auth, { scheduledAt: slot(3) });
    const survey = await book(t, customer.auth, { serviceKey: "sofa", scheduledAt: slot(4) });
    expect(await t.c.bookings.expireUnpaid(new Date(Date.now() + 61 * 60_000))).toBe(1);
    const status = async (id: string) => (await get(`/v1/bookings/${id}`, customer.auth)).json().status;
    expect(await status(unpaid.id)).toBe("cancelled");
    expect(await status(paid.id)).toBe("confirmed");
    expect(await status(survey.id)).toBe("requested");
  });
});
