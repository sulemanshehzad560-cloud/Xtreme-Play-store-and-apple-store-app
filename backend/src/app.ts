import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { sql } from "drizzle-orm";
import type { Env } from "./config/env.js";
import { createContainer, type Container, type ContainerOverrides } from "./container.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { bookingRoutes } from "./modules/bookings/booking.routes.js";
import { catalogRoutes } from "./modules/catalog/catalog.routes.js";
import { paymentRoutes } from "./modules/payments/payment.routes.js";
import { attachRealtime } from "./modules/tracking/gateway.js";
import { staffRoutes } from "./modules/staff/staff.routes.js";
import { meRoutes } from "./modules/users/me.routes.js";
import { registerErrorHandler } from "./plugins/errors.js";

declare module "fastify" {
  interface FastifyInstance {
    container: Container;
  }
}

export async function buildApp(env: Env, overrides: ContainerOverrides = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: ["req.headers.authorization", "req.body.code", "req.body.refreshToken", "req.body.idToken", "req.body.accessToken"],
      ...(env.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : {}),
    },
    trustProxy: true,
    bodyLimit: 256 * 1024,
    genReqId: () => crypto.randomUUID(),
  });

  const c = createContainer(env, app.log, overrides);
  app.decorate("container", c);
  app.addHook("onClose", async () => {
    await c.pool.end();
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: env.CORS_ORIGINS.length ? env.CORS_ORIGINS : env.NODE_ENV !== "production" });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute", allowList: () => env.NODE_ENV === "test" });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Xtreme-Home Partner API",
        version: "1.0.0",
        description: "Customer app, staff app and dispatch API. Authenticate with `Authorization: Bearer <accessToken>`.",
      },
      servers: [{ url: env.PUBLIC_URL }],
      components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
      security: [{ bearer: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

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
      await v1.register(async (scoped) => meRoutes(scoped, c));
      await v1.register(async (scoped) => staffRoutes(scoped, c));
      await v1.register(async (scoped) => adminRoutes(scoped, c));
    },
    { prefix: "/v1" },
  );

  await attachRealtime(app, c);
  return app;
}
