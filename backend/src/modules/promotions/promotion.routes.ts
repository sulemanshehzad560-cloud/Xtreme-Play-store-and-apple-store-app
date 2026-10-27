import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Container } from "../../container.js";
import { uuidParam } from "../../lib/schemas.js";
import { requireAuth } from "../../plugins/auth.js";

const tags = ["promotions"];
const aed = z.number().int().min(1).max(1_000_000);
const when = z.coerce.date();

const promoFields = z.object({
  name: z.string().trim().min(2).max(80),
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{3,24}$/, "Use 3–24 letters, numbers, - or _")
    .nullish()
    .or(z.literal("").transform(() => null)),
  kind: z.enum(["percent", "fixed"]),
  value: z.number().int().min(1).max(100_000),
  autoApply: z.boolean(),
  firstBookingOnly: z.boolean(),
  minOrderAed: aed.nullish(),
  maxDiscountAed: aed.nullish(),
  serviceKeys: z.array(z.string().min(1).max(40)).max(30).nullish(),
  startsAt: when.nullish(),
  endsAt: when.nullish(),
  usageLimit: z.number().int().min(1).max(1_000_000).nullish(),
  active: z.boolean(),
});

export async function promotionRoutes(app: FastifyInstance, c: Container) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const customer = requireAuth(c, "customer");
  const admin = requireAuth(c, "admin");

  r.post(
    "/bookings/:id/promo",
    {
      preHandler: customer,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: { tags, summary: "Apply a promo code to an unpaid booking", params: uuidParam, body: z.object({ code: z.string().trim().min(2).max(40) }) },
    },
    async (req) => c.promotions.applyCode(req.params.id, req.user, req.body.code),
  );

  r.delete("/bookings/:id/promo", { preHandler: customer, schema: { tags, summary: "Remove the promo code", params: uuidParam } }, async (req) =>
    c.promotions.removeCode(req.params.id, req.user),
  );

  r.get("/admin/promotions", { preHandler: admin, schema: { tags, summary: "All promotions" } }, async () => c.promotions.list());

  r.post("/admin/promotions", { preHandler: admin, schema: { tags, summary: "Create a promotion", body: promoFields } }, async (req, reply) =>
    reply.status(201).send(await c.promotions.create(req.body)),
  );

  r.patch(
    "/admin/promotions/:id",
    { preHandler: admin, schema: { tags, summary: "Edit, pause or end a promotion", params: uuidParam, body: promoFields.partial() } },
    async (req) => c.promotions.update(req.params.id, req.body),
  );
}
