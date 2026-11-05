import * as RN from "react-native";
import { MediaStream, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, mediaDevices } from "react-native-webrtc";
import InCallManager from "react-native-incall-manager";
import { api } from "./api";
import { getSocket } from "./realtime";

/**
 * Free in-app voice calls between a customer and their team (WebRTC). The server only rings the
 * other side and passes connection details over the app's live connection; the voice goes directly
 * between the two phones (or through a TURN relay). No phone numbers are used or shown.
 */

export type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "active" | "ended";
export interface CallState {
  phase: CallPhase;
  callId: string | null;
  bookingId: string | null;
  peerName: string;
  reference: string | null;
  startedAt: number | null;
  muted: boolean;
  speaker: boolean;
  /** Why the call ended (shown briefly). */
  endReason: "ended" | "declined" | "missed" | "cancelled" | "failed" | "busy" | null;
  error: string | null;
}

type IceServer = { urls: string | string[]; username?: string; credential?: string };
type Signal = { type: "offer" | "answer"; sdp: { type: string; sdp: string } } | { type: "candidate"; candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } };

const IDLE: CallState = { phase: "idle", callId: null, bookingId: null, peerName: "", reference: null, startedAt: null, muted: false, speaker: false, endReason: null, error: null };

class CallController {
  state: CallState = IDLE;
  private listeners = new Set<(s: CallState) => void>();
  private pc: RTCPeerConnection | null = null;
  private local: MediaStream | null = null;
  private ice: IceServer[] = [];
  private pending: Signal[] = [];
  private remoteSet = false;
  private bound = false;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe(fn: (s: CallState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => void this.listeners.delete(fn);
  }

  private set(patch: Partial<CallState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  /** Listens for incoming calls and call events on the app's live connection. */
  bind() {
    if (this.bound) return;
    this.bound = true;
    const s = getSocket();
    s.on("call:incoming", (d: { callId: string; bookingId: string; reference: string; fromName: string }) => void this.onIncoming(d));
    s.on("call:answered", (d: { callId: string }) => d.callId === this.state.callId && void this.onAnswered());
    s.on("call:signal", (d: { callId: string; data: Signal }) => d.callId === this.state.callId && void this.onSignal(d.data));
    s.on("call:ended", (d: { callId: string; status: CallState["endReason"] }) => d.callId === this.state.callId && this.finish(d.status ?? "ended", false));
    s.on("call:taken", (d: { callId: string }) => d.callId === this.state.callId && this.state.phase === "incoming" && this.finish("ended", false));
  }

  unbind() {
    if (!this.bound) return;
    const s = getSocket();
    for (const e of ["call:incoming", "call:answered", "call:signal", "call:ended", "call:taken"]) s.off(e);
    this.bound = false;
    this.cleanup();
    this.set(IDLE);
  }

  private busy() {
    return this.state.phase !== "idle" && this.state.phase !== "ended";
  }

  /** Calls the other side of a booking. */
  async start(bookingId: string) {
    if (this.busy()) return;
    this.clearReset();
    if (!(await this.micAllowed())) {
      this.set({ ...IDLE, phase: "ended", endReason: "failed", error: "Allow microphone access in your phone's Settings to make calls." });
      return this.scheduleReset();
    }
    this.set({ ...IDLE, phase: "outgoing", bookingId, peerName: "" });
    try {
      const r = await api<{ callId: string; peerName: string; reference: string; iceServers: IceServer[] }>(`/bookings/${bookingId}/voip`, { body: {} });
      this.ice = r.iceServers;
      this.set({ callId: r.callId, peerName: r.peerName, reference: r.reference });
      InCallManager.start({ media: "audio", ringback: "_DEFAULT_" });
      await this.prepare();
    } catch (e) {
      this.set({ phase: "ended", endReason: "failed", error: e instanceof Error ? e.message : "Could not start the call" });
      this.cleanup();
      this.scheduleReset();
    }
  }

  /** Opened from an incoming-call notification while the app was closed. */
  async resume(callId: string) {
    if (this.busy()) return;
    try {
      const c = await api<{ callId: string; bookingId: string; reference: string | null; status: string; role: "caller" | "callee"; peerName: string; iceServers: IceServer[] }>(`/calls/${callId}`);
      if (c.status === "ringing" && c.role === "callee") await this.onIncoming({ callId: c.callId, bookingId: c.bookingId, reference: c.reference ?? "", fromName: c.peerName, iceServers: c.iceServers });
    } catch {
      /* the call is over or not for this user */
    }
  }

  private async onIncoming(d: { callId: string; bookingId: string; reference: string; fromName: string; iceServers?: IceServer[] }) {
    if (this.busy()) {
      // Already on a call: tell the caller the line is busy.
      void api(`/calls/${d.callId}/decline`, { body: {} }).catch(() => undefined);
      return;
    }
    this.clearReset();
    if (d.iceServers) this.ice = d.iceServers;
    this.set({ ...IDLE, phase: "incoming", callId: d.callId, bookingId: d.bookingId, reference: d.reference, peerName: d.fromName });
    InCallManager.startRingtone("_DEFAULT_", [800, 1200], "playback", 45);
  }

  async accept() {
    const callId = this.state.callId;
    if (!callId || this.state.phase !== "incoming") return;
    InCallManager.stopRingtone();
    if (!(await this.micAllowed())) {
      void api(`/calls/${callId}/decline`, { body: {} }).catch(() => undefined);
      this.set({ phase: "ended", endReason: "failed", error: "Allow microphone access in your phone's Settings to take calls." });
      return this.scheduleReset();
    }
    this.set({ phase: "connecting" });
    try {
      const r = await api<{ iceServers: IceServer[] }>(`/calls/${callId}/answer`, { body: {} });
      this.ice = r.iceServers;
      InCallManager.start({ media: "audio" });
      await this.prepare();
      // The caller sends the offer once it hears we answered; handle any that arrived early.
      await this.flush();
    } catch (e) {
      this.set({ phase: "ended", endReason: "failed", error: e instanceof Error ? e.message : "Could not answer" });
      this.cleanup();
      this.scheduleReset();
    }
  }

  async decline() {
    const callId = this.state.callId;
    InCallManager.stopRingtone();
    if (callId) void api(`/calls/${callId}/decline`, { body: {} }).catch(() => undefined);
    this.finish("declined", false);
  }

  /** Hang up (or cancel while ringing). */
  async hangUp() {
    const callId = this.state.callId;
    if (callId) void api(`/calls/${callId}/end`, { body: {} }).catch(() => undefined);
    this.finish(this.state.phase === "active" ? "ended" : "cancelled", false);
  }

  toggleMute() {
    const muted = !this.state.muted;
    this.local?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.set({ muted });
  }

  toggleSpeaker() {
    const speaker = !this.state.speaker;
    InCallManager.setForceSpeakerphoneOn(speaker);
    this.set({ speaker });
  }

  // ---------------------------------------------------------------- WebRTC

  private async micAllowed() {
    if (RN.Platform.OS !== "android") return true;
    const perms = RN.PermissionsAndroid;
    const r = await perms.request(perms.PERMISSIONS.RECORD_AUDIO).catch(() => "denied");
    return r === perms.RESULTS.GRANTED;
  }

  private async prepare() {
    this.pc = new RTCPeerConnection({ iceServers: this.ice });
    this.remoteSet = false;
    this.local = await mediaDevices.getUserMedia({ audio: true, video: false });
    this.local.getTracks().forEach((t) => this.pc!.addTrack(t, this.local!));
    this.pc.addEventListener("icecandidate", (e) => {
      const c = (e as unknown as { candidate: RTCIceCandidate | null }).candidate;
      if (c) this.send({ type: "candidate", candidate: c.toJSON() as { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } });
    });
    this.pc.addEventListener("connectionstatechange", () => {
      const st = this.pc?.connectionState;
      if (st === "connected" && this.state.phase !== "active") {
        InCallManager.stopRingback();
        this.set({ phase: "active", startedAt: Date.now() });
      }
      if (st === "failed") {
        if (this.state.callId) void api(`/calls/${this.state.callId}/end`, { body: {} }).catch(() => undefined);
        this.finish("failed", false, "The connection dropped. Check your internet and try again.");
      }
    });
  }

  private async onAnswered() {
    if (!this.pc) return;
    this.set({ phase: "connecting" });
    const offer = await this.pc.createOffer({});
    await this.pc.setLocalDescription(offer);
    this.send({ type: "offer", sdp: { type: offer.type ?? "offer", sdp: offer.sdp ?? "" } });
  }

  private async onSignal(data: Signal) {
    if (!this.pc) {
      this.pending.push(data);
      return;
    }
    try {
      if (data.type === "offer") {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        this.remoteSet = true;
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.send({ type: "answer", sdp: { type: answer.type ?? "answer", sdp: answer.sdp ?? "" } });
        await this.flush();
      } else if (data.type === "answer") {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        this.remoteSet = true;
        await this.flush();
      } else if (data.type === "candidate") {
        if (!this.remoteSet) this.pending.push(data);
        else await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch {
      /* a late or duplicate message; the connection state decides */
    }
  }

  private async flush() {
    const queued = this.pending;
    this.pending = [];
    for (const s of queued) await this.onSignal(s);
  }

  private send(data: Signal) {
    const callId = this.state.callId;
    if (callId) getSocket().emit("call:signal", { callId, data }, () => undefined);
  }

  private finish(reason: NonNullable<CallState["endReason"]>, _remote: boolean, error?: string) {
    if (this.state.phase === "idle") return;
    this.cleanup();
    this.set({ phase: "ended", endReason: reason, error: error ?? null });
    this.scheduleReset();
  }

  private cleanup() {
    try {
      InCallManager.stopRingtone();
      InCallManager.stopRingback();
      InCallManager.stop();
    } catch {
      /* not started */
    }
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    this.pc?.close();
    this.pc = null;
    this.pending = [];
    this.remoteSet = false;
  }

  private scheduleReset() {
    this.clearReset();
    this.resetTimer = setTimeout(() => this.set(IDLE), 2500);
  }

  private clearReset() {
    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = null;
  }
}

export const calls = new CallController();
