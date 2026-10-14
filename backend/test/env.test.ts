import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";

const base = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://x",
  JWT_SECRET: "x".repeat(40),
  OTP_PEPPER: "y".repeat(20),
  SMS_PROVIDER: "twilio",
};

describe("production configuration", () => {
  it("refuses to start without HTTPS", () => {
    expect(() => loadEnv({ ...base, PUBLIC_URL: "http://api.example.com" })).toThrow(/https/);
    expect(loadEnv({ ...base, PUBLIC_URL: "https://api.example.com" }).PUBLIC_URL).toBe("https://api.example.com");
  });

  it("refuses the development SMS stand-in and short secrets", () => {
    expect(() => loadEnv({ ...base, PUBLIC_URL: "https://a.b", SMS_PROVIDER: "console" })).toThrow(/SMS_PROVIDER/);
    expect(() => loadEnv({ ...base, PUBLIC_URL: "https://a.b", JWT_SECRET: "short" })).toThrow(/JWT_SECRET/);
  });

  it("allows the log-only SMS stand-in on a test server when explicitly enabled", () => {
    const env = loadEnv({ ...base, PUBLIC_URL: "https://a.b", SMS_PROVIDER: "console", ALLOW_CONSOLE_SMS: "true" });
    expect(env.SMS_PROVIDER).toBe("console");
  });

  it("requires webhook secrets alongside payment keys", () => {
    expect(() => loadEnv({ ...base, PUBLIC_URL: "https://a.b", STRIPE_SECRET_KEY: "sk_live_x" })).toThrow(/STRIPE_WEBHOOK_SECRET/);
    expect(() => loadEnv({ ...base, PUBLIC_URL: "https://a.b", TAMARA_API_TOKEN: "t" })).toThrow(/TAMARA_NOTIFICATION_TOKEN/);
  });
});
