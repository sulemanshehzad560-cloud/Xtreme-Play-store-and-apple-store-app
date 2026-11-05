import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeMediaRooms } from "../src/modules/calls/livekit.js";
import { book, createTestApp, resetDb, signInAs, signInPhone, type TestContext } from "./helpers.js";

let t: TestContext;
const media = new FakeMediaRooms();
beforeAll(async () => {
  t = await createTestApp({}, { media });
});
afterAll(() => t.app.close());
beforeEach(async () => {
  media.log.length = 0;
  await resetDb();
});

const req = (method: "GET" | "POST", url: string, auth: Record<string, string> = {}, headers: Record<string, string> = {}) =>
  t.app.inject({ method, url, headers: { ...auth, ...headers }, ...(method === "POST" ? { payload: {} } : {}) });

describe("recorded calls through LiveKit", () => {
  it("records every answered call, lets the office listen live and play it back", async () => {
    const customer = await signInPhone(t, "+971501231111", "Noura Customer");
    const admin = await signInAs(t, "admin");
    const lead = await signInAs(t, "staff", "Bilal");
    const booking = await book(t, customer.auth, { serviceKey: "mattress" });
    await t.app.inject({ method: "POST", url: `/v1/admin/bookings/${booking.id}/assign`, headers: admin.auth, payload: { staffIds: [lead.user.id], leadId: lead.user.id } });

    const started = (await req("POST", `/v1/bookings/${booking.id}/voip`, customer.auth)).json();
    expect(started.livekit).toEqual({ url: "wss://xtreme-test.livekit.cloud", token: `token-${customer.user.id}` });
    expect(started.recorded).toBe(true);
    const room = `call-${started.callId}`;
    expect(media.log).toContain(`create ${room}`);

    const answered = (await req("POST", `/v1/calls/${started.callId}/answer`, lead.auth)).json();
    expect(answered.livekit.token).toBe(`token-${lead.user.id}`);
    expect(media.log.some((l) => l.startsWith(`record ${room} calls/`) && l.endsWith(`${started.callId}.ogg`))).toBe(true);

    // The office sees it live and can listen hidden; customers and staff can't.
    const list = (await req("GET", "/v1/admin/calls", admin.auth)).json();
    expect(list.mode).toEqual({ relay: true, recorded: true });
    expect(list.calls[0]).toMatchObject({ live: true, reference: booking.reference, caller: "Noura Customer", callee: "Bilal", recording: { status: "recording" } });
    expect(JSON.stringify(list)).not.toMatch(/\+971/);
    const listen = (await req("POST", `/v1/admin/calls/${started.callId}/listen`, admin.auth)).json();
    expect(listen.token).toMatch(/-listener$/);
    expect(media.log.some((l) => l.includes(" listener"))).toBe(true);
    expect((await req("POST", `/v1/admin/calls/${started.callId}/listen`, lead.auth)).statusCode).toBe(403);

    // Hang up: recording stops and the room closes.
    await req("POST", `/v1/calls/${started.callId}/end`, lead.auth);
    expect(media.log).toContain(`stop EG_${room}`);
    expect(media.log).toContain(`close ${room}`);
    expect((await req("POST", `/v1/admin/calls/${started.callId}/listen`, admin.auth)).json().error.code).toBe("not_live");

    // LiveKit reports the file is saved.
    await t.app.inject({
      method: "POST",
      url: "/v1/livekit/webhook",
      headers: { "content-type": "application/webhook+json", authorization: "test" },
      payload: JSON.stringify({ event: "egress_ended", egressInfo: { egressId: `EG_${room}`, status: 3, fileResults: [{ size: 48213 }] } }),
    });
    const after = (await req("GET", "/v1/admin/calls", admin.auth)).json().calls[0];
    expect(after.recording).toMatchObject({ status: "ready", bytes: 48213 });

    // The dashboard plays it through a signed link; a wrong signature is refused.
    const path = new URL(after.recording.url).pathname;
    const audio = await req("GET", path);
    expect(audio.statusCode).toBe(200);
    expect(audio.headers["content-type"]).toContain("audio/ogg");
    expect(audio.body).toContain("OggS");
    expect((await req("GET", path.replace(/[0-9a-f]{32}$/, "f".repeat(32)))).statusCode).toBe(404);
  });
});
