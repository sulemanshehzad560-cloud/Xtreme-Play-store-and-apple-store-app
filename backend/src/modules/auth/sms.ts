import type { FastifyBaseLogger } from "fastify";
import type { Env } from "../../config/env.js";
import { maskPhone } from "../../lib/phone.js";

export interface SmsSender {
  send(to: string, body: string): Promise<void>;
}

/** Development only: prints the message to the server log instead of sending it. */
export class ConsoleSms implements SmsSender {
  readonly outbox: { to: string; body: string }[] = [];
  constructor(private readonly log?: FastifyBaseLogger) {}
  async send(to: string, body: string) {
    this.outbox.push({ to, body });
    this.log?.info({ to: maskPhone(to) }, `[sms] ${body}`);
  }
}

export class TwilioSms implements SmsSender {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: { from?: string | undefined; messagingServiceSid?: string | undefined },
  ) {}

  async send(to: string, body: string) {
    const form = new URLSearchParams({ To: to, Body: body });
    if (this.from.messagingServiceSid) form.set("MessagingServiceSid", this.from.messagingServiceSid);
    else if (this.from.from) form.set("From", this.from.from);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    if (!res.ok) throw new Error(`Twilio send failed: ${res.status} ${await res.text()}`);
  }
}

export function createSmsSender(env: Env, log: FastifyBaseLogger): SmsSender {
  if (env.SMS_PROVIDER === "twilio") {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || (!env.TWILIO_FROM && !env.TWILIO_MESSAGING_SERVICE_SID)) {
      throw new Error("SMS_PROVIDER=twilio needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID");
    }
    return new TwilioSms(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, {
      from: env.TWILIO_FROM,
      messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
    });
  }
  return new ConsoleSms(log);
}
