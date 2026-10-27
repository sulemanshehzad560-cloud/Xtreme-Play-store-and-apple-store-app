import type { FastifyInstance } from "fastify";
import { generatePassword } from "../../lib/password.js";
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
    {
      schema: {
        tags,
        summary: "Set or change the price (e.g. a quote after inspection); the customer is notified and can pay",
        params: uuidParam,
        body: z.object({ priceAed: z.number().int().min(1).max(1_000_000), note: z.string().trim().max(200).optional() }),
      },
    },
    async (req) => c.bookings.setPrice(req.params.id, req.user, req.body.priceAed, req.body.note),
  );

  r.post(
    "/admin/bookings/:id/invoice/email",
    { schema: { tags, summary: "Email the tax invoice to the customer now (resend)", params: uuidParam } },
    async (req) => {
      const result = await c.invoices.resend(req.params.id);
      await c.admin.audit(req.user.id, "invoice.emailed", "booking", req.params.id, { to: result.sentTo, reason: result.reason ?? null });
      return result;
    },
  );

  // Staff
  r.get("/admin/staff", { schema: { tags, summary: "All staff with live status and position" } }, async () => c.staff.listForAdmin());
  const staffFields = {
    displayName: z.string().trim().min(2).max(60),
    employeeCode: z.string().trim().min(1).max(30),
    teamName: z.string().trim().max(60).nullish(),
    jobTitle: z.string().trim().max(60).nullish(),
    email: z.email().max(160).nullish().or(z.literal("").transform(() => null)),
    emergencyContactName: z.string().trim().max(80).nullish(),
    emergencyContactPhone: z.string().trim().max(20).nullish(),
    joinedOn: z.iso.date().nullish().or(z.literal("").transform(() => null)),
    notes: z.string().trim().max(2000).nullish(),
    skills: z.array(z.string().max(40)).max(30),
    photoUrl: z.url().nullish(),
    notifyNewOrders: z.boolean().optional(),
  };
  const staffPassword = z.string().min(8, "Use at least 8 characters").max(100);
  const optionalPhone = (v: string | null | undefined) => (v ? normalizePhone(v, c.env.OTP_DEFAULT_REGION) : v);

  r.post(
    "/admin/staff",
    {
      schema: {
        tags,
        summary: "Add a staff member. They sign in with their Staff ID (employee code) and the password set here.",
        body: z.object({ phone: phoneInput, ...staffFields, skills: staffFields.skills.default([]), password: staffPassword.optional() }),
      },
    },
    async (req, reply) => {
      const { phone, emergencyContactPhone, password, ...rest } = req.body;
      const created = await c.staff.create({
        ...rest,
        skills: [...new Set(rest.skills)].sort(),
        phone: normalizePhone(phone, c.env.OTP_DEFAULT_REGION),
        emergencyContactPhone: optionalPhone(emergencyContactPhone),
      });
      if (password) await c.staff.setPassword(created.userId, password);
      await c.admin.audit(req.user.id, "staff.created", "staff", created.userId, { name: created.displayName, employeeCode: created.employeeCode, passwordSet: Boolean(password) });
      return reply.status(201).send(await c.staff.detail(created.userId));
    },
  );
  r.get("/admin/staff/:id", { schema: { tags, summary: "A staff member's full record", params: uuidParam } }, async (req) => c.staff.detail(req.params.id));
  r.patch(
    "/admin/staff/:id",
    {
      schema: {
        tags,
        summary: "Edit a staff member's details, sign-in number, or deactivate them",
        params: uuidParam,
        body: z.object({ phone: phoneInput.optional(), active: z.boolean().optional(), ...staffFields }).partial(),
      },
    },
    async (req) => {
      const before = await c.staff.detail(req.params.id);
      const { phone, emergencyContactPhone, ...rest } = req.body;
      if (rest.skills) rest.skills = [...new Set(rest.skills)].sort();
      const newPhone = phone ? normalizePhone(phone, c.env.OTP_DEFAULT_REGION) : undefined;
      await c.staff.update(req.params.id, {
        ...rest,
        ...(newPhone && newPhone !== before.phone ? { phone: newPhone } : {}),
        ...(emergencyContactPhone !== undefined ? { emergencyContactPhone: optionalPhone(emergencyContactPhone) } : {}),
      });
      // Deactivated staff and changed numbers lose their current sessions immediately.
      if (req.body.active === false || (newPhone && newPhone !== before.phone)) await c.tokens.revokeAllForUser(req.params.id);
      const after = await c.staff.detail(req.params.id);
      const changed = Object.fromEntries(
        Object.keys(req.body)
          .filter((k) => {
            // Compare lists without regard to order (e.g. skills).
            const norm = (v: unknown) => JSON.stringify(Array.isArray(v) ? [...v].sort() : v ?? null);
            return norm((before as Record<string, unknown>)[k]) !== norm((after as Record<string, unknown>)[k]);
          })
          .map((k) => [k, { from: (before as Record<string, unknown>)[k] ?? null, to: (after as Record<string, unknown>)[k] ?? null }]),
      );
      if (Object.keys(changed).length) {
        const action = req.body.active === false ? "staff.deactivated" : req.body.active === true && !before.active ? "staff.activated" : "staff.updated";
        await c.admin.audit(req.user.id, action, "staff", req.params.id, changed);
      }
      return after;
    },
  );
  r.post(
    "/admin/staff/:id/password",
    {
      schema: {
        tags,
        summary: "Set or reset a staff member's app password (leave empty to generate one). Signs them out everywhere.",
        params: uuidParam,
        body: z.object({ password: staffPassword.optional() }).default({}),
      },
    },
    async (req) => {
      const generated = !req.body.password;
      const password = req.body.password ?? generatePassword();
      const { employeeCode } = await c.staff.setPassword(req.params.id, password);
      await c.tokens.revokeAllForUser(req.params.id);
      await c.admin.audit(req.user.id, "staff.password_set", "staff", req.params.id, { generated });
      // Shown to the admin once so they can hand it over; only the hash is stored.
      return { staffId: employeeCode, password, generated };
    },
  );
  r.get("/admin/staff.csv", { schema: { tags, summary: "Download the staff directory as CSV" } }, async (req, reply) => {
    const rows = await c.staff.listForAdmin();
    const cols = ["displayName", "employeeCode", "phone", "email", "jobTitle", "teamName", "skills", "joinedOn", "emergencyContactName", "emergencyContactPhone", "active", "status", "notes"] as const;
    const cell = (v: unknown) => {
      const text = Array.isArray(v) ? v.join("; ") : v == null ? "" : String(v);
      // Quote everything and neutralise formula prefixes so the file opens safely in Excel.
      return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
    };
    const csv = [cols.join(","), ...rows.map((r) => cols.map((k) => cell((r as Record<string, unknown>)[k])).join(","))].join("\r\n");
    await c.admin.audit(req.user.id, "staff.exported", "staff", null, { rows: rows.length });
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="xtreme-staff-${new Date().toISOString().slice(0, 10)}.csv"`)
      .send("\ufeff" + csv);
  });
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
      await c.admin.audit(req.user.id, req.body.blocked ? "user.blocked" : "user.unblocked", "user", u.id);
      return reply.status(204).send();
    },
  );

  // Admin access (office managers and IT)
  r.get("/admin/admins", { schema: { tags, summary: "People with dashboard access" } }, async () => c.admin.listAdmins());
  r.post(
    "/admin/admins",
    { schema: { tags, summary: "Give a mobile number dashboard access", body: z.object({ phone: phoneInput, fullName: z.string().trim().min(2).max(80), email: z.email().optional() }) } },
    async (req, reply) => {
      const user = await c.admin.addAdmin(req.user.id, { ...req.body, phone: normalizePhone(req.body.phone, c.env.OTP_DEFAULT_REGION) });
      return reply.status(201).send({ id: user.id, fullName: user.fullName, phone: user.phone });
    },
  );
  r.delete("/admin/admins/:id", { schema: { tags, summary: "Remove someone's dashboard access", params: uuidParam } }, async (req, reply) => {
    await c.admin.removeAdmin(req.user.id, req.params.id);
    return reply.status(204).send();
  });

  // Customers
  r.get(
    "/admin/customers",
    { schema: { tags, summary: "Search customers", querystring: z.object({ q: z.string().max(80).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }) } },
    async (req) => c.admin.searchCustomers(req.query.q, req.query.limit),
  );

  // Company contacts shown in the app
  const contactFields = z.object({
    phone: z.string().trim().regex(/^\+\d{8,15}$/, "Use international format, e.g. +971501234567"),
    phoneDisplay: z.string().trim().min(5).max(30),
    landline: z.string().trim().regex(/^\+\d{8,15}$/, "Use international format, e.g. +97126756844"),
    landlineDisplay: z.string().trim().min(5).max(30),
    whatsapp: z.url().refine((u) => u.startsWith("https://wa.me/"), "Use a https://wa.me/ link"),
    email: z.email(),
    website: z.url(),
    addressLine1: z.string().trim().min(3).max(120),
    tagline: z.string().trim().min(3).max(120),
    facebook: z.url(),
    instagram: z.url(),
  });
  r.get("/admin/settings/company", { schema: { tags, summary: "Company contact details shown in the app" } }, async () => c.admin.company());
  r.put(
    "/admin/settings/company",
    { schema: { tags, summary: "Update company contact details (the app picks them up within minutes)", body: contactFields.partial() } },
    async (req) => c.admin.updateCompany(req.user.id, req.body),
  );

  // IT: connected services, health and the audit trail
  r.get("/admin/system", { schema: { tags, summary: "Connected services and health checks" } }, async () => c.admin.system());
  r.get(
    "/admin/audit",
    {
      schema: {
        tags,
        summary: "Audit log of admin actions",
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(500).default(100), targetType: z.string().max(30).optional(), targetId: z.string().max(60).optional() }),
      },
    },
    async (req) => c.admin.auditList(req.query),
  );
}
