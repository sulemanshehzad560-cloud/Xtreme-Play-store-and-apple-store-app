import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ADDRESS, book, bookPaid, createTestApp, pay, resetDb, signInAs, signInPhone, slot, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.app.close());
beforeEach(resetDb);

const post = (url: string, auth: Record<string, string>, payload: unknown = {}) => t.app.inject({ method: "POST", url, headers: auth, payload: payload as object });
const get = (url: string, auth: Record<string, string>) => t.app.inject({ method: "GET", url, headers: auth });

describe("pricing and catalog", () => {
  it("uses the regular-cleaning rate sheet and quotes everything else on site", async () => {
    const q = async (qs: string) => (await t.app.inject({ method: "GET", url: `/v1/catalog/quote?${qs}` })).json();
    expect(await q("serviceKey=regular&propertyType=apartment&propertySize=studio")).toMatchObject({ priceAed: 90, durationMinutes: 45, cleaners: 2 });
    expect(await q("serviceKey=regular&propertyType=apartment&propertySize=4bhk")).toMatchObject({ priceAed: 240, durationMinutes: 180, cleaners: 3 });
    expect(await q("serviceKey=regular&propertyType=villa&propertySize=3bhk")).toMatchObject({ priceAed: null, pricing: "inspection" });
    expect(await q("serviceKey=deep&propertyType=apartment&propertySize=2bhk")).toMatchObject({ priceAed: null, pricing: "inspection" });
    expect(await q("serviceKey=restaurant&propertyType=restaurant&propertySize=medium")).toMatchObject({ pricing: "inspection" });
    expect((await t.app.inject({ method: "GET", url: "/v1/catalog/quote?serviceKey=restaurant&propertyType=villa&propertySize=3bhk" })).statusCode).toBe(400);

    const catalog = (await t.app.inject({ method: "GET", url: "/v1/catalog/services" })).json();
    expect(catalog.services.find((s: { key: string }) => s.key === "regular")).toMatchObject({ startingFromAed: 90 });
    expect(catalog.services.find((s: { key: string }) => s.key === "restaurant")).toMatchObject({ propertyTypes: ["restaurant"] });
    expect(catalog.regularRates["2bhk"]).toEqual({ priceAed: 150, minutes: 90, cleaners: 2 });
  });

  it("accepts same-day bookings an hour ahead", async () => {
    const me = await signInPhone(t);
    const at = new Date(Date.now() + 70 * 60_000);
    at.setUTCMinutes(0, 0, 0);
    at.setUTCHours(at.getUTCHours() + 1);
    const hour = (at.getUTCHours() + 4) % 24;
    const res = await post("/v1/bookings", me.auth, { serviceKey: "regular", propertyType: "apartment", propertySize: "studio", scheduledAt: at.toISOString(), address: ADDRESS });
    if (hour >= 7 && hour <= 20) expect(res.statusCode).toBe(201);
    else expect(res.json().error.code).toBe("outside_hours");
  });
});

describe("repeating regular cleaning", () => {
  it("books the next weekly visit when one is completed, waiting for payment", async () => {
    const customer = await signInPhone(t);
    const admin = await signInAs(t, "admin");
    const staff = await signInAs(t, "staff");
    const first = await bookPaid(t, customer.auth, { frequency: "weekly" });
    expect((await get(`/v1/bookings/${first.id}`, customer.auth)).json()).toMatchObject({ frequency: "weekly", status: "confirmed" });

    await post(`/v1/admin/bookings/${first.id}/assign`, admin.auth, { staffIds: [staff.user.id] });
    for (const status of ["en_route", "arrived", "in_progress", "completed"]) await post(`/v1/staff/jobs/${first.id}/status`, staff.auth, { status });

    let next: { id: string; repeatOfId: string; scheduledAt: string; frequency: string; awaitingPayment: boolean } | undefined;
    for (let i = 0; i < 30 && !next; i++) {
      next = (await get("/v1/bookings?scope=active", customer.auth)).json().find((b: { repeatOfId: string }) => b.repeatOfId === first.id);
      if (!next) await new Promise((r) => setTimeout(r, 50));
    }
    expect(next).toMatchObject({ frequency: "weekly", awaitingPayment: true });
    expect(new Date(next!.scheduledAt).getTime() - new Date(slot()).getTime()).toBe(7 * 86_400_000);

    // Created days ahead, it is not released after the usual one-hour hold.
    expect(await t.c.bookings.expireUnpaid(new Date(Date.now() + 2 * 3_600_000))).toBe(0);
    await pay(t, customer.auth, next!.id);
    expect((await get(`/v1/bookings/${next!.id}`, customer.auth)).json().status).toBe("confirmed");
  });

  it("only repeats regular cleaning", async () => {
    const me = await signInPhone(t);
    const sofa = await book(t, me.auth, { serviceKey: "sofa", frequency: "weekly" });
    expect((await get(`/v1/bookings/${sofa.id}`, me.auth)).json().frequency).toBe("one_time");
  });
});

describe("Tamara fee", () => {
  it("adds 8% when paying with Tamara and shows it on the invoice", async () => {
    const me = await signInPhone(t, undefined, "Sara Al Mansoori");
    await t.app.inject({ method: "PATCH", url: "/v1/me", headers: me.auth, payload: { email: "sara@example.com" } });
    const booking = await book(t, me.auth);
    const options = (await get(`/v1/bookings/${booking.id}/payment-options`, me.auth)).json();
    expect(options.methods.find((m: { method: string }) => m.method === "card")).toMatchObject({ feeAed: 0, totalAed: 150 });
    expect(options.methods.find((m: { method: string }) => m.method === "tamara")).toMatchObject({ feePercent: 8, feeAed: 12, totalAed: 162 });

    await post(`/v1/bookings/${booking.id}/payments`, me.auth, { method: "tamara" });
    const orderId = [...t.tamara.orders.keys()].at(-1)!;
    t.tamara.approve(orderId);
    await t.app.inject({ method: "POST", url: "/v1/webhooks/tamara?tamaraToken=tamara-ok", headers: { "content-type": "application/json" }, payload: JSON.stringify({ order_id: orderId, event_type: "order_approved" }) });
    const invoice = (await get(`/v1/bookings/${booking.id}/invoice`, me.auth)).json();
    expect(invoice.lines.map((l: { amountAed: number }) => l.amountAed)).toEqual([150, 12]);
    expect(invoice.totalAed).toBe(162);
  });
});

describe("chat with us", () => {
  it("answers common questions instantly and passes the rest to the office", async () => {
    const customer = await signInPhone(t);
    const admin = await signInAs(t, "admin");
    const send = async (body: string) => (await post("/v1/me/support/messages", customer.auth, { body })).json();

    const materials = await send("Do I need to provide cleaning materials?");
    expect(materials.map((m: { sender: string }) => m.sender)).toEqual(["customer", "bot"]);
    expect(materials[1].body).toMatch(/free of cost/);
    expect((await send("How much for a 2 bedroom?"))[1].body).toMatch(/2 BHK: AED 150/);

    const handoff = await send("I want to speak to a person about my invoice");
    expect(handoff[1].body).toMatch(/Our team will reply here shortly/);
    // The hand-off note is not repeated for every message.
    expect(await send("Hello?? anyone")).toHaveLength(2);
    expect(await send("Still waiting for an agent")).toHaveLength(1);

    const threads = (await get("/v1/admin/support/threads", admin.auth)).json();
    expect(threads[0]).toMatchObject({ customerId: customer.user.id, unread: 5 });
    await post(`/v1/admin/support/threads/${customer.user.id}`, admin.auth, { body: "Hi! I've checked your invoice, all good." });
    expect((await get("/v1/me/support/unread", customer.auth)).json().unread).toBeGreaterThan(0);
    const thread = (await get("/v1/me/support/messages", customer.auth)).json();
    expect(thread.at(-1)).toMatchObject({ sender: "staff", body: "Hi! I've checked your invoice, all good." });
    expect((await get("/v1/me/support/unread", customer.auth)).json().unread).toBe(0);
    expect((await get("/v1/admin/support/threads", customer.auth)).statusCode).toBe(403);
  });
});
