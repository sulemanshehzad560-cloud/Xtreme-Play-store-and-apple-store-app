import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fastifyStatic from "@fastify/static";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { sql } from "drizzle-orm";
import type { Env } from "./config/env.js";
import { createContainer, type Container, type ContainerOverrides } from "./container.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import { promotionRoutes } from "./modules/promotions/promotion.routes.js";
import { supportRoutes } from "./modules/support/support.routes.js";
import { subscriptionRoutes } from "./modules/subscriptions/subscription.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { bookingRoutes } from "./modules/bookings/booking.routes.js";
import { catalogRoutes } from "./modules/catalog/catalog.routes.js";
import { paymentRoutes } from "./modules/payments/payment.routes.js";
import { attachRealtime } from "./modules/tracking/gateway.js";
import { staffRoutes } from "./modules/staff/staff.routes.js";
import { meRoutes } from "./modules/users/me.routes.js";
import { registerErrorHandler } from "./plugins/errors.js";
import { tileRoutes } from "./modules/maps/tiles.routes.js";
import { avatarRoutes } from "./modules/users/avatar.routes.js";

declare module "fastify" {
  interface FastifyInstance {
    container: Container;
  }
}

export async function buildApp(env: Env, overrides: ContainerOverrides = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Secrets and personal data never reach the logs.
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          'req.headers["stripe-signature"]',
          "req.body.code",
          "req.body.password",
          "req.body.refreshToken",
          "req.body.idToken",
          "req.body.accessToken",
          "req.body.phone",
          "req.body.email",
        ],
        censor: "[redacted]",
      },
      serializers: {
        // Keep query strings out of logs (Tamara sends its signed token in one).
        req: (req: { method: string; url: string; id: string }) => ({ id: req.id, method: req.method, url: req.url.split("?")[0] }),
      },
      ...(env.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : {}),
    },
    trustProxy: true,
    bodyLimit: 256 * 1024,
    genReqId: () => crypto.randomUUID(),
  });

  const c = createContainer(env, app.log, overrides);
  app.decorate("container", c);
  // Prices edited in the dashboard live in the database.
  await c.prices.load().catch((err) => app.log.error({ err }, "could not load prices; using defaults"));
  app.addHook("onClose", async () => {
    await c.pool.end();
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  // Encrypted connections only: anything arriving over plain HTTP is sent to HTTPS.
  if (env.NODE_ENV === "production") {
    app.addHook("onRequest", async (req, reply) => {
      if (req.headers["x-forwarded-proto"] === "http") return reply.redirect(`https://${req.headers.host}${req.url}`, 301);
    });
    if (!/sslmode=(require|verify-ca|verify-full)/.test(env.DATABASE_URL) && !/@(localhost|127\.0\.0\.1)[:/]/.test(env.DATABASE_URL)) {
      app.log.warn("DATABASE_URL has no sslmode=require: the database connection may not be encrypted");
    }
    if (!env.DATA_ENCRYPTION_KEY) app.log.warn("DATA_ENCRYPTION_KEY is not set: chat messages and profile photos are stored without field encryption");
  }

  await app.register(helmet, {
    // Strict policy for the dashboard and legal pages: only our own scripts, the map library
    // and Google Fonts; no framing (clickjacking) and no plugins.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://unpkg.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://unpkg.com"],
        connectSrc: ["'self'", ...(env.NODE_ENV === "production" ? ["wss:"] : ["wss:", "ws:"])],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    strictTransportSecurity: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: "no-referrer" },
  });
  await app.register(cors, { origin: env.CORS_ORIGINS.length ? env.CORS_ORIGINS : env.NODE_ENV !== "production" });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute", allowList: () => env.NODE_ENV === "test" });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Xtreme-Cleaning Partner API",
        version: "1.0.0",
        description: "Customer app, staff app and dispatch API. Authenticate with `Authorization: Bearer <accessToken>`.",
      },
      servers: [{ url: env.PUBLIC_URL }],
      components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
      security: [{ bearer: [] }],
    },
    transform: jsonSchemaTransform,
  });
  // Interactive API docs only outside production: the live server does not advertise its API.
  if (env.NODE_ENV !== "production") await app.register(swaggerUi, { routePrefix: "/docs" });

  // Office dispatch dashboard (static web app; every action goes through the admin API).
  await app.register(fastifyStatic, {
    root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../admin"),
    prefix: "/admin/",
    decorateReply: false,
  });
  // The logo used in invoice emails.
  const logoPng = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/brand/logo.png"));
  app.get("/brand/logo.png", { schema: { hide: true } }, async (_req, reply) => reply.type("image/png").header("cache-control", "public, max-age=86400").send(logoPng));
  app.get("/admin", { schema: { hide: true } }, async (_req, reply) => reply.redirect("/admin/", 302));

  // Public legal pages linked from the store listings (Google Play, App Store, Facebook Login).
  const legalDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../legal");
  const privacyPage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${readFileSync(path.join(legalDir, "privacy.html"), "utf8")}</html>`;
  app.get("/privacy", { schema: { hide: true } }, async (_req, reply) => reply.type("text/html; charset=utf-8").header("cache-control", "public, max-age=3600").send(privacyPage));
  app.get("/delete-account", { schema: { hide: true } }, async (_req, reply) => reply.redirect("/privacy#delete-account", 302));

  // The bare address opens the office dashboard instead of a "route not found" error.
  app.get("/", { schema: { hide: true } }, async (_req, reply) => reply.redirect("/admin/", 302));

  app.get("/health", { schema: { hide: true } }, async () => ({ ok: true }));
  app.get("/ready", { schema: { hide: true } }, async (_req, reply) => {
    try {
      await c.db.execute(sql`select 1`);
      return { ok: true };
    } catch {
      return reply.status(503).send({ ok: false });
    }
  });

  await app.register(
    async (v1) => {
      await authRoutes(v1, c);
      await catalogRoutes(v1, c);
      await bookingRoutes(v1, c);
      await paymentRoutes(v1, c);
      await tileRoutes(v1, c.env);
      await avatarRoutes(v1, c);
      await v1.register(async (scoped) => meRoutes(scoped, c));
      await v1.register(async (scoped) => staffRoutes(scoped, c));
      await v1.register(async (scoped) => adminRoutes(scoped, c));
      await v1.register(async (scoped) => subscriptionRoutes(scoped, c));
      await v1.register(async (scoped) => promotionRoutes(scoped, c));
      await v1.register(async (scoped) => supportRoutes(scoped, c));
    },
    { prefix: "/v1" },
  );

  await attachRealtime(app, c);
  return app;
}
