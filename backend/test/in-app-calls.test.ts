import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { book, createTestApp, resetDb, signInAs, signInPhone, type TestContext } from "./helpers.js";

let t: TestContext;
const events: { room: string; event: string; payload: unknown }[] = [];
beforeAll(async () => {
  t = await createTestApp({ TURN_URLS: "turn:turn.example.com:3478?transport=udp", TURN_USERNAME: "u", TURN_CREDENTIAL: "p" });
  const emit = t.c.hub.emit.bind(t.c.hub);
  t.c.hub.emit = (room, event, payload) => {
    events.push({ room: String(room), event, payload });
    emit(room, event, payload);
  };
});
afterAll(() => t.app.close());
beforeEach(async () => {
  events.length = 0;
  await resetDb();
});

const req = (method: "GET" | "POST", url: string, auth: Record<string, string>) => t.app.inject({ method, url, headers: auth, ...(method === "POST" ? { payload: {} } : {}) });

async function setup() {
  const customer = await signInPhone(t, "+971501239876", "Mariam Customer");
  const admin = await signInAs(t, "admin");
  const lead = await signInAs(t, "staff", "Ahmed");
  const booking = await book(t, customer.auth, { serviceKey: "sofa" });
  return { customer, admin, lead, booking };
}

describe("in-app calls", () => {
  it("only opens once a team is assigned", async () => {
    const { customer, booking } = await setup();
    expect((await req("POST", `/v1/bookings/${booking.id}/voip`, customer.auth)).json().error.code).toBe("not_callable");
  });

  it("rings the team lead, connects on answer and logs the talk time, without any phone numbers", async () => {
    const { customer, admin, lead, booking } = await setup();
    await t.app.inject({ method: "POST", url: `/v1/admin/bookings/${booking.id}/assign`, headers: admin.auth, payload: { staffIds: [lead.user.id], leadId: lead.user.id } });

    const started = (await req("POST", `/v1/bookings/${booking.id}/voip`, customer.auth)).json();
    expect(started.peerName).toBe("Ahmed · Xtreme team");
    expect(started.iceServers).toHaveLength(2);
    expect(started.iceServers[1]).toMatchObject({ username: "u", credential: "p" });
    expect(JSON.stringify(started)).not.toMatch(/\+971/);

    const incoming = events.find((e) => e.event === "call:incoming");
    expect(incoming?.room).toBe(`user:${lead.user.id}`);
    expect(incoming?.payload).toMatchObject({ callId: started.callId, fromName: "Mariam" });
    expect(JSON.stringify(incoming)).not.toMatch(/\+971/);
    // The lead's phone also gets a notification.
    const inbox = (await req("GET", "/v1/me/notifications", lead.auth)).json();
    expect(inbox[0].title).toContain("Mariam is calling");

    // The lead opens it from the notification, then answers.
    expect((await req("GET", `/v1/calls/${started.callId}`, lead.auth)).json()).toMatchObject({ status: "ringing", role: "callee", peerName: "Mariam" });
    expect((await req("POST", `/v1/calls/${started.callId}/answer`, lead.auth)).statusCode).toBe(200);
    expect(events.some((e) => e.event === "call:answered" && e.room === `user:${customer.user.id}`)).toBe(true);
    // Answering twice is refused.
    expect((await req("POST", `/v1/calls/${started.callId}/answer`, lead.auth)).json().error.code).toBe("call_over");

    // Connection details go to the other side only.
    await t.c.calls.relay(started.callId, { id: customer.user.id, role: "customer" }, { type: "offer", sdp: "v=0" });
    expect(events.filter((e) => e.event === "call:signal").map((e) => e.room)).toEqual([`user:${lead.user.id}`]);

    expect((await req("POST", `/v1/calls/${started.callId}/end`, customer.auth)).statusCode).toBe(200);
    expect(events.filter((e) => e.event === "call:ended")).toHaveLength(2);
    expect((await req("GET", "/v1/admin/calls/summary", admin.auth)).json().inApp).toMatchObject({ calls: 1, answered: 1 });
  });

  it("lets the callee decline and keeps outsiders out", async () => {
    const { customer, admin, lead, booking } = await setup();
    await t.app.inject({ method: "POST", url: `/v1/admin/bookings/${booking.id}/assign`, headers: admin.auth, payload: { staffIds: [lead.user.id], leadId: lead.user.id } });
    const started = (await req("POST", `/v1/bookings/${booking.id}/voip`, lead.auth)).json();
    expect(started.peerName).toBe("Mariam");
    const other = await signInAs(t, "staff", "Zaid");
    expect((await req("POST", `/v1/calls/${started.callId}/answer`, other.auth)).statusCode).toBe(404);
    await expect(t.c.calls.relay(started.callId, { id: other.user.id, role: "staff" }, {})).rejects.toThrow();
    expect((await req("POST", `/v1/calls/${started.callId}/answer`, lead.auth)).json().error.code).toBe("not_callee");
    await req("POST", `/v1/calls/${started.callId}/decline`, customer.auth);
    expect((await req("GET", `/v1/calls/${started.callId}`, lead.auth)).json().status).toBe("declined");
  });
});
