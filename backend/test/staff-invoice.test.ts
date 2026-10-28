import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { book, createTestApp, nextPhone, resetDb, signInAs, signInPhone, type TestContext, pay } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.app.close());
beforeEach(async () => {
  await resetDb();
  t.mail.outbox.length = 0;
});

const post = (url: string, auth: Record<string, string>, payload: unknown = {}) => t.app.inject({ method: "POST", url, headers: auth, payload: payload as object });
const get = (url: string, auth: Record<string, string>) => t.app.inject({ method: "GET", url, headers: auth });
const login = (staffId: string, password: string) => t.app.inject({ method: "POST", url: "/v1/auth/staff/login", payload: { staffId, password } });
const waitFor = async (check: () => boolean | Promise<boolean>) => {
  for (let i = 0; i < 50; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error("condition not met");
};

async function addStaff(admin: { auth: Record<string, string> }, extra: Record<string, unknown> = {}) {
  const res = await post("/v1/admin/staff", admin.auth, { phone: nextPhone(), displayName: "Ahmed Khan", employeeCode: "XT-014", ...extra });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; login: { staffId: string; hasPassword: boolean } };
}

describe("staff sign-in with Staff ID and password", () => {
  it("admin sets a password; staff sign in with Staff ID (any case) and see staff screens", async () => {
    const admin = await signInAs(t, "admin");
    const staff = await addStaff(admin);
    expect(staff.login).toMatchObject({ staffId: "XT-014", hasPassword: false });
    expect((await login("XT-014", "anything")).statusCode).toBe(401);

    const set = (await post(`/v1/admin/staff/${staff.id}/password`, admin.auth, {})).json();
    expect(set).toMatchObject({ staffId: "XT-014", generated: true });
    expect(set.password).toMatch(/^[A-Za-z]+-\d{4}-[A-Za-z]+$/);

    const ok = await login("xt-014", set.password);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.role).toBe("staff");
    const me = (await get("/v1/staff/me", { authorization: `Bearer ${ok.json().accessToken}` })).json();
    expect(me.displayName).toBe("Ahmed Khan");

    const detail = (await get(`/v1/admin/staff/${staff.id}`, admin.auth)).json();
    expect(detail.login).toMatchObject({ hasPassword: true, locked: false });
    expect(JSON.stringify(detail)).not.toContain("scrypt");
  });

  it("locks the account after 5 wrong passwords; a reset unlocks it and signs out old sessions", async () => {
    const admin = await signInAs(t, "admin");
    const staff = await addStaff(admin, { password: "Correct-Horse-1" });
    const first = await login("XT-014", "Correct-Horse-1");
    expect(first.statusCode).toBe(200);
    for (let i = 0; i < 5; i++) expect((await login("XT-014", "wrong")).statusCode).toBe(401);
    expect((await login("XT-014", "Correct-Horse-1")).statusCode).toBe(429);

    await post(`/v1/admin/staff/${staff.id}/password`, admin.auth, { password: "New-Password-22" });
    expect((await login("XT-014", "New-Password-22")).statusCode).toBe(200);
    const refresh = await t.app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: first.json().refreshToken } });
    expect(refresh.statusCode).toBe(401);
  });

  it("refuses inactive staff and customers using the staff login", async () => {
    const admin = await signInAs(t, "admin");
    const staff = await addStaff(admin, { password: "Correct-Horse-1" });
    await t.app.inject({ method: "PATCH", url: `/v1/admin/staff/${staff.id}`, headers: admin.auth, payload: { active: false } });
    expect((await login("XT-014", "Correct-Horse-1")).statusCode).toBe(403);
    expect((await login("NOPE", "Correct-Horse-1")).statusCode).toBe(401);
  });
});

describe("new order alerts", () => {
  it("notifies active staff with alerts on, not those who switched them off", async () => {
    const admin = await signInAs(t, "admin");
    const onStaff = await signInAs(t, "staff", "Ahmed");
    const offStaff = await signInAs(t, "staff", "Maria");
    await t.app.inject({ method: "PATCH", url: `/v1/admin/staff/${offStaff.user.id}`, headers: admin.auth, payload: { notifyNewOrders: false } });
    const customer = await signInPhone(t);
    const booking = await book(t, customer.auth);
    // Nothing goes to staff until the booking is paid (and so confirmed).
    await new Promise((r) => setTimeout(r, 150));
    expect((await get("/v1/me/notifications", onStaff.auth)).json().some((n: { title: string }) => n.title.startsWith("New order"))).toBe(false);
    await pay(t, customer.auth, booking.id);
    await waitFor(async () => (await get("/v1/me/notifications", onStaff.auth)).json().some((n: { title: string }) => n.title === `New order ${booking.reference}`));
    const offInbox = (await get("/v1/me/notifications", offStaff.auth)).json();
    expect(offInbox.some((n: { title: string }) => n.title.startsWith("New order"))).toBe(false);
  });
});

describe("automatic invoice email", () => {
  async function paidBooking() {
    const customer = await signInPhone(t, undefined, "Sara Al Mansoori");
    await t.app.inject({ method: "PATCH", url: "/v1/me", headers: customer.auth, payload: { email: "sara@example.com" } });
    const booking = await book(t, customer.auth);
    await post(`/v1/bookings/${booking.id}/payments`, customer.auth, { method: "card" });
    const intentId = [...t.card.intents.keys()].at(-1)!;
    t.card.succeed(intentId);
    await t.app.inject({
      method: "POST",
      url: "/v1/webhooks/stripe",
      headers: { "stripe-signature": "good", "content-type": "application/json" },
      payload: JSON.stringify({ id: `evt_${intentId}`, type: "payment_intent.succeeded", intentId }),
    });
    return { customer, booking };
  }

  async function complete(bookingId: string) {
    const admin = await signInAs(t, "admin");
    const staff = await signInAs(t, "staff");
    await post(`/v1/admin/bookings/${bookingId}/assign`, admin.auth, { staffIds: [staff.user.id] });
    for (const status of ["en_route", "arrived", "in_progress", "completed"]) await post(`/v1/staff/jobs/${bookingId}/status`, staff.auth, { status });
    return admin;
  }

  it("emails the tax invoice once when a paid job is completed, and the office can resend it", async () => {
    const { booking } = await paidBooking();
    expect(t.mail.outbox).toHaveLength(0);
    const admin = await complete(booking.id);
    await waitFor(() => t.mail.outbox.length === 1);
    const mail = t.mail.outbox[0]!;
    expect(mail.to).toBe("sara@example.com");
    expect(mail.subject).toContain(booking.reference);
    expect(mail.html).toContain("TAX INVOICE");
    expect(mail.html).toContain("VAT 5%");
    expect(mail.html).toContain("AED 7.14");
    expect(mail.html).toContain("https://api.xtreme.test/brand/logo.png");
    expect(mail.text).toContain("Total (incl. VAT): AED 150.00");

    const detail = (await get(`/v1/bookings/${booking.id}`, admin.auth)).json();
    expect(detail.invoiceSentAt).toBeTruthy();
    // No duplicate on later events; explicit resend works.
    await t.c.invoices.sendIfDue(booking.id);
    expect(t.mail.outbox).toHaveLength(1);
    expect((await post(`/v1/admin/bookings/${booking.id}/invoice/email`, admin.auth)).json()).toEqual({ sentTo: "sara@example.com" });
    expect(t.mail.outbox).toHaveLength(2);
  });

  it("waits for payment when the job is completed first", async () => {
    const customer = await signInPhone(t, undefined, "Omar");
    await t.app.inject({ method: "PATCH", url: "/v1/me", headers: customer.auth, payload: { email: "omar@example.com" } });
    const booking = await book(t, customer.auth);
    await complete(booking.id);
    await new Promise((r) => setTimeout(r, 200));
    expect(t.mail.outbox).toHaveLength(0);
  });

  it("serves the logo used in emails", async () => {
    const res = await t.app.inject({ method: "GET", url: "/brand/logo.png" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
  });
});
