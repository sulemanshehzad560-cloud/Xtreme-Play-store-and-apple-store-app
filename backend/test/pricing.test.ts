import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, resetDb, signInAs, signInPhone, type TestContext } from "./helpers.js";
import { defaultPricing } from "../src/modules/catalog/pricing.js";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.c.prices.load(); // back to the defaults (the table is emptied between tests)
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
});
