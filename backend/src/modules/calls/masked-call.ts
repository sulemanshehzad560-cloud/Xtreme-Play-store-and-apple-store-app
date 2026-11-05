import type { FastifyBaseLogger } from "fastify";

/** Connects two people by phone without either seeing the other's number. */
export interface CallBridge {
  readonly enabled: boolean;
  /** Rings `caller` from the masked number, then connects them to `callee` (also shown the masked number). */
  connect(caller: string, callee: string, intro: string): Promise<void>;
}

const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/** Twilio click-to-call: one outbound call to the caller, with TwiML that dials the other side. */
export class TwilioCallBridge implements CallBridge {
  readonly enabled = true;
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly number: string,
    private readonly log: FastifyBaseLogger,
  ) {}

  async connect(caller: string, callee: string, intro: string) {
    const twiml = `<Response><Say voice="Polly.Joanna">${xml(intro)}</Say><Dial callerId="${xml(this.number)}" timeLimit="1200" answerOnBridge="true"><Number>${xml(callee)}</Number></Dial></Response>`;
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
  }
}

/** No voice number configured: the app falls back to calling the office. */
export class NoCallBridge implements CallBridge {
  readonly enabled = false;
  async connect() {
    throw new Error("Masked calling is not configured");
  }
}

/** Records calls instead of placing them (tests). */
export class FakeCallBridge implements CallBridge {
  readonly enabled = true;
  readonly calls: { caller: string; callee: string; intro: string }[] = [];
  async connect(caller: string, callee: string, intro: string) {
    this.calls.push({ caller, callee, intro });
  }
}
