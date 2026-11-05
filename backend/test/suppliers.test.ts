import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeCallBridge } from "../src/modules/calls/masked-call.js";
import { book, createTestApp, resetDb, signInAs, signInPhone, type TestContext } from "./helpers.js";

let t: TestContext;
const bridge = new FakeCallBridge();
beforeAll(async () => {
  t = await createTestApp({}, { callBridge: bridge });
});
afterAll(() => t.app.close());
beforeEach(async () => {
  bridge.calls.length = 0;
  await resetDb();
});

const req = (method: "GET" | "POST" | "PATCH", url: string, auth: Record<string, string>, payload?: unknown) =>
  t.app.inject({ method, url, headers: auth, ...(payload ? { payload: payload as object } : {}) });

async function setup(supplier: boolean) {
  const customer = await signInPhone(t, "+971501230001", "Sara Customer");
  const admin = await signInAs(t, "admin");
  const lead = await signInAs(t, "staff", "Partner Team");
  if (supplier) {
    const res = await req("PATCH", `/v1/admin/staff/${lead.user.id}`, admin.auth, { isSupplier: true, supplierCompany: "Sparkle Partners LLC" });
    expect(res.json()).toMatchObject({ isSupplier: true, supplierCompany: "Sparkle Partners LLC" });
  }
  const booking = await book(t, customer.auth, { serviceKey: "sofa", notes: "Gate code 1234, call me on 0501230001" });
  await req("POST", `/v1/admin/bookings/${booking.id}/assign`, admin.auth, { staffIds: [lead.user.id], leadId: lead.user.id });
  return { customer, admin, lead, booking };
}

describe("suppliers and number masking", () => {
  it("hides the customer's phone and contact details in notes from a supplier", async () => {
    const { lead, booking } = await setup(true);
    const job = (await req("GET", `/v1/bookings/${booking.id}`, lead.auth)).json();
    expect(job.customer.phone).toBeNull();
    expect(job.customer.phoneHidden).toBe(true);
    expect(job.notes).not.toContain("0501230001");
    const list = (await req("GET", "/v1/staff/me/jobs", lead.auth)).json();
    expect(JSON.stringify(list)).not.toContain("501230001");
    // The customer sees them as an Xtreme partner.
    expect((await req("GET", "/v1/staff/me", lead.auth)).json().isSupplier).toBe(true);
  });

  it("hides the phone from Xtreme's own staff too, but not from the office", async () => {
    const { lead, admin, booking } = await setup(false);
    const job = (await req("GET", `/v1/bookings/${booking.id}`, lead.auth)).json();
    expect(job.customer.phone).toBeNull();
    expect(job.notes).not.toContain("0501230001");
    expect((await req("GET", `/v1/bookings/${booking.id}`, admin.auth)).json().customer.phone).toBe("+971501230001");
  });

  it("removes phone numbers from job chat in both directions", async () => {
    const { customer, lead, admin, booking } = await setup(true);
    const sent = (await req("POST", `/v1/bookings/${booking.id}/messages`, lead.auth, { body: "Hi! WhatsApp me on +971 55 987 6543 for faster reply" })).json();
    expect(sent.redacted).toBe(true);
    expect(sent.message.body).not.toMatch(/987/);
    expect(sent.notice).toMatch(/can't be shared/);
    const reply = (await req("POST", `/v1/bookings/${booking.id}/messages`, customer.auth, { body: "Sure, see you at 10:30" })).json();
    expect(reply.redacted).toBe(false);

    const thread = (await req("GET", `/v1/bookings/${booking.id}/messages`, customer.auth)).json();
    expect(thread.messages.map((m: { body: string }) => m.body).join(" ")).not.toMatch(/\d{5,}/);
    expect(thread.messages[0]).toMatchObject({ sender: "staff", senderName: "Partner Team", mine: false });
    expect(thread.messages[1]).toMatchObject({ sender: "customer", mine: true });
    // The office can read the chat.
    expect((await req("GET", `/v1/bookings/${booking.id}/messages`, admin.auth)).json().messages).toHaveLength(2);
    // The customer is notified.
    const inbox = (await req("GET", "/v1/me/notifications", customer.auth)).json();
    expect(inbox[0].title).toBe("Partner Team sent a message");
    expect(inbox[0].body).not.toMatch(/987/);
  });

  it("keeps outsiders out of the chat", async () => {
    const { booking } = await setup(true);
    const stranger = await signInAs(t, "staff", "Other Team");
    expect((await req("GET", `/v1/bookings/${booking.id}/messages`, stranger.auth)).statusCode).toBe(404);
    expect((await req("POST", `/v1/bookings/${booking.id}/messages`, stranger.auth, { body: "hi" })).statusCode).toBe(404);
  });

  it("connects calls through the masked number, never revealing either side", async () => {
    const { customer, lead, booking } = await setup(true);
    const fromCustomer = (await req("POST", `/v1/bookings/${booking.id}/call`, customer.auth)).json();
    expect(fromCustomer.mode).toBe("bridge");
    expect(JSON.stringify(fromCustomer)).not.toMatch(/\+971/);
    const fromLead = (await req("POST", `/v1/bookings/${booking.id}/call`, lead.auth)).json();
    expect(fromLead.mode).toBe("bridge");
    expect(bridge.calls).toHaveLength(2);
    expect(bridge.calls[0]!.caller).toBe("+971501230001");
    expect(bridge.calls[1]!.callee).toBe("+971501230001");
  });
});
