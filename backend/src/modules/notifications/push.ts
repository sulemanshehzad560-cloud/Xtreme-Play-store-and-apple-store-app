import type { FastifyBaseLogger } from "fastify";

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown> | undefined;
}

export interface PushResult {
  /** Tokens Expo reports as uninstalled/invalid; the caller deletes them. */
  invalidTokens: string[];
}

export interface PushSender {
  send(messages: PushMessage[]): Promise<PushResult>;
}

export class NoopPush implements PushSender {
  readonly sent: PushMessage[] = [];
  async send(messages: PushMessage[]) {
    this.sent.push(...messages);
    return { invalidTokens: [] };
  }
}

/** Expo push service: one API for APNs (iOS) and FCM (Android). */
export class ExpoPush implements PushSender {
  constructor(
    private readonly accessToken: string | undefined,
    private readonly log: FastifyBaseLogger,
  ) {}

  async send(messages: PushMessage[]): Promise<PushResult> {
    const invalidTokens: string[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100).map((m) => ({ ...m, sound: "default", priority: "high", channelId: "bookings" }));
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        this.log.warn({ status: res.status }, "Expo push request failed");
        continue;
      }
      const body = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      body.data?.forEach((ticket, idx) => {
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") invalidTokens.push(chunk[idx]!.to);
      });
    }
    return { invalidTokens };
  }
}
