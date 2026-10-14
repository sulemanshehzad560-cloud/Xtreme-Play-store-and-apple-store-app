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
  OTP_DEFAULT_REGION: z.string().length(2).default("AE"),
  SMS_PROVIDER: z.enum(["console", "twilio"]).default("console"),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),
  TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),
  // Numbers that always accept OTP_REVIEW_CODE. Lets App Store / Play reviewers sign in.
  OTP_REVIEW_PHONES: csv,
  OTP_REVIEW_CODE: z.string().regex(/^\d{6}$/).optional(),

  // Social sign-in
  GOOGLE_CLIENT_IDS: csv,
  APPLE_BUNDLE_IDS: csv,
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),

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
    if (env.SMS_PROVIDER === "console") throw new Error("SMS_PROVIDER=console is not allowed in production");
    if (env.CORS_ORIGINS.includes("*")) throw new Error("CORS_ORIGINS=* is not allowed in production");
  }
  return env;
}
