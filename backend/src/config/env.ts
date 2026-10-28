import { z } from "zod";

const csv = z
  .string()
  .default("")
  .transform((s) =>
    s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );

const bool = z
  .enum(["true", "false", "1", "0"])
  .default("false")
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(8080),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  PUBLIC_URL: z.string().url().default("http://localhost:8080"),
  CORS_ORIGINS: csv,

  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().default(10),
  REDIS_URL: z.string().optional(),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(60),

  // Phone OTP
  OTP_PEPPER: z.string().min(16, "OTP_PEPPER must be at least 16 characters"),
  OTP_TTL_SECONDS: z.coerce.number().int().default(5 * 60),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(30),
  OTP_DEFAULT_REGION: z.string().length(2).default("AE"),
  SMS_PROVIDER: z.enum(["console", "twilio"]).default("console"),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),
  TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),
  // Test servers only (e.g. the free Render blueprint): allow SMS_PROVIDER=console in production.
  // Sign-in codes then appear in the server log instead of being texted. Never set on the live server.
  ALLOW_CONSOLE_SMS: bool,
  // Numbers that always accept OTP_REVIEW_CODE. Lets App Store / Play reviewers sign in.
  OTP_REVIEW_PHONES: csv,
  OTP_REVIEW_CODE: z.string().regex(/^\d{6}$/).optional(),

  // Social sign-in
  GOOGLE_CLIENT_IDS: csv,
  APPLE_BUNDLE_IDS: csv,
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),

  // Payments. Prices in the catalog are in AED and include VAT.
  VAT_RATE: z.coerce.number().min(0).max(1).default(0.05),
  // UAE Tax Registration Number printed on tax invoices.
  COMPANY_TRN: z.string().trim().optional(),
  APP_SCHEME: z.string().default("xtreme"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_MERCHANT_NAME: z.string().default("Xtreme Facilities Management"),
  /** Encrypts chat messages and profile photos in the database. Use Render's "Generate". Never change it once set. */
  DATA_ENCRYPTION_KEY: z.string().trim().min(32, "DATA_ENCRYPTION_KEY must be a random secret of at least 32 characters (use Render's Generate)").optional(),
  /** Render "Deploy Hook" URL (service Settings > Deploy Hook). Lets admins redeploy from the dashboard. */
  RENDER_DEPLOY_HOOK_URL: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://api.render.com/deploy/"), "RENDER_DEPLOY_HOOK_URL must be a Render deploy hook (https://api.render.com/deploy/...)")
    .optional(),

  // Network International N-Genius (card, Apple Pay, Google Pay). When the API key and outlet
  // are set, card payments go through N-Genius instead of Stripe.
  NGENIUS_API_URL: z.string().url().default("https://api-gateway.sandbox.ngenius-payments.com"),
  NGENIUS_API_KEY: z.string().optional(),
  NGENIUS_OUTLET_REF: z.string().optional(),
  /** Value of the custom header set on the N-Genius webhook (header name: X-Webhook-Secret). */
  NGENIUS_WEBHOOK_SECRET: z.string().optional(),
  TAMARA_API_URL: z.string().url().default("https://api-sandbox.tamara.co"),
  TAMARA_API_TOKEN: z.string().optional(),
  TAMARA_NOTIFICATION_TOKEN: z.string().optional(),
  TAMARA_INSTALMENTS: z.coerce.number().int().min(2).max(12).default(4),
  /** Fee added when the customer pays with Tamara, in percent of the amount due (0 = none). */
  TAMARA_FEE_PERCENT: z.coerce.number().min(0).max(20).default(8),

  /**
   * Map tiles for the Android app, fetched and cached by this server so the app never calls the
   * tile provider directly. {z}/{x}/{y} are filled in. A provider key, if any, goes here on the server.
   */
  MAP_TILE_URL: z.string().default("https://tile.openstreetmap.org/{z}/{x}/{y}.png"),

  // Invoice emails. Zoho Mail SMTP for an organisation mailbox on your own domain:
  // smtppro.zoho.com, port 465, the mailbox address and an app-specific password.
  MAIL_PROVIDER: z.enum(["console", "smtp"]).default("console"),
  MAIL_FROM: z.string().default("Xtreme-Cleaning Partner <sales@xtreme-fmgroup.com>"),
  MAIL_REPLY_TO: z.string().optional(),
  MAIL_BCC: z.string().optional(),
  SMTP_HOST: z.string().default("smtppro.zoho.com"),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // Push notifications (Expo)
  EXPO_ACCESS_TOKEN: z.string().optional(),
  PUSH_ENABLED: bool,

  // Tracking
  LOCATION_HISTORY_RETENTION_DAYS: z.coerce.number().int().default(30),
  LOCATION_HISTORY_MIN_INTERVAL_SECONDS: z.coerce.number().int().default(15),
  ETA_AVERAGE_SPEED_KMH: z.coerce.number().default(32),

  // First admin, created by `npm run db:seed`
  ADMIN_PHONE: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production") {
    if (env.SMS_PROVIDER === "console" && !env.ALLOW_CONSOLE_SMS) throw new Error("SMS_PROVIDER=console is not allowed in production");
    if (env.SMS_PROVIDER === "console") console.warn("Warning: test server. Sign-in codes are written to the log, not sent by SMS.");
    // Payments and personal data: the public address must be encrypted (HTTPS).
    if (!env.PUBLIC_URL.startsWith("https://")) throw new Error("PUBLIC_URL must start with https:// in production");
    if (/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY ?? "") && env.PUBLIC_URL.includes("xtreme-fmgroup.com")) {
      console.warn("Warning: Stripe TEST key in use on the production domain. Switch to the live key before taking real payments.");
    }
    if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is required with STRIPE_SECRET_KEY");
    if (env.TAMARA_API_TOKEN && !env.TAMARA_NOTIFICATION_TOKEN) throw new Error("TAMARA_NOTIFICATION_TOKEN is required with TAMARA_API_TOKEN");
    if (env.CORS_ORIGINS.includes("*")) throw new Error("CORS_ORIGINS=* is not allowed in production");
  }
  if (env.MAIL_PROVIDER === "smtp" && (!env.SMTP_USER || !env.SMTP_PASS)) throw new Error("MAIL_PROVIDER=smtp needs SMTP_USER and SMTP_PASS");
  return env;
}
