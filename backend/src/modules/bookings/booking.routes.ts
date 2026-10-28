import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Container } from "../../container.js";
import { addressInput, isoDate, pageQuery, uuidParam } from "../../lib/schemas.js";
import { requireAuth } from "../../plugins/auth.js";

const tags = ["bookings"];

export async function bookingRoutes(app: FastifyInstance, c: Container) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const customer = requireAuth(c, "customer");
  const anyone = requireAuth(c);

  r.post(
    "/bookings",
    {
      preHandler: customer,
      schema: {
        tags,
        summary: "Book a service",
        description: "Send an Idempotency-Key header (any unique string per booking attempt) so retries never double-book.",
        headers: z.object({ "idempotency-key": z.string().min(8).max(100).optional() }),
        body: z
          .object({
            serviceKey: z.string().min(1).max(40),
            propertyType: z.enum(["apartment", "villa", "office", "restaurant"]),
            propertySize: z.string().min(1).max(20),
            plan: z.enum(["one_off", "amc"]).default("one_off"),
            /** Regular cleaning can repeat; the next visit is created when one is completed. */
            frequency: z.enum(["one_time", "weekly", "biweekly"]).default("one_time"),
            scheduledAt: isoDate,
            addressId: z.uuid().optional(),
            address: addressInput.optional(),
            notes: z.string().trim().max(1000).optional(),
            // Customers pay in the app (card / wallets or Tamara); there is no pay-on-the-day option.
            paymentMethod: z.enum(["card", "tamara"]).default("card"),
          })
          .refine((b) => b.addressId || b.address, { message: "Give addressId or address", path: ["address"] }),
      },
    },
    async (req, reply) => {
      const booking = await c.bookings.create(req.user, { ...req.body, idempotencyKey: req.headers["idempotency-key"] });
      return reply.status(201).send(booking);
    },
  );

  r.get(
    "/bookings",
    {
      preHandler: customer,
      schema: { tags, summary: "My bookings", querystring: pageQuery.extend({ scope: z.enum(["active", "past", "all"]).default("all") }) },
    },
    async (req) => c.bookings.listForCustomer(req.user.id, req.query),
  );

  r.get("/bookings/:id", { preHandler: anyone, schema: { tags, summary: "Booking details and timeline", params: uuidParam } }, async (req) =>
    c.bookings.get(req.params.id, req.user),
  );

  r.patch(
    "/bookings/:id",
    {
      preHandler: requireAuth(c, "customer", "admin"),
      schema: {
        tags,
        summary: "Reschedule or change notes",
        params: uuidParam,
        body: z.object({ scheduledAt: isoDate.optional(), notes: z.string().trim().max(1000).optional() }),
      },
    },
    async (req) => c.bookings.reschedule(req.params.id, req.user, req.body),
  );

  r.post(
    "/bookings/:id/cancel",
    {
      preHandler: requireAuth(c, "customer", "admin"),
      schema: { tags, summary: "Cancel a booking (paid bookings are refunded)", params: uuidParam, body: z.object({ reason: z.string().trim().max(500).optional() }) },
    },
    async (req) => c.bookings.cancel(req.params.id, req.user, req.body.reason),
  );

  r.get(
    "/bookings/:id/tracking",
    { preHandler: anyone, schema: { tags, summary: "Assigned team, their status and live position", params: uuidParam } },
    async (req) => c.bookings.tracking(req.params.id, req.user),
  );

  r.post(
    "/bookings/:id/review",
    {
      preHandler: customer,
      schema: {
        tags,
        summary: "Rate a completed booking",
        params: uuidParam,
        body: z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() }),
      },
    },
    async (req) => c.bookings.review(req.params.id, req.user, req.body),
  );
}
