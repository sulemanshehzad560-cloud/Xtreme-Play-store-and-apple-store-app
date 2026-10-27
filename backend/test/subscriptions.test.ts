import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ADDRESS, createTestApp, resetDb, signInAs, signInPhone, slot, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.app.close());
beforeEach(resetDb);

const post = (url: string, auth: Record<string, string>, payload: unknown = {}) => t.app.inject({ method: "POST", url, headers: auth, payload: payload as object });
const patch = (url: string, auth: Record<string, string>, payload: unknown = {}) => t.app.inject({ method: "PATCH", url, headers: auth, payload: payload as object });
const get = (url: string, auth?: Record<string, string>) => t.app.inject({ method: "GET", url, headers: auth });
const stripeHook = (body: object) =>
  t.app.inject({ method: "POST", url: "/v1/webhooks/stripe", headers: { "stripe-signature": "good", "content-type": "application/json" }, payload: JSON.stringify(body) });

async function payCard(auth: Record<string, string>, bookingId: string) {
  expect((await post(`/v1/bookings/${bookingId}/payments`, auth, { method: "card" })).statusCode).toBe(201);
  const intentId = [...t.card.intents.keys()].at(-1)!;
  t.card.succeed(intentId);
  await stripeHook({ id: `evt_${intentId}`, type: "payment_intent.succeeded", intentId });
}

async function homePlan(admin: { auth: Record<string, string> }) {
  const res = await post("/v1/admin/subscription-plans", admin.auth, {
    name: "Home care",
    description: "Regular cleaning every week",
    serviceKey: "regular",
    visitsPerMonth: 4,
    priceMonthlyAed: 650,
    priceYearlyAed: 7000,
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string };
}

const subscribeBody = (planId: string, interval: "monthly" | "yearly" = "monthly") => ({
  planId,
  interval,
  propertyType: "apartment",
  propertySize: "2bhk",
  address: ADDRESS,
  firstVisitAt: slot(2),
});

describe("subscriptions", () => {
  it("office sets plans and prices; customers see only active plans", async () => {
    const admin = await signInAs(t, "admin");
    const customer = await signInPhone(t);
    const plan = await homePlan(admin);
    expect((await post("/v1/admin/subscription-plans", admin.auth, { name: "Bad", serviceKey: "regular", visitsPerMonth: 2 })).json().error.code).toBe("price_required");
    expect((await post("/v1/admin/subscription-plans", customer.auth, { name: "Sneaky", serviceKey: "regular", visitsPerMonth: 1, priceMonthlyAed: 1 })).statusCode).toBe(403);

    expect((await get("/v1/subscription-plans")).json()).toHaveLength(1);
    await patch(`/v1/admin/subscription-plans/${plan.id}`, admin.auth, { active: false });
    expect((await get("/v1/subscription-plans")).json()).toHaveLength(0);
    expect((await get("/v1/admin/subscription-plans", admin.auth)).json()).toHaveLength(1);
  });

  it("subscribes, pays the first visit, then books included visits up to the allowance", async () => {
    const admin = await signInAs(t, "admin");
    const customer = await signInPhone(t);
    const plan = await homePlan(admin);

    const created = await post("/v1/subscriptions", customer.auth, subscribeBody(plan.id));
    expect(created.statusCode).toBe(201);
    const { subscription, paymentBookingId } = created.json();
    expect(subscription).toMatchObject({ status: "pending_payment", priceAed: 650, visitsPerPeriod: 4, canBookVisit: false, paymentBookingId });
    const charge = (await get(`/v1/bookings/${paymentBookingId}`, customer.auth)).json();
    expect(charge).toMatchObject({ priceAed: 650, canPay: true, subscriptionId: subscription.id });

    // Not active yet: no included visits.
    expect((await post(`/v1/subscriptions/${subscription.id}/visits`, customer.auth, { scheduledAt: slot(3) })).json().error.code).toBe("not_active");

    await payCard(customer.auth, paymentBookingId);
    const active = (await get(`/v1/subscriptions/${subscription.id}`, customer.auth)).json();
    expect(active).toMatchObject({ status: "active", visitsUsed: 1, visitsLeft: 3, canBookVisit: true, paymentBookingId: null });
    expect(new Date(active.currentPeriodEnd).getTime() - new Date(active.currentPeriodStart).getTime()).toBeGreaterThan(27 * 86_400_000);
    const inbox = (await get("/v1/me/notifications", customer.auth)).json();
    expect(inbox.some((n: { title: string }) => n.title === "Subscription active")).toBe(true);

    // Included visits: nothing to pay.
    const visit = await post(`/v1/subscriptions/${subscription.id}/visits`, customer.auth, { scheduledAt: slot(5) });
    expect(visit.statusCode).toBe(201);
    expect(visit.json()).toMatchObject({ priceAed: 0, paymentStatus: "included", canPay: false });
    expect((await post(`/v1/bookings/${visit.json().id}/payments`, customer.auth, { method: "card" })).json().error.code).toBe("nothing_to_pay");
    await post(`/v1/subscriptions/${subscription.id}/visits`, customer.auth, { scheduledAt: slot(9) });
    await post(`/v1/admin/subscriptions/${subscription.id}/visits`, admin.auth, { scheduledAt: slot(12) });
    expect((await post(`/v1/subscriptions/${subscription.id}/visits`, customer.auth, { scheduledAt: slot(14) })).json().error.code).toBe("no_visits_left");

    // Another customer cannot see it; the office sees it with the customer's details.
    const other = await signInPhone(t);
    expect((await get(`/v1/subscriptions/${subscription.id}`, other.auth)).statusCode).toBe(404);
    const list = (await get("/v1/admin/subscriptions", admin.auth)).json();
    expect(list[0]).toMatchObject({ reference: subscription.reference, status: "active", visitsLeft: 0, customer: { fullName: "Test Customer" } });

    // Customers cannot cancel a paid period themselves; the office can.
    expect((await post(`/v1/subscriptions/${subscription.id}/cancel`, customer.auth)).json().error.code).toBe("contact_office");
    expect((await post(`/v1/admin/subscriptions/${subscription.id}/cancel`, admin.auth, { reason: "Moved away" })).json().status).toBe("cancelled");
  });

  it("renews into a new paid period and keeps the price the customer bought", async () => {
    const admin = await signInAs(t, "admin");
    const customer = await signInPhone(t);
    const plan = await homePlan(admin);
    const { subscription, paymentBookingId } = (await post("/v1/subscriptions", customer.auth, subscribeBody(plan.id, "yearly"))).json();
    expect(subscription).toMatchObject({ priceAed: 7000, visitsPerPeriod: 48 });
    await payCard(customer.auth, paymentBookingId);
    const first = (await get(`/v1/subscriptions/${subscription.id}`, customer.auth)).json();

    // A price change does not touch the running contract.
    await patch(`/v1/admin/subscription-plans/${plan.id}`, admin.auth, { priceYearlyAed: 8000 });
    const renewed = (await post(`/v1/subscriptions/${subscription.id}/renew`, customer.auth, { firstVisitAt: slot(20) })).json();
    expect((await get(`/v1/bookings/${renewed.paymentBookingId}`, customer.auth)).json().priceAed).toBe(7000);
    // Asking again returns the same unpaid charge.
    expect((await post(`/v1/subscriptions/${subscription.id}/renew`, customer.auth, { firstVisitAt: slot(21) })).json().paymentBookingId).toBe(renewed.paymentBookingId);

    await payCard(customer.auth, renewed.paymentBookingId);
    const after = (await get(`/v1/subscriptions/${subscription.id}`, customer.auth)).json();
    expect(after.currentPeriodStart).toBe(first.currentPeriodEnd); // next period follows on
  });

  it("an unpaid subscription can be cancelled by the customer and its charge is cancelled", async () => {
    const admin = await signInAs(t, "admin");
    const customer = await signInPhone(t);
    const plan = await homePlan(admin);
    const { subscription, paymentBookingId } = (await post("/v1/subscriptions", customer.auth, subscribeBody(plan.id))).json();
    expect((await post(`/v1/subscriptions/${subscription.id}/cancel`, customer.auth)).json().status).toBe("cancelled");
    expect((await get(`/v1/bookings/${paymentBookingId}`, customer.auth)).json().status).toBe("cancelled");
    expect((await get("/v1/me/subscriptions", customer.auth)).json()).toHaveLength(0);
  });
});
