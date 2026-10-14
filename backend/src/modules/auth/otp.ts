import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { otpChallenges } from "../../db/schema.js";
import { hmac, randomDigits, safeEqual } from "../../lib/crypto.js";
import { badRequest, tooManyRequests } from "../../lib/errors.js";
import type { SmsSender } from "./sms.js";

export interface OtpConfig {
  pepper: string;
  ttlSeconds: number;
  /** Store reviewers sign in with these numbers and a fixed code; no SMS is sent. */
  reviewPhones: string[];
  reviewCode?: string | undefined;
  resendCooldownSeconds: number;
}

const CODE_LENGTH = 6;
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

export class OtpService {
  constructor(
    private readonly db: Database,
    private readonly sms: SmsSender,
    private readonly config: OtpConfig,
  ) {}

  private hash(phone: string, code: string) {
    return hmac(this.config.pepper, `${phone}:${code}`);
  }

  private isReviewPhone(phone: string) {
    return Boolean(this.config.reviewCode) && this.config.reviewPhones.includes(phone);
  }

  async request(phone: string, ip?: string): Promise<{ expiresIn: number; resendIn: number }> {
    const hourAgo = new Date(Date.now() - 3_600_000);
    const recent = await this.db
      .select({ createdAt: otpChallenges.createdAt })
      .from(otpChallenges)
      .where(and(eq(otpChallenges.phone, phone), gt(otpChallenges.createdAt, hourAgo)))
      .orderBy(desc(otpChallenges.createdAt));

    const last = recent[0];
    if (last) {
      const wait = this.config.resendCooldownSeconds - Math.floor((Date.now() - last.createdAt.getTime()) / 1000);
      if (wait > 0) throw tooManyRequests(`Please wait ${wait}s before requesting another code`, wait);
    }
    if (recent.length >= MAX_SENDS_PER_HOUR) {
      throw tooManyRequests("Too many codes requested. Try again in an hour.", 3600);
    }

    const review = this.isReviewPhone(phone);
    const code = review ? this.config.reviewCode! : randomDigits(CODE_LENGTH);

    // Only the newest code is valid: retire earlier unused ones.
    await this.db
      .update(otpChallenges)
      .set({ consumedAt: new Date() })
      .where(and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt)));
    await this.db.insert(otpChallenges).values({
      phone,
      codeHash: this.hash(phone, code),
      expiresAt: new Date(Date.now() + this.config.ttlSeconds * 1000),
      ip,
    });

    if (!review) {
      const minutes = Math.round(this.config.ttlSeconds / 60);
      await this.sms.send(phone, `${code} is your Xtreme verification code. It expires in ${minutes} minutes. Never share it.`);
    }
    return { expiresIn: this.config.ttlSeconds, resendIn: this.config.resendCooldownSeconds };
  }

  /** Throws unless `code` is the live code for `phone`. Each code works once. */
  async verify(phone: string, code: string): Promise<void> {
    const invalid = () => badRequest("invalid_code", "That code is incorrect or has expired");
    const [challenge] = await this.db
      .select()
      .from(otpChallenges)
      .where(and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, new Date())))
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1);
    if (!challenge) throw invalid();

    // Count the attempt before comparing so parallel guesses cannot exceed the limit.
    const [counted] = await this.db
      .update(otpChallenges)
      .set({ attempts: sql`${otpChallenges.attempts} + 1` })
      .where(and(eq(otpChallenges.id, challenge.id), sql`${otpChallenges.attempts} < ${MAX_ATTEMPTS}`))
      .returning({ attempts: otpChallenges.attempts });
    if (!counted) throw badRequest("too_many_attempts", "Too many wrong codes. Request a new one.");

    if (!safeEqual(challenge.codeHash, this.hash(phone, code))) throw invalid();

    const consumed = await this.db
      .update(otpChallenges)
      .set({ consumedAt: new Date() })
      .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
      .returning({ id: otpChallenges.id });
    if (consumed.length === 0) throw invalid();
  }
}
