import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { bookingCalls, staffProfiles, users } from "../../db/schema.js";
import type { Env } from "../../config/env.js";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";
import type { Actor, BookingService } from "../bookings/booking.service.js";
import type { NotificationService } from "../notifications/notification.service.js";
import { rooms, type RealtimeHub } from "../tracking/realtime.js";
import { CALLABLE } from "./voice.service.js";
import type { MediaRooms } from "./livekit.js";

/** How long a call rings before it counts as missed. */
export const RING_SECONDS = 45;

type CallRow = typeof bookingCalls.$inferSelect;

/**
 * Free in-app voice calls (WebRTC) between a customer and the team on their booking. The server
 * only introduces the two phones (ringing, answer, and relaying connection details over the app's
 * live connection); the voice goes directly between the phones, or through a TURN relay when
 * mobile networks block a direct path. No phone numbers are involved, so neither side sees one.
 */
export class InAppCallService {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly db: Database,
    private readonly bookings: BookingService,
    private readonly notifications: NotificationService,
    private readonly hub: RealtimeHub,
    private readonly env: Pick<Env, "TURN_URLS" | "TURN_USERNAME" | "TURN_CREDENTIAL" | "PUBLIC_URL" | "JWT_SECRET">,
    private readonly media: MediaRooms,
  ) {}

  /** Whether calls run through LiveKit (recorded, office can listen) or directly between phones. */
  get mode() {
    return { relay: this.media.enabled, recorded: this.media.enabled && this.media.recording };
  }

  /** STUN for direct connections, plus TURN relays when configured. */
  iceServers() {
    const servers: { urls: string | string[]; username?: string; credential?: string }[] = [
      { urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },
    ];
    if (this.env.TURN_URLS.length && this.env.TURN_USERNAME && this.env.TURN_CREDENTIAL) {
      servers.push({ urls: this.env.TURN_URLS, username: this.env.TURN_USERNAME, credential: this.env.TURN_CREDENTIAL });
    }
    return servers;
  }

  /** What each side sees: a name, never a number. */
  private async names(customerId: string, staffId: string) {
    const [staff] = await this.db.select({ name: staffProfiles.displayName }).from(staffProfiles).where(eq(staffProfiles.userId, staffId)).limit(1);
    const [customer] = await this.db.select({ name: users.fullName }).from(users).where(eq(users.id, customerId)).limit(1);
    return { staff: staff?.name ? `${staff.name} · Xtreme team` : "Your Xtreme team", customer: customer?.name?.split(" ")[0] ?? "Customer" };
  }

  /** Starts ringing the other side of the booking. */
  async start(bookingId: string, actor: Actor) {
    if (actor.role === "admin") throw forbidden("Call the customer from the office phone", "not_allowed");
    const booking = await this.bookings.loadFor(bookingId, actor);
    if (!(CALLABLE as readonly string[]).includes(booking.status)) throw conflict("not_callable", "Calls open once a team is assigned and close when the job is done");
    const team = await this.bookings.team(bookingId);
    const lead = team.find((m) => m.isLead) ?? team[0];
    if (!lead) throw conflict("no_team_yet", "Your team hasn't been assigned yet");
    const calleeId = actor.role === "customer" ? lead.userId : booking.customerId;
    const staffId = actor.role === "customer" ? lead.userId : actor.id;

    // One live call per pair at a time: end any stale ringing call first.
    const live = await this.db
      .select()
      .from(bookingCalls)
      .where(and(eq(bookingCalls.bookingId, bookingId), eq(bookingCalls.kind, "voip"), inArray(bookingCalls.status, ["ringing", "answered"])));
    for (const c of live) await this.finish(c, "ended", null);

    const [call] = await this.db
      .insert(bookingCalls)
      .values({ bookingId, callerId: actor.id, callerRole: actor.role, calleeId, kind: "voip", status: "ringing" })
      .returning();
    const names = await this.names(booking.customerId, staffId);
    const fromName = actor.role === "customer" ? names.customer : names.staff;
    const toName = actor.role === "customer" ? names.staff : names.customer;

    let livekit: { url: string; token: string } | null = null;
    if (this.media.enabled) {
      const room = `call-${call!.id}`;
      try {
        await this.media.createRoom(room);
        livekit = { url: this.media.url!, token: await this.media.token(room, actor.id, fromName) };
        await this.db.update(bookingCalls).set({ room }).where(eq(bookingCalls.id, call!.id));
      } catch {
        livekit = null; // LiveKit unreachable: fall back to a direct call.
      }
    }

    const recorded = !!livekit && this.media.recording;
    this.hub.emit(rooms.user(calleeId), "call:incoming", { callId: call!.id, bookingId, reference: booking.reference, fromName, recorded });
    // Wakes the other side if the app is closed; tapping it opens the incoming-call screen.
    void this.notifications.notify([calleeId], {
      title: `📞 ${fromName} is calling`,
      body: `About booking ${booking.reference}. Tap to answer in the app.${recorded ? " Calls are recorded for training and quality purposes." : ""}`,
      data: { type: "call", callId: call!.id, bookingId },
    });
    this.timers.set(
      call!.id,
      setTimeout(() => void this.expire(call!.id), RING_SECONDS * 1000),
    );
    return { callId: call!.id, bookingId, reference: booking.reference, peerName: toName, iceServers: this.iceServers(), ringSeconds: RING_SECONDS, livekit, recorded: !!livekit && this.media.recording };
  }

  private async load(callId: string, actor: Actor) {
    const [call] = await this.db.select().from(bookingCalls).where(and(eq(bookingCalls.id, callId), eq(bookingCalls.kind, "voip"))).limit(1);
    if (!call || (call.callerId !== actor.id && call.calleeId !== actor.id)) throw notFound("Call");
    return call;
  }

  /** The call's state (e.g. when the app is opened from an incoming-call notification). */
  async get(callId: string, actor: Actor) {
    const call = await this.load(callId, actor);
    const ringingTooLong = call.status === "ringing" && Date.now() - call.createdAt.getTime() > RING_SECONDS * 1000;
    if (ringingTooLong) await this.finish(call, "missed", null);
    const booking = call.bookingId ? await this.bookings.loadFor(call.bookingId, actor) : null;
    const team = call.bookingId ? await this.bookings.team(call.bookingId) : [];
    const staffId = call.callerRole === "staff" ? call.callerId! : (team.find((m) => m.isLead) ?? team[0])?.userId;
    const names = booking && staffId ? await this.names(booking.customerId, staffId) : { staff: "Xtreme team", customer: "Customer" };
    const iAmCaller = call.callerId === actor.id;
    const peerIsStaff = iAmCaller ? call.callerRole === "customer" : call.callerRole === "staff";
    return {
      callId: call.id,
      bookingId: call.bookingId,
      reference: booking?.reference ?? null,
      status: ringingTooLong ? "missed" : call.status,
      role: iAmCaller ? "caller" : "callee",
      peerName: peerIsStaff ? names.staff : names.customer,
      iceServers: this.iceServers(),
      recorded: !!call.room && this.media.recording,
    };
  }

  async answer(callId: string, actor: Actor) {
    const call = await this.load(callId, actor);
    if (call.calleeId !== actor.id) throw forbidden("Only the person being called can answer", "not_callee");
    if (call.status !== "ringing") throw conflict("call_over", call.status === "answered" ? "This call was already answered" : "This call has ended");
    this.clearTimer(callId);
    const now = new Date();
    await this.db.update(bookingCalls).set({ status: "answered", answeredAt: now }).where(eq(bookingCalls.id, callId));
    let livekit: { url: string; token: string } | null = null;
    if (call.room && this.media.enabled) {
      livekit = { url: this.media.url!, token: await this.media.token(call.room, actor.id, actor.role === "staff" ? "Xtreme team" : "Customer") };
      // Every connected call is recorded on the server.
      const key = `calls/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${callId}.ogg`;
      try {
        const rec = await this.media.startRecording(call.room, key);
        if (rec) await this.db.update(bookingCalls).set({ egressId: rec.egressId, recordingKey: key, recordingStatus: "recording" }).where(eq(bookingCalls.id, callId));
      } catch {
        await this.db.update(bookingCalls).set({ recordingStatus: "failed" }).where(eq(bookingCalls.id, callId));
      }
    }
    this.hub.emit(rooms.user(call.callerId!), "call:answered", { callId });
    // Other devices of the callee stop ringing.
    this.hub.emit(rooms.user(actor.id), "call:taken", { callId });
    this.hub.emit(rooms.admins, "call:live", { callId });
    return { callId, iceServers: this.iceServers(), livekit, recorded: !!livekit && this.media.recording };
  }

  async decline(callId: string, actor: Actor) {
    const call = await this.load(callId, actor);
    if (call.status !== "ringing") return { ok: true };
    await this.finish(call, call.calleeId === actor.id ? "declined" : "cancelled", actor.id);
    return { ok: true };
  }

  async end(callId: string, actor: Actor) {
    const call = await this.load(callId, actor);
    if (call.status === "ringing") await this.finish(call, call.callerId === actor.id ? "cancelled" : "declined", actor.id);
    else if (call.status === "answered") await this.finish(call, "ended", actor.id);
    return { ok: true };
  }

  /** Relays connection details (offer/answer/ICE candidates) to the other side only. */
  async relay(callId: string, actor: Actor, data: unknown) {
    const call = await this.load(callId, actor);
    if (call.status !== "ringing" && call.status !== "answered") throw conflict("call_over", "This call has ended");
    const other = call.callerId === actor.id ? call.calleeId : call.callerId;
    if (other) this.hub.emit(rooms.user(other), "call:signal", { callId, data });
    return null;
  }

  private clearTimer(callId: string) {
    const t = this.timers.get(callId);
    if (t) clearTimeout(t);
    this.timers.delete(callId);
  }

  private async expire(callId: string) {
    this.timers.delete(callId);
    const [call] = await this.db.select().from(bookingCalls).where(eq(bookingCalls.id, callId)).limit(1);
    if (call?.status === "ringing") await this.finish(call, "missed", null).catch(() => undefined);
  }

  private async finish(call: CallRow, status: "ended" | "missed" | "declined" | "cancelled", by: string | null) {
    this.clearTimer(call.id);
    const now = new Date();
    const durationSeconds = call.answeredAt ? Math.round((now.getTime() - call.answeredAt.getTime()) / 1000) : 0;
    const rows = await this.db
      .update(bookingCalls)
      .set({ status, endedAt: now, durationSeconds })
      .where(and(eq(bookingCalls.id, call.id), inArray(bookingCalls.status, ["ringing", "answered"])))
      .returning();
    if (!rows.length) return;
    for (const uid of [call.callerId, call.calleeId]) if (uid) this.hub.emit(rooms.user(uid), "call:ended", { callId: call.id, status, by });
    this.hub.emit(rooms.admins, "call:live", { callId: call.id });
    const fresh = rows[0]!;
    if (fresh.egressId) {
      await this.media.stopRecording(fresh.egressId);
      await this.db.update(bookingCalls).set({ recordingStatus: "saving" }).where(and(eq(bookingCalls.id, call.id), eq(bookingCalls.recordingStatus, "recording")));
    }
    if (fresh.room) await this.media.closeRoom(fresh.room);
    if (status === "missed" && call.calleeId && call.bookingId) {
      const booking = await this.bookings.loadFor(call.bookingId, { id: call.calleeId, role: call.callerRole === "customer" ? "staff" : "customer" }).catch(() => null);
      void this.notifications.notify([call.calleeId], {
        title: "Missed call",
        body: `${call.callerRole === "customer" ? "Your customer" : "Your Xtreme team"} tried to call about ${booking?.reference ?? "your booking"}. Open the booking to call back.`,
        data: { type: call.callerRole === "customer" ? "job" : "booking", bookingId: call.bookingId },
      });
    }
  }

  // ------------------------------------------------------------ office

  /** Recent calls with names, booking and recording (no phone numbers). */
  async list(limit = 100) {
    const rows = await this.db.select().from(bookingCalls).where(eq(bookingCalls.kind, "voip")).orderBy(desc(bookingCalls.createdAt)).limit(limit);
    const ids = [...new Set(rows.flatMap((r) => [r.callerId, r.calleeId]).filter((x): x is string => !!x))];
    const people = ids.length ? await this.db.select({ id: users.id, name: users.fullName, role: users.role }).from(users).where(inArray(users.id, ids)) : [];
    const staff = ids.length ? await this.db.select({ id: staffProfiles.userId, name: staffProfiles.displayName, supplier: staffProfiles.isSupplier, company: staffProfiles.supplierCompany }).from(staffProfiles).where(inArray(staffProfiles.userId, ids)) : [];
    const name = (id: string | null) => {
      if (!id) return "—";
      const st = staff.find((x) => x.id === id);
      if (st) return `${st.name}${st.supplier ? ` (${st.company ?? "supplier"})` : ""}`;
      return people.find((x) => x.id === id)?.name ?? "Customer";
    };
    const refs = await this.bookingRefs(rows.map((r) => r.bookingId).filter((x): x is string => !!x));
    return rows.map((r) => ({
      id: r.id,
      bookingId: r.bookingId,
      reference: r.bookingId ? (refs.get(r.bookingId) ?? null) : null,
      caller: name(r.callerId),
      callerRole: r.callerRole,
      callee: name(r.calleeId),
      status: r.status,
      live: r.status === "answered" && !!r.room,
      createdAt: r.createdAt.toISOString(),
      answeredAt: r.answeredAt?.toISOString() ?? null,
      durationSeconds: r.durationSeconds,
      recording: r.recordingKey ? { status: r.recordingStatus, url: this.recordingUrl(r.id), bytes: r.recordingBytes } : null,
    }));
  }

  private async bookingRefs(ids: string[]) {
    const map = new Map<string, string>();
    if (!ids.length) return map;
    const { bookings } = await import("../../db/schema.js");
    const rows = await this.db.select({ id: bookings.id, reference: bookings.reference }).from(bookings).where(inArray(bookings.id, [...new Set(ids)]));
    for (const r of rows) map.set(r.id, r.reference);
    return map;
  }

  /** The office joins a live call hidden and listen-only. */
  async listen(callId: string, admin: Actor) {
    if (admin.role !== "admin") throw forbidden("Only the office can listen to calls", "not_admin");
    const [call] = await this.db.select().from(bookingCalls).where(eq(bookingCalls.id, callId)).limit(1);
    if (!call) throw notFound("Call");
    if (call.status !== "answered" || !call.room || !this.media.enabled) throw conflict("not_live", "This call isn't live (or isn't running through the recorded call service)");
    return { url: this.media.url!, token: await this.media.token(call.room, `office-${admin.id}-${Date.now()}`, "Xtreme office", { listener: true }) };
  }

  private signature(callId: string) {
    return createHmac("sha256", this.env.JWT_SECRET).update(`call-recording:${callId}`).digest("hex").slice(0, 32);
  }

  private recordingUrl(callId: string) {
    return `${this.env.PUBLIC_URL}/v1/call-recordings/${callId}/${this.signature(callId)}`;
  }

  /** Plays a recording for a signed link (the dashboard's audio player). */
  async recording(callId: string, sig: string, range?: string) {
    const expected = Buffer.from(this.signature(callId));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw notFound("Recording");
    const [call] = await this.db.select().from(bookingCalls).where(eq(bookingCalls.id, callId)).limit(1);
    if (!call?.recordingKey) throw notFound("Recording");
    return this.media.recordingStream(call.recordingKey, range);
  }

  /** LiveKit tells us when recordings finish and rooms close. */
  async onWebhook(body: string, auth: string | undefined) {
    const ev = await this.media.webhook(body, auth);
    if (ev.event === "egress_ended" && ev.egressInfo) {
      const info = ev.egressInfo as { egressId: string; status?: number | string; fileResults?: { size?: bigint | number }[] };
      const ok = info.status === 3 || info.status === "EGRESS_COMPLETE";
      const size = info.fileResults?.[0]?.size;
      await this.db
        .update(bookingCalls)
        .set({ recordingStatus: ok ? "ready" : "failed", ...(size != null ? { recordingBytes: Number(size) } : {}) })
        .where(eq(bookingCalls.egressId, info.egressId));
    }
    if (ev.event === "room_finished" && ev.room?.name?.startsWith("call-")) {
      const [call] = await this.db.select().from(bookingCalls).where(eq(bookingCalls.room, ev.room.name)).limit(1);
      if (call && (call.status === "answered" || call.status === "ringing")) await this.finish(call, call.status === "answered" ? "ended" : "missed", null);
    }
    return { ok: true };
  }

  /** Stops ring timers (server shutdown, tests). */
  close() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  static validateSignal(data: unknown) {
    const size = JSON.stringify(data ?? null).length;
    if (size > 20_000) throw badRequest("signal_too_large", "Connection details too large");
  }
}
