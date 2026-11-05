import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { FastifyBaseLogger } from "fastify";
import { AccessToken, EgressClient, EncodedFileOutput, EncodedFileType, RoomServiceClient, S3Upload, WebhookReceiver, type WebhookEvent } from "livekit-server-sdk";
import type { Env } from "../../config/env.js";

/**
 * LiveKit media rooms for in-app calls. Each call is a private room with the customer and the
 * team member; LiveKit relays the audio (TURN over TLS 443 when networks are strict), records the
 * mixed call to our S3/R2 bucket, and lets the office join hidden and listen-only.
 */
export interface MediaRooms {
  readonly enabled: boolean;
  readonly recording: boolean;
  readonly url: string | null;
  /** A token to join `room`. Listeners are hidden and can't speak. */
  token(room: string, identity: string, name: string, opts?: { listener?: boolean }): Promise<string>;
  createRoom(room: string): Promise<void>;
  /** Starts recording the room's mixed audio; returns the egress id and object key. */
  startRecording(room: string, key: string): Promise<{ egressId: string } | null>;
  stopRecording(egressId: string): Promise<void>;
  closeRoom(room: string): Promise<void>;
  /** Verifies and parses a LiveKit webhook. */
  webhook(body: string, auth: string | undefined): Promise<WebhookEvent>;
  /** Streams a recording (optionally a byte range) from the bucket. */
  recordingStream(key: string, range?: string): Promise<{ body: NodeJS.ReadableStream; contentType: string; length?: number; range?: string; status: 200 | 206 }>;
}

export class LiveKitRooms implements MediaRooms {
  readonly enabled = true;
  readonly recording: boolean;
  readonly url: string;
  private readonly rooms: RoomServiceClient;
  private readonly egress: EgressClient;
  private readonly receiver: WebhookReceiver;
  private readonly s3: S3Client | null;

  constructor(
    private readonly env: Env,
    private readonly log: FastifyBaseLogger,
  ) {
    this.url = env.LIVEKIT_URL!;
    const http = this.url.replace(/^wss:/, "https:");
    this.rooms = new RoomServiceClient(http, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
    this.egress = new EgressClient(http, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
    this.receiver = new WebhookReceiver(env.LIVEKIT_API_KEY!, env.LIVEKIT_API_SECRET!);
    this.recording = !!(env.RECORDING_S3_BUCKET && env.RECORDING_S3_ACCESS_KEY && env.RECORDING_S3_SECRET);
    this.s3 = this.recording
      ? new S3Client({
          region: env.RECORDING_S3_REGION,
          ...(env.RECORDING_S3_ENDPOINT ? { endpoint: env.RECORDING_S3_ENDPOINT } : {}),
          credentials: { accessKeyId: env.RECORDING_S3_ACCESS_KEY!, secretAccessKey: env.RECORDING_S3_SECRET! },
        })
      : null;
  }

  async token(room: string, identity: string, name: string, opts: { listener?: boolean } = {}) {
    const at = new AccessToken(this.env.LIVEKIT_API_KEY, this.env.LIVEKIT_API_SECRET, { identity, name, ttl: "2h" });
    at.addGrant({
      room,
      roomJoin: true,
      canSubscribe: true,
      canPublish: !opts.listener,
      canPublishData: false,
      hidden: !!opts.listener,
    });
    return at.toJwt();
  }

  async createRoom(room: string) {
    // Closes itself a minute after everyone leaves; 2 callers + recorder + office listeners.
    await this.rooms.createRoom({ name: room, emptyTimeout: 60, departureTimeout: 20, maxParticipants: 8 });
  }

  async startRecording(room: string, key: string) {
    if (!this.recording) return null;
    const output = new EncodedFileOutput({
      fileType: EncodedFileType.OGG,
      filepath: key,
      output: {
        case: "s3",
        value: new S3Upload({
          accessKey: this.env.RECORDING_S3_ACCESS_KEY!,
          secret: this.env.RECORDING_S3_SECRET!,
          bucket: this.env.RECORDING_S3_BUCKET!,
          region: this.env.RECORDING_S3_REGION,
          ...(this.env.RECORDING_S3_ENDPOINT ? { endpoint: this.env.RECORDING_S3_ENDPOINT, forcePathStyle: true } : {}),
        }),
      },
    });
    const info = await this.egress.startRoomCompositeEgress(room, output, { audioOnly: true });
    return { egressId: info.egressId };
  }

  async stopRecording(egressId: string) {
    await this.egress.stopEgress(egressId).catch((err: unknown) => this.log.warn({ err }, "stop recording failed (it may have ended already)"));
  }

  async closeRoom(room: string) {
    await this.rooms.deleteRoom(room).catch(() => undefined);
  }

  webhook(body: string, auth: string | undefined) {
    return this.receiver.receive(body, auth);
  }

  async recordingStream(key: string, range?: string) {
    if (!this.s3) throw new Error("Recording storage is not configured");
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.env.RECORDING_S3_BUCKET!, Key: key, ...(range ? { Range: range } : {}) }));
    return {
      body: res.Body as NodeJS.ReadableStream,
      contentType: res.ContentType ?? "audio/ogg",
      ...(res.ContentLength != null ? { length: res.ContentLength } : {}),
      ...(res.ContentRange ? { range: res.ContentRange } : {}),
      status: (res.ContentRange ? 206 : 200) as 200 | 206,
    };
  }
}

/** LiveKit not configured: calls fall back to direct phone-to-phone WebRTC (not recorded). */
export class NoMediaRooms implements MediaRooms {
  readonly enabled = false;
  readonly recording = false;
  readonly url = null;
  async token(): Promise<string> {
    throw new Error("LiveKit is not configured");
  }
  async createRoom() {}
  async startRecording() {
    return null;
  }
  async stopRecording() {}
  async closeRoom() {}
  async webhook(): Promise<WebhookEvent> {
    throw new Error("LiveKit is not configured");
  }
  async recordingStream(): Promise<never> {
    throw new Error("Recording storage is not configured");
  }
}

/** Records what would happen (tests). */
export class FakeMediaRooms implements MediaRooms {
  readonly enabled = true;
  readonly recording = true;
  readonly url = "wss://xtreme-test.livekit.cloud";
  readonly log: string[] = [];
  async token(room: string, identity: string, _name: string, opts: { listener?: boolean } = {}) {
    this.log.push(`token ${room} ${identity}${opts.listener ? " listener" : ""}`);
    return `token-${identity}${opts.listener ? "-listener" : ""}`;
  }
  async createRoom(room: string) {
    this.log.push(`create ${room}`);
  }
  async startRecording(room: string, key: string) {
    this.log.push(`record ${room} ${key}`);
    return { egressId: `EG_${room}` };
  }
  async stopRecording(egressId: string) {
    this.log.push(`stop ${egressId}`);
  }
  async closeRoom(room: string) {
    this.log.push(`close ${room}`);
  }
  async webhook(body: string): Promise<WebhookEvent> {
    return JSON.parse(body) as WebhookEvent;
  }
  async recordingStream(key: string) {
    const { Readable } = await import("node:stream");
    return { body: Readable.from([Buffer.from(`OggS-fake-${key}`)]), contentType: "audio/ogg", length: 10 + key.length + 5, status: 200 as const };
  }
}

export function createMediaRooms(env: Env, log: FastifyBaseLogger): MediaRooms {
  return env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET ? new LiveKitRooms(env, log) : new NoMediaRooms();
}
