import type { FastifyBaseLogger } from "fastify";
import nodemailer from "nodemailer";
import type { Env } from "../../config/env.js";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  readonly configured: boolean;
  readonly from: string;
  send(message: MailMessage): Promise<void>;
}

/** Development / tests: logs the message instead of sending it. */
export class ConsoleMailer implements Mailer {
  readonly configured = false;
  readonly outbox: MailMessage[] = [];
  constructor(
    readonly from: string,
    private readonly log?: FastifyBaseLogger,
  ) {}
  async send(message: MailMessage) {
    this.outbox.push(message);
    this.log?.info({ to: message.to, subject: message.subject }, "[mail] not sent (MAIL_PROVIDER=console)");
  }
}

/** Zoho Mail (or any SMTP server) over TLS, signed in as the sending mailbox. */
export class SmtpMailer implements Mailer {
  readonly configured = true;
  private readonly transport: nodemailer.Transporter;
  constructor(
    readonly from: string,
    opts: { host: string; port: number; user: string; pass: string; replyTo?: string | undefined; bcc?: string | undefined },
  ) {
    this.transport = nodemailer.createTransport({
      host: opts.host,
      port: opts.port,
      secure: opts.port === 465,
      requireTLS: opts.port !== 465,
      auth: { user: opts.user, pass: opts.pass },
    });
    this.defaults = { replyTo: opts.replyTo, bcc: opts.bcc };
  }
  private readonly defaults: { replyTo?: string | undefined; bcc?: string | undefined };
  async send(message: MailMessage) {
    await this.transport.sendMail({ from: this.from, ...this.defaults, ...message });
  }
}

export function createMailer(env: Env, log: FastifyBaseLogger): Mailer {
  if (env.MAIL_PROVIDER === "smtp") {
    return new SmtpMailer(env.MAIL_FROM, {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER!,
      pass: env.SMTP_PASS!,
      replyTo: env.MAIL_REPLY_TO,
      bcc: env.MAIL_BCC,
    });
  }
  return new ConsoleMailer(env.MAIL_FROM, log);
}
