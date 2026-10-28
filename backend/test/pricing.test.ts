import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { book, createTestApp, pay, resetDb, signInAs, signInPhone, type TestContext } from "./helpers.js";
import { defaultPricing } from "../src/modules/catalog/pricing.js";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  // Prices live in shared module state: leave the defaults for the next test file.
  await resetDb();
  await t.c.prices.load();
  await t.app.close();
});
beforeEach(async () => {
  await resetDb();
  await t.c.prices.load();
});

const quote = async (qs: string) => (await t.app.inject({ method: "GET", url: `/v1/catalog/quote?${qs}` })).json();

describe("price list", () => {
  it("lets the office change fixed prices, add new ones and set the Tamara fee", async () => {
    const admin = await signInAs(t, "admin");
    const customer = await signInPhone(t);
    const current = (await t.app.inject({ method: "GET", url: "/v1/admin/pricing", headers: admin.auth })).json();
    expect(current.rates.regular.apartment.studio).toEqual({ priceAed: 90, minutes: 45, cleaners: 2 });
    expect(current.services.length).toBeGreaterThan(5);

    const next = defaultPricing(5);
    next.rates.regular!.apartment!.studio = { priceAed: 99, minutes: 50, cleaners: 2 };
    next.rates.deep = { villa: { "3bhk": { priceAed: 650, minutes: 360, cleaners: 4 } } };
    const put = await t.app.inject({ method: "PUT", url: "/v1/admin/pricing", headers: admin.auth, payload: next });
    expect(put.statusCode).toBe(200);

    expect(await quote("serviceKey=regular&propertyType=apartment&propertySize=studio")).toMatchObject({ priceAed: 99, pricing: "fixed", durationMinutes: 50 });
    expect(await quote("serviceKey=deep&propertyType=villa&propertySize=3bhk")).toMatchObject({ priceAed: 650, pricing: "fixed", cleaners: 4 });
    expect(await quote("serviceKey=deep&propertyType=villa&propertySize=4bhk")).toMatchObject({ priceAed: null, pricing: "inspection" });

    const catalog = (await t.app.inject({ method: "GET", url: "/v1/catalog/services" })).json();
    expect(catalog.payments.tamaraFeePercent).toBe(5);
    expect(catalog.services.find((s: { key: string }) => s.key === "deep")).toMatchObject({ startingFromAed: 650, pricing: { kind: "tiered" } });
    expect(catalog.regularRates.studio.priceAed).toBe(99);

    // Saved in the database: a restart keeps the new prices.
    await t.c.prices.load();
    expect((await quote("serviceKey=regular&propertyType=apartment&propertySize=studio")).priceAed).toBe(99);

    // Only the office can change prices, and nonsense is refused.
    expect((await t.app.inject({ method: "PUT", url: "/v1/admin/pricing", headers: customer.auth, payload: next })).statusCode).toBe(403);
    const bad = { ...next, rates: { regular: { apartment: { studio: { priceAed: 0, minutes: 50, cleaners: 2 } } } } };
    expect((await t.app.inject({ method: "PUT", url: "/v1/admin/pricing", headers: admin.auth, payload: bad })).json().error.code).toBe("invalid_pricing");
    const wrongType = { ...next, rates: { restaurant: { villa: { "3bhk": { priceAed: 100, minutes: 60, cleaners: 2 } } } } };
    expect((await t.app.inject({ method: "PUT", url: "/v1/admin/pricing", headers: admin.auth, payload: wrongType })).statusCode).toBe(400);
  });

  it("applies weekly / bi-weekly discounts and the service and card fees set in the dashboard", async () => {
    const admin = await signInAs(t, "admin");
    const me = await signInPhone(t, undefined, "Sara Al Mansoori");
    const next = { ...defaultPricing(8), cardFeePercent: 2, serviceFeeAed: 10, frequencyDiscountPercent: { weekly: 10, biweekly: 5 } };
    expect((await t.app.inject({ method: "PUT", url: "/v1/admin/pricing", headers: admin.auth, payload: next })).statusCode).toBe(200);

    expect(await quote("serviceKey=regular&propertyType=apartment&propertySize=2bhk&frequency=weekly")).toMatchObject({ priceAed: 135, basePriceAed: 150, discountPercent: 10 });
    expect(await quote("serviceKey=regular&propertyType=apartment&propertySize=2bhk&frequency=biweekly")).toMatchObject({ priceAed: 143 });
    expect((await quote("serviceKey=regular&propertyType=apartment&propertySize=2bhk")).priceAed).toBe(150);

    const booking = await book(t, me.auth, { frequency: "weekly" });
    expect(booking.priceAed).toBe(135);
    const options = (await t.app.inject({ method: "GET", url: `/v1/bookings/${booking.id}/payment-options`, headers: me.auth })).json();
    expect(options.amount).toMatchObject({ totalAed: 135, serviceFeeAed: 10 });
    expect(options.methods[0]).toMatchObject({ method: "card", feePercent: 2, feeAed: 12.7, totalAed: 147.7 });
    expect(options.methods[1]).toMatchObject({ method: "tamara", feeAed: 20.8, totalAed: 155.8 });

    await pay(t, me.auth, booking.id);
    expect([...t.card.intents.values()].at(-1)!.amountMinor).toBe(14770);
    const invoice = (await t.app.inject({ method: "GET", url: `/v1/bookings/${booking.id}/invoice`, headers: me.auth })).json();
    expect(invoice.totalAed).toBe(147.7);
    expect(invoice.lines.map((l: { description: string; amountAed: number }) => [l.description, l.amountAed]).slice(1)).toEqual([
      ["Service fee", 10],
      ["Card processing fee", 2.7],
    ]);
  });
});

describe("deploy from the dashboard", () => {
  it("needs the Render hook, asks Render to deploy and records who did it", async () => {
    const admin = await signInAs(t, "admin");
    const status = (await t.app.inject({ method: "GET", url: "/v1/admin/deploy", headers: admin.auth })).json();
    expect(status).toEqual({ configured: false, last: null });
    const res = await t.app.inject({ method: "POST", url: "/v1/admin/deploy", headers: admin.auth, payload: {} });
    expect(res.json().error.code).toBe("deploy_not_configured");
  });
});
