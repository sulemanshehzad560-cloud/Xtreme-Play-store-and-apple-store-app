import type { FastifyBaseLogger } from "fastify";
import type pg from "pg";
import type { Env } from "./config/env.js";
import { createDb, type Database } from "./db/client.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { OtpService } from "./modules/auth/otp.js";
import { AppleVerifier } from "./modules/auth/providers/apple.js";
import { FacebookVerifier } from "./modules/auth/providers/facebook.js";
import { GoogleVerifier } from "./modules/auth/providers/google.js";
import type { SocialProvider, SocialVerifier } from "./modules/auth/providers/types.js";
import { createSmsSender, type SmsSender } from "./modules/auth/sms.js";
import { TokenService } from "./modules/auth/tokens.js";
import { BookingService, DEFAULT_RULES, type BookingRules } from "./modules/bookings/booking.service.js";
import { NotificationService } from "./modules/notifications/notification.service.js";
import { ExpoPush, NoopPush, type PushSender } from "./modules/notifications/push.js";
import { StaffService } from "./modules/staff/staff.service.js";
import { RealtimeHub } from "./modules/tracking/realtime.js";
import { UserService } from "./modules/users/user.service.js";

/** Everything the routes need, wired once. Tests pass overrides for external services. */
export interface Container {
  env: Env;
  db: Database;
  pool: pg.Pool;
  hub: RealtimeHub;
  sms: SmsSender;
  push: PushSender;
  verifiers: Record<SocialProvider, SocialVerifier>;
  tokens: TokenService;
  otp: OtpService;
  auth: AuthService;
  notifications: NotificationService;
  bookings: BookingService;
  staff: StaffService;
  users: UserService;
}

export interface ContainerOverrides {
  sms?: SmsSender;
  push?: PushSender;
  verifiers?: Partial<Record<SocialProvider, SocialVerifier>>;
  bookingRules?: Partial<BookingRules>;
}

export function createContainer(env: Env, log: FastifyBaseLogger, overrides: ContainerOverrides = {}): Container {
  const { db, pool } = createDb(env.DATABASE_URL, env.DATABASE_POOL_MAX);
  const hub = new RealtimeHub();
  const sms = overrides.sms ?? createSmsSender(env, log);
  const push = overrides.push ?? (env.PUSH_ENABLED ? new ExpoPush(env.EXPO_ACCESS_TOKEN, log) : new NoopPush());
  const verifiers: Record<SocialProvider, SocialVerifier> = {
    google: overrides.verifiers?.google ?? new GoogleVerifier(env.GOOGLE_CLIENT_IDS),
    apple: overrides.verifiers?.apple ?? new AppleVerifier(env.APPLE_BUNDLE_IDS),
    facebook: overrides.verifiers?.facebook ?? new FacebookVerifier(env.FACEBOOK_APP_ID, env.FACEBOOK_APP_SECRET),
  };
  const tokens = new TokenService(db, {
    secret: env.JWT_SECRET,
    accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  });
  const otp = new OtpService(db, sms, {
    pepper: env.OTP_PEPPER,
    ttlSeconds: env.OTP_TTL_SECONDS,
    reviewPhones: env.OTP_REVIEW_PHONES,
    reviewCode: env.OTP_REVIEW_CODE,
  });
  const auth = new AuthService(db, tokens, otp, verifiers);
  const notifications = new NotificationService(db, push, hub, log);
  const bookings = new BookingService(db, notifications, hub, {
    ...DEFAULT_RULES,
    etaSpeedKmh: env.ETA_AVERAGE_SPEED_KMH,
    ...overrides.bookingRules,
  });
  const staff = new StaffService(db, bookings, hub, {
    historyMinIntervalSeconds: env.LOCATION_HISTORY_MIN_INTERVAL_SECONDS,
    etaSpeedKmh: env.ETA_AVERAGE_SPEED_KMH,
  });
  const users = new UserService(db, tokens, bookings);
  return { env, db, pool, hub, sms, push, verifiers, tokens, otp, auth, notifications, bookings, staff, users };
}
