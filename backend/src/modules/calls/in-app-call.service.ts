import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { bookingCalls, staffProfiles, users } from "../../db/schema.js";
import type { Env } from "../../config/env.js";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";
import type { Actor, BookingService } from "../bookings/booking.service.js";
import type { NotificationService } from "../notifications/notification.service.js";
import { rooms, type RealtimeHub } from "../tracking/realtime.js";
import { CALLABLE } from "./voice.service.js";

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
    private readonly env: Pick<Env, "TURN_URLS" | "TURN_USERNAME" | "TURN_CREDENTIAL">,
  ) {}

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

    this.hub.emit(rooms.user(calleeId), "call:incoming", { callId: call!.id, bookingId, reference: booking.reference, fromName });
    // Wakes the other side if the app is closed; tapping it opens the incoming-call screen.
    void this.notifications.notify([calleeId], {
      title: `📞 ${fromName} is calling`,
      body: `About booking ${booking.reference}. Tap to answer in the app.`,
      data: { type: "call", callId: call!.id, bookingId },
    });
    this.timers.set(
      call!.id,
      setTimeout(() => void this.expire(call!.id), RING_SECONDS * 1000),
    );
    return { callId: call!.id, bookingId, reference: booking.reference, peerName: toName, iceServers: this.iceServers(), ringSeconds: RING_SECONDS };
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
    };
  }

  async answer(callId: string, actor: Actor) {
    const call = await this.load(callId, actor);
    if (call.calleeId !== actor.id) throw forbidden("Only the person being called can answer", "not_callee");
    if (call.status !== "ringing") throw conflict("call_over", call.status === "answered" ? "This call was already answered" : "This call has ended");
    this.clearTimer(callId);
    await this.db.update(bookingCalls).set({ status: "answered", answeredAt: new Date() }).where(eq(bookingCalls.id, callId));
    this.hub.emit(rooms.user(call.callerId!), "call:answered", { callId });
    // Other devices of the callee stop ringing.
    this.hub.emit(rooms.user(actor.id), "call:taken", { callId });
    return { callId, iceServers: this.iceServers() };
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
    if (status === "missed" && call.calleeId && call.bookingId) {
      const booking = await this.bookings.loadFor(call.bookingId, { id: call.calleeId, role: call.callerRole === "customer" ? "staff" : "customer" }).catch(() => null);
      void this.notifications.notify([call.calleeId], {
        title: "Missed call",
        body: `${call.callerRole === "customer" ? "Your customer" : "Your Xtreme team"} tried to call about ${booking?.reference ?? "your booking"}. Open the booking to call back.`,
        data: { type: call.callerRole === "customer" ? "job" : "booking", bookingId: call.bookingId },
      });
    }
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
