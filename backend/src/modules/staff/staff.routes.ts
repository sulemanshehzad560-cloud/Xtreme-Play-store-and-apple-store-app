import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Container } from "../../container.js";
import { isoDate, lat, lng, uuidParam } from "../../lib/schemas.js";
import { requireAuth } from "../../plugins/auth.js";
import { adminStaffView } from "./staff.service.js";

const tags = ["staff"];

export const pingSchema = z.object({
  lat,
  lng,
  accuracy: z.number().min(0).max(10_000).nullish(),
  heading: z.number().min(0).max(360).nullish(),
  speed: z.number().min(0).max(100).nullish(),
  recordedAt: isoDate.optional(),
});

export async function staffRoutes(app: FastifyInstance, c: Container) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook("preHandler", requireAuth(c, "staff"));

  r.get("/staff/me", { schema: { tags, summary: "My staff profile and duty status" } }, async (req) =>
    adminStaffView(await c.staff.profile(req.user.id)),
  );

  r.put(
    "/staff/me/status",
    { schema: { tags, summary: "Go on duty, take a break or go off duty", body: z.object({ status: z.enum(["available", "on_break", "off_duty"]) }) } },
    async (req) => adminStaffView(await c.staff.setDutyStatus(req.user.id, req.body.status)),
  );

  r.post(
    "/staff/me/location",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        tags,
        summary: "Upload my position (batched from background tracking)",
        body: z.object({ pings: z.array(pingSchema).min(1).max(100) }),
      },
    },
    async (req) => c.staff.ingest(req.user.id, req.body.pings),
  );

  r.get(
    "/staff/me/jobs",
    { schema: { tags, summary: "My assigned jobs", querystring: z.object({ scope: z.enum(["active", "past"]).default("active") }) } },
    async (req) => c.bookings.jobsForStaff(req.user.id, req.query.scope),
  );

  r.post(
    "/staff/jobs/:id/status",
    {
      schema: {
        tags,
        summary: "Update a job: on the way, arrived, started, completed",
        params: uuidParam,
        body: z.object({ status: z.enum(["en_route", "arrived", "in_progress", "completed"]), note: z.string().max(500).optional() }),
      },
    },
    async (req) => c.bookings.transition(req.params.id, req.user, req.body.status, { reason: req.body.note }),
  );

  r.post(
    "/staff/jobs/:id/quote",
    {
      schema: {
        tags,
        summary: "Quote the price on site (team lead); the customer can pay at once",
        params: uuidParam,
        body: z.object({ priceAed: z.number().int().min(1).max(1_000_000), note: z.string().trim().max(200).optional() }),
      },
    },
    async (req) => c.bookings.setPrice(req.params.id, req.user, req.body.priceAed, req.body.note),
  );
}
