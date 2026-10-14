import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { and, count, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Container } from "../../container.js";
import { bookingStatus, bookings, paymentStatus, payments, users } from "../../db/schema.js";
import { notFound } from "../../lib/errors.js";
import { normalizePhone } from "../../lib/phone.js";
import { isoDate, phoneInput, uuidParam } from "../../lib/schemas.js";
import { requireAuth } from "../../plugins/auth.js";
import { adminStaffView } from "../staff/staff.service.js";

const tags = ["admin"];

/** Back-office API for the dispatch dashboard. Admin role only. */
export async function adminRoutes(app: FastifyInstance, c: Container) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook("preHandler", requireAuth(c, "admin"));

  r.get("/admin/dashboard", { schema: { tags, summary: "Today at a glance" } }, async () => {
    const start = new Date();
    start.setUTCHours(-4, 0, 0, 0); // midnight Abu Dhabi (UTC+4)
    if (start.getTime() > Date.now()) start.setUTCDate(start.getUTCDate() - 1);
    const end = new Date(start.getTime() + 86_400_000);
    const byStatus = await c.db
      .select({ status: bookings.status, n: count() })
      .from(bookings)
      .where(and(gte(bookings.scheduledAt, start), lt(bookings.scheduledAt, end)))
      .groupBy(bookings.status);
    const [revenue] = await c.db
      .select({ minor: sql<number>`coalesce(sum(${payments.amountMinor} - ${payments.refundedMinor}), 0)::int` })
      .from(payments)
      .where(and(gte(payments.capturedAt, start), lt(payments.capturedAt, end)));
    const [awaiting] = await c.db.select({ n: count() }).from(bookings).where(eq(bookings.status, "requested"));
    return {
      today: Object.fromEntries(byStatus.map((s) => [s.status, s.n])),
      awaitingConfirmation: awaiting?.n ?? 0,
      collectedTodayAed: (revenue?.minor ?? 0) / 100,
      staff: await c.staff.availability(),
    };
  });

  // Bookings
  r.get(
    "/admin/bookings",
    {
      schema: {
        tags,
        summary: "Bookings by status and date",
        querystring: z.object({
          status: z
            .string()
            .optional()
            .transform((s) => s?.split(",").filter(Boolean))
            .pipe(z.array(z.enum(bookingStatus.enumValues)).optional()),
          from: isoDate.optional(),
          to: isoDate.optional(),
          limit: z.coerce.number().int().min(1).max(500).default(100),
        }),
      },
    },
    async (req) => c.bookings.listForAdmin(req.query),
  );
  r.post("/admin/bookings/:id/confirm", { schema: { tags, summary: "Confirm a requested booking", params: uuidParam } }, async (req) =>
    c.bookings.transition(req.params.id, req.user, "confirmed"),
  );
  r.post(
    "/admin/bookings/:id/assign",
    {
      schema: {
        tags,
        summary: "Assign a team (first id is lead unless leadId is given)",
        params: uuidParam,
        body: z.object({ staffIds: z.array(z.uuid()).min(1).max(10), leadId: z.uuid().optional() }),
      },
    },
    async (req) => c.bookings.assign(req.params.id, req.user, req.body.staffIds, req.body.leadId),
  );
  r.post(
    "/admin/bookings/:id/status",
    {
      schema: {
        tags,
        summary: "Move a booking to any allowed status",
        params: uuidParam,
        body: z.object({ status: z.enum(bookingStatus.enumValues), reason: z.string().max(500).optional() }),
      },
    },
    async (req) => c.bookings.transition(req.params.id, req.user, req.body.status, { reason: req.body.reason }),
  );
  r.post(
    "/admin/bookings/:id/price",
    { schema: { tags, summary: "Set the price after a survey", params: uuidParam, body: z.object({ priceAed: z.number().int().min(1).max(1_000_000) }) } },
    async (req) => c.bookings.setPrice(req.params.id, req.user, req.body.priceAed),
  );

  // Staff
  r.get("/admin/staff", { schema: { tags, summary: "All staff with live status and position" } }, async () => c.staff.listForAdmin());
  r.post(
    "/admin/staff",
    {
      schema: {
        tags,
        summary: "Add a staff member (they sign in with this mobile number)",
        body: z.object({
          phone: phoneInput,
          displayName: z.string().trim().min(2).max(60),
          employeeCode: z.string().trim().min(1).max(30),
          teamName: z.string().trim().max(60).optional(),
          skills: z.array(z.string().max(40)).max(30).default([]),
          photoUrl: z.url().optional(),
        }),
      },
    },
    async (req, reply) =>
      reply.status(201).send(adminStaffView(await c.staff.create({ ...req.body, phone: normalizePhone(req.body.phone, c.env.OTP_DEFAULT_REGION) }))),
  );
  r.patch(
    "/admin/staff/:id",
    {
      schema: {
        tags,
        summary: "Edit a staff member or deactivate them",
        params: uuidParam,
        body: z.object({
          displayName: z.string().trim().min(2).max(60).optional(),
          teamName: z.string().trim().max(60).nullable().optional(),
          skills: z.array(z.string().max(40)).max(30).optional(),
          photoUrl: z.url().nullable().optional(),
          active: z.boolean().optional(),
        }),
      },
    },
    async (req) => adminStaffView(await c.staff.update(req.params.id, req.body)),
  );
  r.get(
    "/admin/staff/:id/track",
    { schema: { tags, summary: "A staff member's route over a time range", params: uuidParam, querystring: z.object({ from: isoDate, to: isoDate }) } },
    async (req) => c.staff.history(req.params.id, req.query.from, req.query.to),
  );

  // Payments
  r.get(
    "/admin/payments",
    {
      schema: {
        tags,
        summary: "Payments",
        querystring: z.object({
          status: z
            .string()
            .optional()
            .transform((s) => s?.split(",").filter(Boolean))
            .pipe(z.array(z.enum(paymentStatus.enumValues)).optional()),
          limit: z.coerce.number().int().min(1).max(500).default(100),
        }),
      },
    },
    async (req) => c.payments.listForAdmin(req.query),
  );
  r.post(
    "/admin/payments/:id/refund",
    {
      schema: {
        tags,
        summary: "Refund a payment in full or in part",
        params: uuidParam,
        body: z.object({ amountAed: z.number().positive().max(1_000_000).optional(), reason: z.string().trim().min(3).max(300) }),
      },
    },
    async (req) =>
      c.payments.refund(req.params.id, req.user, {
        amountMinor: req.body.amountAed != null ? Math.round(req.body.amountAed * 100) : undefined,
        reason: req.body.reason,
      }),
  );

  // Customers
  r.post(
    "/admin/users/:id/block",
    { schema: { tags, summary: "Suspend or restore an account", params: uuidParam, body: z.object({ blocked: z.boolean() }) } },
    async (req, reply) => {
      const [u] = await c.db
        .update(users)
        .set({ blockedAt: req.body.blocked ? new Date() : null, updatedAt: new Date() })
        .where(and(eq(users.id, req.params.id), isNull(users.deletedAt)))
        .returning({ id: users.id });
      if (!u) throw notFound("User");
      if (req.body.blocked) await c.tokens.revokeAllForUser(u.id);
      return reply.status(204).send();
    },
  );
}
