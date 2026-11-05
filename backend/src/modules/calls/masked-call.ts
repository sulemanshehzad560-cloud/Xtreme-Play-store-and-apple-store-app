import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";

/** Places the first leg of a masked call; the TwiML it carries dials the other side. */
export interface CallBridge {
  readonly enabled: boolean;
  /** Rings `caller` from the masked number and runs `twiml` when they answer. */
  connect(caller: string, twiml: string): Promise<{ sid: string | null }>;
}

export const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/**
 * TwiML that says a short intro, then connects to `callee` showing only Xtreme's number.
 * `action` is called when the connected call ends, with its talk time (DialCallDuration).
 */
export function bridgeTwiml(opts: { intro: string; callee: string; callerId: string; action?: string; arabic?: boolean }) {
  const say = `<Say voice="${opts.arabic ? "Polly.Zeina" : "Polly.Joanna"}"${opts.arabic ? ' language="arb"' : ""}>${xml(opts.intro)}</Say>`;
  const action = opts.action ? ` action="${xml(opts.action)}" method="POST"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${say}<Dial callerId="${xml(opts.callerId)}" timeLimit="1200" answerOnBridge="true"${action}><Number>${xml(opts.callee)}</Number></Dial></Response>`;
}

/** Twilio's request signature: HMAC-SHA1 of the full URL plus the sorted POST params. */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function validTwilioSignature(authToken: string, url: string, params: Record<string, string>, given: string | undefined) {
  if (!given) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const got = Buffer.from(given);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** Twilio click-to-call: one outbound call to the caller, carrying TwiML that dials the other side. */
export class TwilioCallBridge implements CallBridge {
  readonly enabled = true;
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly number: string,
    private readonly log: FastifyBaseLogger,
  ) {}

  async connect(caller: string, twiml: string) {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Calls.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: caller, From: this.number, Twiml: twiml }),
    });
    if (!res.ok) {
      this.log.error({ status: res.status }, "masked call failed");
      throw new Error(`Twilio call failed: ${res.status}`);
    }
    const body = (await res.json().catch(() => ({}))) as { sid?: string };
    return { sid: body.sid ?? null };
  }
}

/** No voice number configured: the app falls back to calling the office. */
export class NoCallBridge implements CallBridge {
  readonly enabled = false;
  async connect(): Promise<{ sid: string | null }> {
    throw new Error("Masked calling is not configured");
  }
}

/** Records calls instead of placing them (tests). */
export class FakeCallBridge implements CallBridge {
  readonly enabled = true;
  readonly calls: { caller: string; callee: string; twiml: string }[] = [];
  async connect(caller: string, twiml: string) {
    const callee = /<Number>([^<]+)<\/Number>/.exec(twiml)?.[1] ?? "";
    this.calls.push({ caller, callee, twiml });
    return { sid: `CA${String(this.calls.length).padStart(32, "0")}` };
  }
}
