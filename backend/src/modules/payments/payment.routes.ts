import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Container } from "../../container.js";
import { badRequest } from "../../lib/errors.js";
import { uuidParam } from "../../lib/schemas.js";
import { bearer, requireAuth } from "../../plugins/auth.js";

const tags = ["payments"];

export async function paymentRoutes(app: FastifyInstance, c: Container) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const customer = requireAuth(c, "customer");
  const team = requireAuth(c, "staff", "admin");

  r.post(
    "/bookings/:id/cash-collected",
    {
      onRequest: team,
      schema: { tags, summary: "The team collected the cash balance of a cash booking", params: uuidParam },
    },
    async (req) => c.payments.collectCash(req.params.id, req.user),
  );

  r.get(
    "/bookings/:id/payment-options",
    { onRequest: customer, schema: { tags, summary: "Ways to pay for this booking (card, or cash with an online deposit)", params: uuidParam } },
    async (req) => c.payments.options(req.params.id, req.user),
  );

  r.post(
    "/bookings/:id/payments",
    {
      onRequest: customer,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags,
        summary: "Start paying by card, or the online deposit of a cash booking",
        params: uuidParam,
        body: z.object({
          method: z.enum(["card", "cash"]),
          locale: z.enum(["en", "ar"]).optional(),
          /** Optional tip for the team, in whole AED. */
          tipAed: z.number().int().min(0).max(500).optional(),
        }),
      },
    },
    async (req, reply) =>
      reply.status(201).send(await c.payments.start(req.params.id, req.user, req.body.method, { locale: req.body.locale, tipAed: req.body.tipAed })),
  );

  r.get(
    "/bookings/:id/invoice",
    { onRequest: requireAuth(c, "customer", "admin"), schema: { tags, summary: "Tax invoice for a paid booking (VAT breakdown)", params: uuidParam } },
    async (req) => c.payments.invoice(req.params.id, req.user),
  );

  r.get(
    "/bookings/:id/payments",
    { onRequest: requireAuth(c, "customer", "admin"), schema: { tags, summary: "Payments for a booking", params: uuidParam } },
    async (req) => c.payments.listForBooking(req.params.id, req.user),
  );

  r.post(
    "/payments/:id/sync",
    { onRequest: requireAuth(c, "customer", "admin"), schema: { tags, summary: "Refresh a payment's status from the provider", params: uuidParam } },
    async (req) => c.payments.sync(req.params.id, req.user),
  );

  // Ziina sends the customer's browser here after paying (or cancelling); we re-read the payment and hand back to the app.
  r.get(
    "/payments/ziina/return",
    {
      schema: {
        tags,
        summary: "Ziina redirect target; forwards to the app",
        querystring: z.object({ paymentId: z.uuid(), result: z.enum(["done", "cancel"]), ref: z.string().optional() }),
      },
    },
    async (req, reply) => {
      const { paymentId, result } = req.query;
      let outcome = result === "cancel" ? "cancel" : "failure";
      const [p] = await c.db.query.payments.findMany({ where: (t, { eq }) => eq(t.id, paymentId), limit: 1 });
      if (p) {
        const synced = await c.payments.reconcile(p).catch((err) => (req.log.warn({ err }, "Ziina return sync failed"), p));
        if (["captured", "partially_refunded", "refunded"].includes(synced.status)) outcome = "success";
        else if (synced.status === "pending" && result !== "cancel") outcome = "pending";
      }
      return reply.redirect(`${c.env.APP_SCHEME}://payments/${paymentId}?result=${outcome}`, 302);
    },
  );

  // Webhooks need the exact bytes for signature checks, so they get their own JSON parser.
  await app.register(async (hooks) => {
    hooks.removeContentTypeParser("application/json");
    hooks.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));

    hooks.post("/webhooks/ziina", { schema: { tags, summary: "Ziina webhook", hide: true } }, async (req, reply) => {
      const signature = req.headers["x-hmac-signature"];
      if (!Buffer.isBuffer(req.body)) throw badRequest("bad_webhook", "Missing body");
      await c.payments.handleZiinaWebhook(req.body, typeof signature === "string" ? signature : null);
      return reply.send({ received: true });
    });

  });
}
