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

  r.get(
    "/bookings/:id/payment-options",
    { preHandler: customer, schema: { tags, summary: "Ways to pay for this booking (card or Tamara)", params: uuidParam } },
    async (req) => c.payments.options(req.params.id, req.user),
  );

  r.post(
    "/bookings/:id/payments",
    {
      preHandler: customer,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags,
        summary: "Start paying by card (Stripe PaymentSheet) or Tamara (hosted checkout)",
        params: uuidParam,
        body: z.object({ method: z.enum(["card", "tamara"]), locale: z.enum(["en", "ar"]).optional() }),
      },
    },
    async (req, reply) => reply.status(201).send(await c.payments.start(req.params.id, req.user, req.body.method, { locale: req.body.locale })),
  );

  r.get(
    "/bookings/:id/invoice",
    { preHandler: requireAuth(c, "customer", "admin"), schema: { tags, summary: "Tax invoice for a paid booking (VAT breakdown)", params: uuidParam } },
    async (req) => c.payments.invoice(req.params.id, req.user),
  );

  r.get(
    "/bookings/:id/payments",
    { preHandler: requireAuth(c, "customer", "admin"), schema: { tags, summary: "Payments for a booking", params: uuidParam } },
    async (req) => c.payments.listForBooking(req.params.id, req.user),
  );

  r.post(
    "/payments/:id/sync",
    { preHandler: requireAuth(c, "customer", "admin"), schema: { tags, summary: "Refresh a payment's status from the provider", params: uuidParam } },
    async (req) => c.payments.sync(req.params.id, req.user),
  );

  // Tamara sends the customer's browser here; we update the payment and hand back to the app.
  r.get(
    "/payments/tamara/return",
    {
      schema: {
        tags,
        summary: "Tamara redirect target; forwards to the app",
        querystring: z.object({ paymentId: z.uuid(), result: z.enum(["success", "failure", "cancel"]) }),
      },
    },
    async (req, reply) => {
      const { paymentId, result } = req.query;
      if (result === "success") {
        const [p] = await c.db.query.payments.findMany({ where: (t, { eq }) => eq(t.id, paymentId), limit: 1 });
        if (p) await c.payments.reconcile(p).catch((err) => req.log.warn({ err }, "tamara return sync failed"));
      }
      return reply.redirect(`${c.env.APP_SCHEME}://payments/${paymentId}?result=${result}`, 302);
    },
  );

  // N-Genius sends the customer's browser here after paying (or cancelling); we re-read the order and hand back to the app.
  r.get(
    "/payments/ngenius/return",
    {
      schema: {
        tags,
        summary: "N-Genius redirect target; forwards to the app",
        querystring: z.object({ paymentId: z.uuid(), result: z.enum(["done", "cancel"]), ref: z.string().optional() }),
      },
    },
    async (req, reply) => {
      const { paymentId, result } = req.query;
      let outcome = result === "cancel" ? "cancel" : "failure";
      const [p] = await c.db.query.payments.findMany({ where: (t, { eq }) => eq(t.id, paymentId), limit: 1 });
      if (p) {
        const synced = await c.payments.reconcile(p).catch((err) => (req.log.warn({ err }, "ngenius return sync failed"), p));
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

    hooks.post("/webhooks/stripe", { schema: { tags, summary: "Stripe webhook", hide: true } }, async (req, reply) => {
      const signature = req.headers["stripe-signature"];
      if (typeof signature !== "string" || !Buffer.isBuffer(req.body)) throw badRequest("bad_webhook", "Missing signature");
      await c.payments.handleStripeWebhook(req.body, signature);
      return reply.send({ received: true });
    });

    hooks.post("/webhooks/ngenius", { schema: { tags, summary: "N-Genius webhook", hide: true } }, async (req, reply) => {
      const secret = req.headers["x-webhook-secret"];
      let body: { eventId?: string; eventName?: string; order?: { reference?: string } } = {};
      try {
        body = JSON.parse((req.body as Buffer).toString("utf8"));
      } catch {
        throw badRequest("bad_webhook", "Invalid JSON");
      }
      await c.payments.handleNGeniusWebhook(typeof secret === "string" ? secret : null, body);
      return reply.send({ received: true });
    });

    hooks.post("/webhooks/tamara", { schema: { tags, summary: "Tamara notification", hide: true } }, async (req, reply) => {
      const query = req.query as { tamaraToken?: string };
      const token = query.tamaraToken ?? bearer(req.headers.authorization);
      let body: { order_id?: string; event_type?: string; order_status?: string } = {};
      try {
        body = JSON.parse((req.body as Buffer).toString("utf8"));
      } catch {
        throw badRequest("bad_webhook", "Invalid JSON");
      }
      await c.payments.handleTamaraWebhook(token, body);
      return reply.send({ received: true });
    });
  });
}
