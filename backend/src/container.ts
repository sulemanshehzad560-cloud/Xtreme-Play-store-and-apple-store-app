import type { FastifyBaseLogger } from "fastify";
import { createMailer, type Mailer } from "./modules/mail/mailer.js";
import { InvoiceMailer } from "./modules/mail/invoice-mailer.js";
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
import type { BnplGateway, CardGateway, HostedCardGateway } from "./modules/payments/gateways.js";
import { NGeniusGateway } from "./modules/payments/ngenius.gateway.js";
import { PaymentService } from "./modules/payments/payment.service.js";
import { StripeGateway } from "./modules/payments/stripe.gateway.js";
import { TamaraGateway } from "./modules/payments/tamara.gateway.js";
import { AdminService } from "./modules/admin/admin.service.js";
import { StaffService } from "./modules/staff/staff.service.js";
import { PricingService, defaultPricing, pricing } from "./modules/catalog/pricing.js";
import { PromotionService } from "./modules/promotions/promotion.service.js";
import { SupportService } from "./modules/support/support.service.js";
import { SubscriptionService } from "./modules/subscriptions/subscription.service.js";
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
  prices: PricingService;
  users: UserService;
  card: CardGateway;
  hosted: HostedCardGateway;
  bnpl: BnplGateway;
  payments: PaymentService;
  admin: AdminService;
  mailer: Mailer;
  invoices: InvoiceMailer;
  subscriptions: SubscriptionService;
  promotions: PromotionService;
  support: SupportService;
}

export interface ContainerOverrides {
  sms?: SmsSender;
  push?: PushSender;
  verifiers?: Partial<Record<SocialProvider, SocialVerifier>>;
  bookingRules?: Partial<BookingRules>;
  card?: CardGateway;
  hosted?: HostedCardGateway;
  bnpl?: BnplGateway;
  mailer?: Mailer;
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
    resendCooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
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
  const card = overrides.card ?? new StripeGateway(env.STRIPE_SECRET_KEY, env.STRIPE_PUBLISHABLE_KEY, env.STRIPE_WEBHOOK_SECRET);
  const hosted = overrides.hosted ?? new NGeniusGateway(env.NGENIUS_API_URL, env.NGENIUS_API_KEY, env.NGENIUS_OUTLET_REF, env.NGENIUS_WEBHOOK_SECRET);
  const bnpl = overrides.bnpl ?? new TamaraGateway(env.TAMARA_API_URL, env.TAMARA_API_TOKEN, env.TAMARA_NOTIFICATION_TOKEN);
  const payments = new PaymentService(
    db,
    bookings,
    notifications,
    card,
    hosted,
    bnpl,
    {
      vatRate: env.VAT_RATE,
      companyTrn: env.COMPANY_TRN,
      publicUrl: env.PUBLIC_URL,
      appScheme: env.APP_SCHEME,
      merchantName: env.STRIPE_MERCHANT_NAME,
      tamaraInstalments: env.TAMARA_INSTALMENTS,
      get tamaraFeePercent() {
        return pricing().tamaraFeePercent;
      },
    },
    log,
  );
  const admin = new AdminService(db, tokens, env);
  const prices = new PricingService(db, defaultPricing(env.TAMARA_FEE_PERCENT));
  const mailer = overrides.mailer ?? createMailer(env, log);
  const invoices = new InvoiceMailer(db, payments, notifications, mailer, { publicUrl: env.PUBLIC_URL }, log);
  bookings.onStatusChange(async (booking) => {
    if (booking.status === "completed") void invoices.sendIfDue(booking.id);
  });
  const subscriptions = new SubscriptionService(db, bookings, notifications);
  const promotions = new PromotionService(db, bookings);
  const support = new SupportService(db, notifications, hub, admin, {
    get tamaraFeePercent() {
      return pricing().tamaraFeePercent;
    },
  });
  bookings.onPriced((bookingId) => promotions.refresh(bookingId));
  payments.onPaid((bookingId) => promotions.onBookingPaid(bookingId));
  payments.onPaid((bookingId) => subscriptions.onBookingPaid(bookingId));
  payments.onPaid((bookingId) => bookings.confirmPaid(bookingId));
  payments.onPaid((bookingId) => invoices.sendIfDue(bookingId));
  return { env, db, pool, hub, sms, push, verifiers, tokens, otp, auth, notifications, bookings, staff, users, card, hosted, bnpl, payments, admin, mailer, invoices, subscriptions, promotions, support, prices };
}
