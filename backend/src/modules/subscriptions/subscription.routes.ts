import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Container } from "../../container.js";
import { subscriptionStatus } from "../../db/schema.js";
import { addressInput, isoDate, uuidParam } from "../../lib/schemas.js";
import { requireAuth } from "../../plugins/auth.js";

const tags = ["subscriptions"];
const aed = z.number().int().min(1).max(1_000_000);

const planFields = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullish(),
  serviceKey: z.string().min(1).max(40),
  visitsPerMonth: z.number().int().min(1).max(31),
  priceMonthlyAed: aed.nullish(),
  priceYearlyAed: aed.nullish(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export async function subscriptionRoutes(app: FastifyInstance, c: Container) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const customer = requireAuth(c, "customer");
  const admin = requireAuth(c, "admin");

  // ------------------------------------------------------------ customers
  r.get("/subscription-plans", { schema: { tags, summary: "Monthly and yearly cleaning plans on sale" } }, async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=120");
    return c.subscriptions.plans();
  });

  r.get("/me/subscriptions", { preHandler: customer, schema: { tags, summary: "My subscriptions" } }, async (req) => c.subscriptions.mine(req.user));

  r.post(
    "/subscriptions",
    {
      preHandler: customer,
      schema: {
        tags,
        summary: "Subscribe to a plan; returns the first visit to pay for",
        body: z
          .object({
            planId: z.uuid(),
            interval: z.enum(["monthly", "yearly"]),
            propertyType: z.enum(["apartment", "villa", "office", "restaurant"]),
            propertySize: z.string().min(1).max(20),
            addressId: z.uuid().optional(),
            address: addressInput.optional(),
            firstVisitAt: isoDate,
            notes: z.string().trim().max(1000).optional(),
          })
          .refine((b) => b.addressId || b.address, { message: "Give addressId or address", path: ["address"] }),
      },
    },
    async (req, reply) => reply.status(201).send(await c.subscriptions.subscribe(req.user, req.body)),
  );

  r.get("/subscriptions/:id", { preHandler: customer, schema: { tags, summary: "A subscription", params: uuidParam } }, async (req) =>
    c.subscriptions.get(req.params.id, req.user),
  );

  r.post(
    "/subscriptions/:id/visits",
    {
      preHandler: customer,
      schema: { tags, summary: "Book an included visit", params: uuidParam, body: z.object({ scheduledAt: isoDate, notes: z.string().trim().max(1000).optional() }) },
    },
    async (req, reply) => reply.status(201).send(await c.subscriptions.requestVisit(req.params.id, req.user, req.body.scheduledAt, req.body.notes)),
  );

  r.post(
    "/subscriptions/:id/renew",
    { preHandler: customer, schema: { tags, summary: "Start the next paid period", params: uuidParam, body: z.object({ firstVisitAt: isoDate }) } },
    async (req) => c.subscriptions.renew(req.params.id, req.user, req.body.firstVisitAt),
  );

  r.post("/subscriptions/:id/cancel", { preHandler: customer, schema: { tags, summary: "Cancel an unpaid subscription", params: uuidParam } }, async (req) =>
    c.subscriptions.cancel(req.params.id, req.user),
  );

  // ------------------------------------------------------------ office
  r.get("/admin/subscription-plans", { preHandler: admin, schema: { tags, summary: "All plans, including hidden ones" } }, async () =>
    c.subscriptions.plans({ includeInactive: true }),
  );
  r.post("/admin/subscription-plans", { preHandler: admin, schema: { tags, summary: "Create a plan", body: planFields } }, async (req, reply) =>
    reply.status(201).send(await c.subscriptions.createPlan(req.body)),
  );
  r.patch(
    "/admin/subscription-plans/:id",
    { preHandler: admin, schema: { tags, summary: "Change a plan's prices or details (running subscriptions keep their price)", params: uuidParam, body: planFields.partial() } },
    async (req) => c.subscriptions.updatePlan(req.params.id, req.body),
  );
  r.get(
    "/admin/subscriptions",
    {
      preHandler: admin,
      schema: {
        tags,
        summary: "Subscriptions",
        querystring: z.object({
          status: z.preprocess((v) => (typeof v === "string" ? v.split(",") : v), z.array(z.enum(subscriptionStatus.enumValues)).optional()),
          limit: z.coerce.number().int().min(1).max(200).default(100),
        }),
      },
    },
    async (req) => c.subscriptions.listForAdmin(req.query),
  );
  r.post(
    "/admin/subscriptions/:id/visits",
    {
      preHandler: admin,
      schema: { tags, summary: "Book an included visit for a subscriber", params: uuidParam, body: z.object({ scheduledAt: isoDate, notes: z.string().trim().max(1000).optional() }) },
    },
    async (req, reply) => reply.status(201).send(await c.subscriptions.requestVisit(req.params.id, req.user, req.body.scheduledAt, req.body.notes)),
  );
  r.post(
    "/admin/subscriptions/:id/cancel",
    { preHandler: admin, schema: { tags, summary: "Cancel a subscription", params: uuidParam, body: z.object({ reason: z.string().trim().max(300).optional() }) } },
    async (req) => c.subscriptions.cancel(req.params.id, req.user, req.body.reason),
  );
}
