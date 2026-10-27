import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { book, createTestApp, resetDb, signInAs, signInPhone, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.app.close());
beforeEach(() => resetDb());

const post = (url: string, auth: Record<string, string>, payload: unknown = {}) => t.app.inject({ method: "POST", url, headers: auth, payload: payload as object });
const get = (url: string, auth: Record<string, string>) => t.app.inject({ method: "GET", url, headers: auth });

describe("quote on site", () => {
  it("lets the lead quote an inspection job on site, then the customer pays and the job completes", async () => {
    const customer = await signInPhone(t);
    const admin = await signInAs(t, "admin");
    const lead = await signInAs(t, "staff", "Ahmed");
    const helper = await signInAs(t, "staff", "Bilal");
    const booking = await book(t, customer.auth, { serviceKey: "sofa" });
    expect(booking.priceAed).toBeNull();
    await post(`/v1/admin/bookings/${booking.id}/assign`, admin.auth, { staffIds: [lead.user.id, helper.user.id], leadId: lead.user.id });

    // Not before the team is on the way, and never by a helper.
    expect((await post(`/v1/staff/jobs/${booking.id}/quote`, lead.auth, { priceAed: 240 })).json().error.code).toBe("not_on_site");
    await post(`/v1/staff/jobs/${booking.id}/status`, lead.auth, { status: "en_route" });
    await post(`/v1/staff/jobs/${booking.id}/status`, lead.auth, { status: "arrived" });
    expect((await post(`/v1/staff/jobs/${booking.id}/quote`, helper.auth, { priceAed: 240 })).json().error.code).toBe("not_lead");

    // Completing without a price is refused.
    await post(`/v1/staff/jobs/${booking.id}/status`, lead.auth, { status: "in_progress" });
    expect((await post(`/v1/staff/jobs/${booking.id}/status`, lead.auth, { status: "completed" })).json().error.code).toBe("quote_needed");

    const quoted = await post(`/v1/staff/jobs/${booking.id}/quote`, lead.auth, { priceAed: 240, note: "3-seater + 2 chairs" });
    expect(quoted.statusCode).toBe(200);
    expect(quoted.json().priceAed).toBe(240);

    // The customer is told and can see the price.
    const inbox = (await get("/v1/me/notifications", customer.auth)).json();
    expect(inbox[0]).toMatchObject({ title: `Your quote for ${booking.reference}` });
    expect(inbox[0].body).toContain("AED 240");
    expect((await get(`/v1/bookings/${booking.id}`, customer.auth)).json().priceAed).toBe(240);

    // Complete the job; it stays payable afterwards.
    expect((await post(`/v1/staff/jobs/${booking.id}/status`, lead.auth, { status: "completed" })).json().status).toBe("completed");
    const options = await get(`/v1/bookings/${booking.id}/payment-options`, customer.auth);
    expect(options.statusCode).toBe(200);
    expect(options.json().amount.totalAed).toBe(240);
    expect((await get(`/v1/bookings/${booking.id}`, customer.auth)).json().canPay).toBe(true);
  });

  it("lets the office reprice until the booking is paid", async () => {
    const customer = await signInPhone(t);
    const admin = await signInAs(t, "admin");
    const booking = await book(t, customer.auth, { serviceKey: "mattress" });
    const res = await post(`/v1/admin/bookings/${booking.id}/price`, admin.auth, { priceAed: 180, note: "King size, both sides" });
    expect(res.json().priceAed).toBe(180);
    const other = await signInAs(t, "staff", "Zaid");
    // Staff who are not on the job cannot see or quote it.
    expect((await post(`/v1/staff/jobs/${booking.id}/quote`, other.auth, { priceAed: 1 })).statusCode).toBe(404);
  });
});
