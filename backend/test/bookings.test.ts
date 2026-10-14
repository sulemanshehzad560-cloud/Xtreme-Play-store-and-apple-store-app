import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { io as connect, type Socket } from "socket.io-client";
import type { AddressInfo } from "node:net";
import { ADDRESS, book, createTestApp, resetDb, signInAs, signInPhone, slot, type TestContext } from "./helpers.js";

let t: TestContext;
let baseUrl: string;
beforeAll(async () => {
  t = await createTestApp();
  await t.app.listen({ port: 0, host: "127.0.0.1" });
  baseUrl = `http://127.0.0.1:${(t.app.server.address() as AddressInfo).port}`;
});
const sockets: Socket[] = [];
afterAll(() => t.app.close());
beforeEach(resetDb);
afterEach(() => {
  while (sockets.length) sockets.pop()!.close();
});
const open = (token?: string) => {
  const s = connect(baseUrl, { path: "/realtime", auth: token ? { token } : {}, transports: ["websocket"] });
  sockets.push(s);
  return s;
};

const post = (url: string, auth: Record<string, string>, payload: unknown = {}) => t.app.inject({ method: "POST", url, headers: auth, payload: payload as object });
const get = (url: string, auth: Record<string, string>) => t.app.inject({ method: "GET", url, headers: auth });

describe("booking a service", () => {
  it("prices on the server, snapshots the address and gives a reference", async () => {
    const me = await signInPhone(t);
    const res = await post("/v1/bookings", me.auth, {
      serviceKey: "deep",
      propertyType: "villa",
      propertySize: "3bhk",
      scheduledAt: slot(),
      address: ADDRESS,
      priceAed: 1, // ignored: clients never set prices
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: "requested", priceAed: 1300, pricing: "fixed", paymentStatus: "unpaid", canPay: true });
    expect(res.json().reference).toMatch(/^XT-\d+$/);

    const amc = await book(t, me.auth, { plan: "amc", propertySize: "2bhk" });
    expect(amc.priceAed).toBe(375);
    const survey = await book(t, me.auth, { serviceKey: "pest" });
    expect(survey.priceAed).toBeNull();
  });

  it("is idempotent with an Idempotency-Key", async () => {
    const me = await signInPhone(t);
    const body = { serviceKey: "regular", propertyType: "apartment", propertySize: "studio", scheduledAt: slot(), address: ADDRESS };
    const headers = { ...me.auth, "idempotency-key": "booking-attempt-1" };
    const [a, b] = await Promise.all([
      t.app.inject({ method: "POST", url: "/v1/bookings", headers, payload: body }),
      t.app.inject({ method: "POST", url: "/v1/bookings", headers, payload: body }),
    ]);
    expect(a.json().id).toBe(b.json().id);
    expect((await get("/v1/bookings", me.auth)).json()).toHaveLength(1);
  });

  it("validates the schedule and needs a verified phone", async () => {
    const me = await signInPhone(t);
    const tooSoon = await post("/v1/bookings", me.auth, { serviceKey: "deep", propertyType: "apartment", propertySize: "2bhk", scheduledAt: new Date(Date.now() + 3600_000).toISOString(), address: ADDRESS });
    expect(tooSoon.json().error.code).toBe("too_soon");
    const night = new Date(slot());
    night.setUTCHours(20); // midnight Abu Dhabi
    const late = await post("/v1/bookings", me.auth, { serviceKey: "deep", propertyType: "apartment", propertySize: "2bhk", scheduledAt: night.toISOString(), address: ADDRESS });
    expect(late.json().error.code).toBe("outside_hours");
    const badSize = await post("/v1/bookings", me.auth, { serviceKey: "deep", propertyType: "office", propertySize: "2bhk", scheduledAt: slot(), address: ADDRESS });
    expect(badSize.json().error.code).toBe("invalid_booking");

    const g = await t.app.inject({ method: "POST", url: "/v1/auth/google", payload: { idToken: "valid:g-77:x@example.com" } });
    const noPhone = await post("/v1/bookings", { authorization: `Bearer ${g.json().accessToken}` }, { serviceKey: "deep", propertyType: "apartment", propertySize: "2bhk", scheduledAt: slot(), address: ADDRESS });
    expect(noPhone.json().error.code).toBe("phone_required");
  });

  it("books with a saved address", async () => {
    const me = await signInPhone(t);
    const addr = (await post("/v1/me/addresses", me.auth, ADDRESS)).json();
    expect(addr.isDefault).toBe(true);
    const b = await book(t, me.auth, { address: undefined, addressId: addr.id });
    expect((await get(`/v1/bookings/${b.id}`, me.auth)).json().address).toMatchObject({ area: "Al Reem Island", unit: "1204" });
  });

  it("hides other customers' bookings", async () => {
    const a = await signInPhone(t);
    const b = await signInPhone(t);
    const booking = await book(t, a.auth);
    expect((await get(`/v1/bookings/${booking.id}`, b.auth)).statusCode).toBe(404);
    expect((await post(`/v1/bookings/${booking.id}/cancel`, b.auth)).statusCode).toBe(404);
  });
});

describe("dispatch, job updates and live tracking", () => {
  it("runs a job end to end with live location for the customer", async () => {
    const customer = await signInPhone(t);
    const admin = await signInAs(t, "admin");
    const lead = await signInAs(t, "staff", "Ahmed");
    const helper = await signInAs(t, "staff", "Bilal");
    const booking = await book(t, customer.auth);

    expect((await post(`/v1/admin/bookings/${booking.id}/confirm`, admin.auth)).json().status).toBe("confirmed");
    const assigned = await post(`/v1/admin/bookings/${booking.id}/assign`, admin.auth, { staffIds: [helper.user.id, lead.user.id], leadId: lead.user.id });
    expect(assigned.json().team.map((m: { displayName: string; isLead: boolean }) => [m.displayName, m.isLead])).toEqual([["Ahmed", true], ["Bilal", false]]);

    // Before the team sets off, the customer sees who is coming but not where they are.
    const before = (await get(`/v1/bookings/${booking.id}/tracking`, customer.auth)).json();
    expect(before).toMatchObject({ live: false, location: null, etaMinutes: null });

    // Customer subscribes over the socket.
    const sock = open(customer.accessToken);
    const sub = await sock.emitWithAck("booking:subscribe", { bookingId: booking.id });
    expect(sub.ok).toBe(true);
    const events: { event: string; data: any }[] = [];
    sock.on("staff:location", (data) => events.push({ event: "staff:location", data }));
    sock.on("booking:status", (data) => events.push({ event: "booking:status", data }));

    // Helper is not the lead and cannot move the job.
    await t.app.inject({ method: "PUT", url: "/v1/staff/me/status", headers: lead.auth, payload: { status: "available" } });
    expect((await post(`/v1/staff/jobs/${booking.id}/status`, helper.auth, { status: "en_route" })).statusCode).toBe(403);
    expect((await post(`/v1/staff/jobs/${booking.id}/status`, lead.auth, { status: "en_route" })).json().status).toBe("en_route");
    expect((await get("/v1/staff/me", lead.auth)).json().status).toBe("en_route");

    // Lead's phone streams its position (about 6 km away).
    const staffSock = open(lead.accessToken);
    const ack = await staffSock.emitWithAck("location:update", { lat: 24.45, lng: 54.38, heading: 45, speed: 12 });
    expect(ack).toMatchObject({ ok: true, data: { accepted: 1 } });
    await new Promise((r) => setTimeout(r, 150));

    const loc = events.find((e) => e.event === "staff:location")!.data;
    expect(loc).toMatchObject({ bookingId: booking.id, staffId: lead.user.id, lat: 24.45, lng: 54.38 });
    expect(loc.etaMinutes).toBeGreaterThan(5);

    const live = (await get(`/v1/bookings/${booking.id}/tracking`, customer.auth)).json();
    expect(live).toMatchObject({ live: true, location: { lat: 24.45, lng: 54.38, stale: false } });

    for (const status of ["arrived", "in_progress", "completed"]) {
      expect((await post(`/v1/staff/jobs/${booking.id}/status`, lead.auth, { status })).json().status).toBe(status);
    }
    await new Promise((r) => setTimeout(r, 100));
    expect(events.filter((e) => e.event === "booking:status").map((e) => e.data.status)).toEqual(["en_route", "arrived", "in_progress", "completed"]);
    expect((await get("/v1/staff/me", lead.auth)).json().status).toBe("available");

    // After completion: location hidden again, timeline recorded, review once.
    expect((await get(`/v1/bookings/${booking.id}/tracking`, customer.auth)).json().location).toBeNull();
    const detail = (await get(`/v1/bookings/${booking.id}`, customer.auth)).json();
    expect(detail.timeline.map((e: { to: string | null }) => e.to)).toEqual(["requested", "confirmed", "assigned", "en_route", "arrived", "in_progress", "completed"]);
    expect((await post(`/v1/bookings/${booking.id}/review`, customer.auth, { rating: 5, comment: "Great" })).statusCode).toBe(200);
    expect((await post(`/v1/bookings/${booking.id}/review`, customer.auth, { rating: 4 })).json().error.code).toBe("already_reviewed");

    // Customer was told each step.
    const inbox = (await get("/v1/me/notifications", customer.auth)).json().map((n: { title: string }) => n.title);
    expect(inbox).toContain("Your team is on the way");
    expect(inbox).toContain("Job completed");

    sock.close();
    staffSock.close();
  });

  it("refuses socket subscriptions to someone else's booking and unauthenticated sockets", async () => {
    const owner = await signInPhone(t);
    const other = await signInPhone(t);
    const booking = await book(t, owner.auth);
    const sock = open(other.accessToken);
    const res = await sock.emitWithAck("booking:subscribe", { bookingId: booking.id });
    expect(res).toMatchObject({ ok: false, error: { code: "not_found" } });
    sock.close();

    const anon = open();
    const err = await new Promise<Error>((resolve) => anon.on("connect_error", resolve));
    expect(err.message).toBe("unauthorized");
    anon.close();
  });

  it("ignores positions while off duty and shows public availability as counts only", async () => {
    const lead = await signInAs(t, "staff");
    const off = await post("/v1/staff/me/location", lead.auth, { pings: [{ lat: 24.49, lng: 54.4 }] });
    expect(off.json().accepted).toBe(0);
    await t.app.inject({ method: "PUT", url: "/v1/staff/me/status", headers: lead.auth, payload: { status: "available" } });
    await post("/v1/staff/me/location", lead.auth, { pings: [{ lat: 24.49, lng: 54.4, accuracy: 10 }] });

    const res = await t.app.inject({ method: "GET", url: "/v1/staff/availability?lat=24.4958&lng=54.4035" });
    expect(res.json()).toMatchObject({ onDuty: 1, available: 1, deployed: 0, nearbyAvailable: 1 });
    expect(JSON.stringify(res.json())).not.toContain("54.4,"); // no coordinates leak
  });

  it("enforces who can do what", async () => {
    const customer = await signInPhone(t);
    const staff = await signInAs(t, "staff");
    const booking = await book(t, customer.auth);
    expect((await post(`/v1/admin/bookings/${booking.id}/confirm`, customer.auth)).statusCode).toBe(403);
    expect((await post(`/v1/staff/jobs/${booking.id}/status`, staff.auth, { status: "en_route" })).statusCode).toBe(404);
    const admin = await signInAs(t, "admin");
    await post(`/v1/admin/bookings/${booking.id}/assign`, admin.auth, { staffIds: [staff.user.id] });
    await post(`/v1/staff/jobs/${booking.id}/status`, staff.auth, { status: "en_route" });
    const late = await post(`/v1/bookings/${booking.id}/cancel`, customer.auth);
    expect(late.json().error.code).toBe("invalid_transition");
    expect((await post(`/v1/staff/jobs/${booking.id}/status`, staff.auth, { status: "completed" })).json().error.code).toBe("invalid_transition");
  });
});
