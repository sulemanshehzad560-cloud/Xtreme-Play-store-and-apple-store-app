import * as RN from "react-native";
import { MediaStream, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, mediaDevices } from "@livekit/react-native-webrtc";
import { AudioSession } from "@livekit/react-native";
import { ConnectionState, Room, RoomEvent, Track, type RemoteParticipant } from "livekit-client";
import InCallManager from "react-native-incall-manager";
import * as SecureStore from "expo-secure-store";
import * as Speech from "expo-speech";
import { lang, t } from "./i18n";
import { api } from "./api";
import { getSocket } from "./realtime";

/**
 * In-app voice calls between a customer and their team. No phone numbers are used or shown.
 *
 * Main path (when the server has LiveKit set up): both phones join a private LiveKit room. LiveKit
 * relays the audio over any network (TURN over TLS 443), reconnects automatically after network
 * drops, and the server records every answered call; the office can listen in from the dashboard.
 *
 * Fallback (LiveKit not set up): a direct phone-to-phone WebRTC call, introduced by the server over
 * the app's live connection. Not recorded.
 */

export type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "active" | "reconnecting" | "ended";
export interface CallState {
  phase: CallPhase;
  callId: string | null;
  bookingId: string | null;
  peerName: string;
  reference: string | null;
  startedAt: number | null;
  muted: boolean;
  speaker: boolean;
  /** The call is recorded on the server (shown to both sides). */
  recorded: boolean;
  endReason: "ended" | "declined" | "missed" | "cancelled" | "failed" | "busy" | null;
  error: string | null;
}

type IceServer = { urls: string | string[]; username?: string; credential?: string };
type LiveKitAccess = { url: string; token: string } | null;
type Signal =
  | { type: "offer" | "answer"; sdp: { type: string; sdp: string } }
  | { type: "candidate"; candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } };

/** Told to both sides: before the first call (once), spoken when a recorded call connects, and on screen. */
export const RECORDING_NOTICE = "This call is recorded for training and quality purposes.";
const NOTICE_KEY = "call-recording-notice-v1";

/** One-time notice before someone's first call: calls are recorded. Resolves false if they cancel. */
async function acknowledgeRecording(): Promise<boolean> {
  const seen = await SecureStore.getItemAsync(NOTICE_KEY).catch(() => null);
  if (seen === "1") return true;
  return new Promise((resolve) =>
    RN.Alert.alert(
      t("Calls are recorded"),
      t("Calls between customers and Xtreme teams are recorded for training and quality purposes, and to keep everyone safe. Recordings are kept securely by Xtreme."),
      [
        { text: t("Cancel"), style: "cancel", onPress: () => resolve(false) },
        {
          text: t("I understand"),
          onPress: () => {
            void SecureStore.setItemAsync(NOTICE_KEY, "1").catch(() => undefined);
            resolve(true);
          },
        },
      ],
      { cancelable: false },
    ),
  );
}

/** Spoken on both phones as a recorded call connects. */
function announceRecording() {
  const ar = lang() === "ar";
  Speech.speak(t(RECORDING_NOTICE), { language: ar ? "ar-AE" : "en-US", rate: ar ? 0.95 : 1.0, pitch: 1.0 });
}

const IDLE: CallState = { phase: "idle", callId: null, bookingId: null, peerName: "", reference: null, startedAt: null, muted: false, speaker: false, recorded: false, endReason: null, error: null };
/** Give up if the audio hasn't connected by then (both paths). */
const CONNECT_TIMEOUT_MS = 25_000;
/** A dropped direct call gets this long to recover before it ends. */
const P2P_RECOVERY_MS = 12_000;
/** Voice processing: echo cancellation, noise suppression and level control on both phones. */
const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

class CallController {
  state: CallState = IDLE;
  private listeners = new Set<(s: CallState) => void>();
  // LiveKit
  private room: Room | null = null;
  private access: LiveKitAccess = null;
  // Direct (fallback)
  private pc: RTCPeerConnection | null = null;
  private local: MediaStream | null = null;
  private ice: IceServer[] = [];
  private pending: Signal[] = [];
  private remoteSet = false;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  private bound = false;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  private audioSession = false;

  subscribe(fn: (s: CallState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => void this.listeners.delete(fn);
  }

  private announced: string | null = null;

  private set(patch: Partial<CallState>) {
    this.state = { ...this.state, ...patch };
    // Both sides hear the recording notice once, as the call connects.
    if (this.state.phase === "active" && this.state.recorded && this.state.callId && this.announced !== this.state.callId) {
      this.announced = this.state.callId;
      announceRecording();
    }
    for (const fn of this.listeners) fn(this.state);
  }

  /** Listens for incoming calls and call events on the app's live connection. */
  bind() {
    if (this.bound) return;
    this.bound = true;
    const s = getSocket();
    s.on("call:incoming", (d: { callId: string; bookingId: string; reference: string; fromName: string; recorded?: boolean }) => void this.onIncoming(d));
    s.on("call:answered", (d: { callId: string }) => d.callId === this.state.callId && void this.onAnswered());
    s.on("call:signal", (d: { callId: string; data: Signal }) => d.callId === this.state.callId && void this.onSignal(d.data));
    s.on("call:ended", (d: { callId: string; status: CallState["endReason"] }) => d.callId === this.state.callId && this.finish(d.status ?? "ended"));
    s.on("call:taken", (d: { callId: string }) => d.callId === this.state.callId && this.state.phase === "incoming" && this.finish("ended"));
  }

  unbind() {
    if (!this.bound) return;
    const s = getSocket();
    for (const e of ["call:incoming", "call:answered", "call:signal", "call:ended", "call:taken"]) s.off(e);
    this.bound = false;
    void this.cleanup();
    this.set(IDLE);
  }

  private busy() {
    return this.state.phase !== "idle" && this.state.phase !== "ended";
  }

  // ---------------------------------------------------------------- public actions

  /** Calls the other side of a booking. */
  async start(bookingId: string) {
    if (this.busy()) return;
    this.clearReset();
    if (!(await acknowledgeRecording())) return;
    if (!(await this.micAllowed())) return this.fail("Allow microphone access in your phone's Settings to make calls.");
    this.set({ ...IDLE, phase: "outgoing", bookingId });
    try {
      const r = await api<{ callId: string; peerName: string; reference: string; iceServers: IceServer[]; livekit: LiveKitAccess; recorded: boolean }>(`/bookings/${bookingId}/voip`, { body: {} });
      this.ice = r.iceServers;
      this.access = r.livekit;
      this.set({ callId: r.callId, peerName: r.peerName, reference: r.reference, recorded: r.recorded });
      InCallManager.start({ media: "audio", ringback: "_DEFAULT_" });
      // Direct calls get the microphone ready now; LiveKit calls join once answered.
      if (!this.access) await this.preparePeer();
    } catch (e) {
      this.fail(e instanceof Error ? e.message : "Could not start the call");
    }
  }

  /** Opened from an incoming-call notification while the app was closed. */
  async resume(callId: string) {
    if (this.busy()) return;
    try {
      const c = await api<{ callId: string; bookingId: string; reference: string | null; status: string; role: "caller" | "callee"; peerName: string; iceServers: IceServer[]; recorded: boolean }>(`/calls/${callId}`);
      if (c.status === "ringing" && c.role === "callee") {
        await this.onIncoming({ callId: c.callId, bookingId: c.bookingId, reference: c.reference ?? "", fromName: c.peerName, iceServers: c.iceServers, recorded: c.recorded });
      }
    } catch {
      /* the call is over or not for this user */
    }
  }

  async accept() {
    const callId = this.state.callId;
    if (!callId || this.state.phase !== "incoming") return;
    InCallManager.stopRingtone();
    if (!(await acknowledgeRecording())) return this.decline();
    if (!(await this.micAllowed())) {
      void api(`/calls/${callId}/decline`, { body: {} }).catch(() => undefined);
      return this.fail("Allow microphone access in your phone's Settings to take calls.");
    }
    this.set({ phase: "connecting" });
    this.armConnectTimeout();
    try {
      const r = await api<{ iceServers: IceServer[]; livekit: LiveKitAccess; recorded: boolean }>(`/calls/${callId}/answer`, { body: {} });
      this.ice = r.iceServers;
      this.access = r.livekit;
      this.set({ recorded: r.recorded });
      if (this.access) await this.joinRoom();
      else {
        InCallManager.start({ media: "audio" });
        await this.preparePeer();
        // The caller sends the offer once it hears we answered; handle any that arrived early.
        await this.flush();
      }
    } catch (e) {
      this.fail(e instanceof Error ? e.message : "Could not answer");
    }
  }

  async decline() {
    const callId = this.state.callId;
    InCallManager.stopRingtone();
    if (callId) void api(`/calls/${callId}/decline`, { body: {} }).catch(() => undefined);
    this.finish("declined");
  }

  /** Hang up (or cancel while ringing). */
  async hangUp() {
    const callId = this.state.callId;
    if (callId) void api(`/calls/${callId}/end`, { body: {} }).catch(() => undefined);
    this.finish(this.state.phase === "active" || this.state.phase === "reconnecting" ? "ended" : "cancelled");
  }

  toggleMute() {
    const muted = !this.state.muted;
    if (this.room) void this.room.localParticipant.setMicrophoneEnabled(!muted);
    this.local?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.set({ muted });
  }

  toggleSpeaker() {
    const speaker = !this.state.speaker;
    if (this.audioSession) {
      const target = RN.Platform.OS === "ios" ? (speaker ? "force_speaker" : "default") : speaker ? "speaker" : "earpiece";
      void AudioSession.selectAudioOutput(target).catch(() => undefined);
    } else InCallManager.setForceSpeakerphoneOn(speaker);
    this.set({ speaker });
  }

  // ---------------------------------------------------------------- incoming / answered

  private async onIncoming(d: { callId: string; bookingId: string; reference: string; fromName: string; iceServers?: IceServer[]; recorded?: boolean }) {
    if (this.busy()) {
      // Already on a call: the caller hears that the line is busy.
      void api(`/calls/${d.callId}/decline`, { body: {} }).catch(() => undefined);
      return;
    }
    this.clearReset();
    if (d.iceServers) this.ice = d.iceServers;
    this.set({ ...IDLE, phase: "incoming", callId: d.callId, bookingId: d.bookingId, reference: d.reference, peerName: d.fromName, recorded: !!d.recorded });
    InCallManager.startRingtone("_DEFAULT_", [800, 1200], "playback", 45);
  }

  private async onAnswered() {
    this.set({ phase: "connecting" });
    this.armConnectTimeout();
    if (this.access) {
      InCallManager.stopRingback();
      InCallManager.stop();
      await this.joinRoom().catch((e: unknown) => this.fail(e instanceof Error ? e.message : "Could not connect the call"));
      return;
    }
    if (!this.pc) return;
    const offer = await this.pc.createOffer({});
    await this.pc.setLocalDescription(offer);
    this.send({ type: "offer", sdp: { type: offer.type ?? "offer", sdp: offer.sdp ?? "" } });
  }

  // ---------------------------------------------------------------- LiveKit path

  private async joinRoom() {
    if (!this.access) return;
    await AudioSession.configureAudio({
      android: { preferredOutputList: ["earpiece", "headset", "bluetooth", "speaker"], audioTypeOptions: { manageAudioFocus: true, audioMode: "inCommunication", audioFocusMode: "gain" } },
      ios: { defaultOutput: "earpiece" },
    });
    await AudioSession.startAudioSession();
    this.audioSession = true;
    const room = new Room({
      adaptiveStream: false,
      dynacast: false,
      audioCaptureDefaults: AUDIO,
      // Opus with discontinuous transmission and redundancy: clearer on weak mobile data.
      publishDefaults: { dtx: true, red: true, audioPreset: { maxBitrate: 32_000 } },
      reconnectPolicy: { nextRetryDelayInMs: (ctx) => (ctx.elapsedMs > 60_000 ? null : Math.min(1000 * 2 ** ctx.retryCount, 5000)) },
    });
    this.room = room;
    const markLive = () => {
      if (this.state.phase === "active") return;
      this.clearConnectTimeout();
      this.set({ phase: "active", startedAt: this.state.startedAt ?? Date.now() });
    };
    const others = () => [...room.remoteParticipants.values()].filter((p: RemoteParticipant) => !p.identity.startsWith("office-") && !p.identity.startsWith("EG_"));
    room
      .on(RoomEvent.ParticipantConnected, () => others().length && markLive())
      .on(RoomEvent.TrackSubscribed, (track) => track.kind === Track.Kind.Audio && markLive())
      .on(RoomEvent.ParticipantDisconnected, () => {
        // The other side left (or their app closed): end after a short grace period.
        if (this.state.phase === "active" && !others().length) setTimeout(() => !others().length && this.room === room && this.hangUp(), 8000);
      })
      .on(RoomEvent.Reconnecting, () => this.set({ phase: "reconnecting" }))
      .on(RoomEvent.Reconnected, () => this.set({ phase: "active" }))
      .on(RoomEvent.Disconnected, () => {
        if (this.room === room && this.busy()) {
          if (this.state.callId) void api(`/calls/${this.state.callId}/end`, { body: {} }).catch(() => undefined);
          this.finish("failed", "The connection dropped. Check your internet and try again.");
        }
      });
    await room.connect(this.access.url, this.access.token, { autoSubscribe: true });
    await room.localParticipant.setMicrophoneEnabled(!this.state.muted);
    if (room.state === ConnectionState.Connected && others().length) markLive();
  }

  // ---------------------------------------------------------------- direct path (fallback)

  private async preparePeer() {
    this.pc = new RTCPeerConnection({ iceServers: this.ice, iceCandidatePoolSize: 2 });
    this.remoteSet = false;
    // Echo cancellation and noise suppression are on by default in the native WebRTC engine.
    this.local = (await mediaDevices.getUserMedia({ audio: true, video: false })) as MediaStream;
    this.local.getTracks().forEach((t) => this.pc!.addTrack(t, this.local!));
    this.pc.addEventListener("icecandidate", (e) => {
      const c = (e as unknown as { candidate: RTCIceCandidate | null }).candidate;
      if (c) this.send({ type: "candidate", candidate: c.toJSON() as { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } });
    });
    this.pc.addEventListener("connectionstatechange", () => {
      const st = this.pc?.connectionState;
      if (st === "connected") {
        this.clearConnectTimeout();
        if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
        this.recoveryTimer = null;
        InCallManager.stopRingback();
        this.set({ phase: "active", startedAt: this.state.startedAt ?? Date.now() });
      }
      if (st === "disconnected" && this.state.phase === "active") {
        // Brief network blip: wait for it to recover before giving up.
        this.set({ phase: "reconnecting" });
        this.recoveryTimer = setTimeout(() => this.pc?.connectionState !== "connected" && this.dropped(), P2P_RECOVERY_MS);
      }
      if (st === "failed") this.dropped();
    });
  }

  private dropped() {
    if (this.state.callId) void api(`/calls/${this.state.callId}/end`, { body: {} }).catch(() => undefined);
    this.finish("failed", "The connection dropped. Check your internet and try again.");
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

  // ---------------------------------------------------------------- helpers

  private async micAllowed() {
    if (RN.Platform.OS !== "android") return true;
    const perms = RN.PermissionsAndroid;
    const r = await perms.request(perms.PERMISSIONS.RECORD_AUDIO).catch(() => "denied");
    return r === perms.RESULTS.GRANTED;
  }

  private armConnectTimeout() {
    this.clearConnectTimeout();
    this.connectTimer = setTimeout(() => {
      if (this.state.phase === "connecting") {
        if (this.state.callId) void api(`/calls/${this.state.callId}/end`, { body: {} }).catch(() => undefined);
        this.finish("failed", "Couldn't connect the call. Check your internet and try again.");
      }
    }, CONNECT_TIMEOUT_MS);
  }

  private clearConnectTimeout() {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private fail(message: string) {
    void this.cleanup();
    this.set({ phase: "ended", endReason: "failed", error: message });
    this.scheduleReset();
  }

  private finish(reason: NonNullable<CallState["endReason"]>, error?: string) {
    if (this.state.phase === "idle") return;
    void this.cleanup();
    this.set({ phase: "ended", endReason: reason, error: error ?? null });
    this.scheduleReset();
  }

  private async cleanup() {
    this.clearConnectTimeout();
    void Speech.stop().catch(() => undefined);
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    try {
      InCallManager.stopRingtone();
      InCallManager.stopRingback();
      InCallManager.stop();
    } catch {
      /* not started */
    }
    const room = this.room;
    this.room = null;
    this.access = null;
    if (room) await room.disconnect().catch(() => undefined);
    if (this.audioSession) {
      this.audioSession = false;
      await AudioSession.stopAudioSession().catch(() => undefined);
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
