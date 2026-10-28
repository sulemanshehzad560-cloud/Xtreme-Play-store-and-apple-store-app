import type { FastifyInstance } from "fastify";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import type { Container } from "../src/container.js";
import { users } from "../src/db/schema.js";
import { ConsoleSms } from "../src/modules/auth/sms.js";
import { NoopPush } from "../src/modules/notifications/push.js";
import { ConsoleMailer } from "../src/modules/mail/mailer.js";
import { FakeCard, FakeTamara, FakeVerifier } from "./fakes.js";
import { TEST_DATABASE_URL } from "./global-setup.js";

export interface TestContext {
  app: FastifyInstance;
  c: Container;
  sms: ConsoleSms;
  push: NoopPush;
  card: FakeCard;
  tamara: FakeTamara;
  mail: ConsoleMailer;
}

export const testEnv = (extra: Record<string, string> = {}) =>
  loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: process.env.TEST_LOG ?? "silent",
    DATABASE_URL: TEST_DATABASE_URL,
    JWT_SECRET: "test-secret-test-secret-test-secret-42",
    OTP_PEPPER: "test-pepper-test-pepper",
    PUBLIC_URL: "https://api.xtreme.test",
    LOCATION_HISTORY_MIN_INTERVAL_SECONDS: "0",
    OTP_RESEND_COOLDOWN_SECONDS: "0",
    ...extra,
  });

export async function createTestApp(extra: Record<string, string> = {}): Promise<TestContext> {
  const sms = new ConsoleSms();
  const push = new NoopPush();
  const card = new FakeCard();
  const tamara = new FakeTamara();
  const mail = new ConsoleMailer("Xtreme-Cleaning Partner <sales@xtreme-fmgroup.com>");
  const app = await buildApp(testEnv(extra), {
    mailer: mail,
    sms,
    push,
    card,
    bnpl: tamara,
    verifiers: { google: new FakeVerifier("google"), facebook: new FakeVerifier("facebook"), apple: new FakeVerifier("apple") },
  });
  await app.ready();
  return { app, c: app.container, sms, push, card, tamara, mail };
}

export async function resetDb() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  const { rows } = await client.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'");
  await client.query(`truncate ${rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`);
  await client.end();
}

let phoneCounter = 0;
export const nextPhone = () => `+97150${String(1000000 + ++phoneCounter).slice(-7)}`;

/** Signs in with phone OTP, reading the code from the fake SMS outbox. */
export async function signInPhone(t: TestContext, phone = nextPhone(), fullName = "Test Customer") {
  const req = await t.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone } });
  if (req.statusCode !== 200) throw new Error(`otp request failed: ${req.body}`);
  const code = t.sms.outbox.findLast((m) => m.to === phone)!.body.slice(0, 6);
  const res = await t.app.inject({ method: "POST", url: "/v1/auth/otp/verify", payload: { phone, code, fullName } });
  if (res.statusCode !== 200) throw new Error(`otp verify failed: ${res.body}`);
  const session = res.json() as { accessToken: string; refreshToken: string; user: { id: string; role: string } };
  return { ...session, phone, auth: { authorization: `Bearer ${session.accessToken}` } };
}

export async function signInAs(t: TestContext, role: "admin" | "staff", name = role === "admin" ? "Office" : "Ahmed") {
  const phone = nextPhone();
  if (role === "admin") {
    await t.c.db.insert(users).values({ phone, role: "admin", fullName: name });
  }
  if (role === "staff") {
    await t.c.staff.create({ phone, displayName: name, employeeCode: `E${phone.slice(-5)}`, skills: [] });
  }
  return signInPhone(t, phone, name);
}

/** 10:00 Abu Dhabi time, `days` from now. */
export function slot(days = 2) {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCHours(6, 0, 0, 0);
  return d.toISOString();
}

export const ADDRESS = { label: "Home", area: "Al Reem Island", building: "Sky Tower", unit: "1204", lat: 24.4958, lng: 54.4035 };

export async function book(t: TestContext, auth: Record<string, string>, body: Record<string, unknown> = {}) {
  const res = await t.app.inject({
    method: "POST",
    url: "/v1/bookings",
    headers: auth,
    payload: { serviceKey: "regular", propertyType: "apartment", propertySize: "2bhk", scheduledAt: slot(), address: ADDRESS, ...body },
  });
  if (res.statusCode !== 201) throw new Error(`booking failed: ${res.body}`);
  return res.json() as { id: string; reference: string; priceAed: number | null; status: string };
}

/** Pays a booking by card through the fake gateway and the Stripe webhook. */
export async function pay(t: TestContext, auth: Record<string, string>, bookingId: string) {
  const res = await t.app.inject({ method: "POST", url: `/v1/bookings/${bookingId}/payments`, headers: auth, payload: { method: "card" } });
  if (res.statusCode >= 300) throw new Error(`payment start failed: ${res.body}`);
  const intentId = [...t.card.intents.keys()].at(-1)!;
  t.card.succeed(intentId);
  await t.app.inject({
    method: "POST",
    url: "/v1/webhooks/stripe",
    headers: { "stripe-signature": "good", "content-type": "application/json" },
    payload: JSON.stringify({ id: `evt_${intentId}`, type: "payment_intent.succeeded", intentId }),
  });
}

/** A fixed-price booking, paid (and so confirmed automatically). */
export async function bookPaid(t: TestContext, auth: Record<string, string>, body: Record<string, unknown> = {}) {
  const booking = await book(t, auth, body);
  await pay(t, auth, booking.id);
  return booking;
}
