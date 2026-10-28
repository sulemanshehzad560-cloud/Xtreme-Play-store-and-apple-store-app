import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Container } from "../../container.js";
import { requireAuth } from "../../plugins/auth.js";

const tags = ["support"];
const body = z.object({ body: z.string().trim().min(1).max(2000) });

export async function supportRoutes(app: FastifyInstance, c: Container) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const customer = requireAuth(c, "customer");
  const admin = requireAuth(c, "admin");

  r.get("/me/support/messages", { preHandler: customer, schema: { tags, summary: "My chat with the Xtreme team" } }, async (req) => c.support.thread(req.user.id));
  r.get("/me/support/unread", { preHandler: customer, schema: { tags, summary: "Unread replies in my chat" } }, async (req) => c.support.unreadForCustomer(req.user.id));
  r.post(
    "/me/support/messages",
    { preHandler: customer, config: { rateLimit: { max: 20, timeWindow: "1 minute" } }, schema: { tags, summary: "Send a message (instant answer when we can)", body } },
    async (req, reply) => reply.status(201).send(await c.support.send(req.user.id, req.body.body)),
  );

  r.get("/admin/support/threads", { preHandler: admin, schema: { tags, summary: "Customer conversations, newest first" } }, async () => c.support.threads());
  r.get("/admin/support/threads/:customerId", { preHandler: admin, schema: { tags, summary: "One conversation", params: z.object({ customerId: z.uuid() }) } }, async (req) =>
    c.support.adminThread(req.params.customerId),
  );
  r.post(
    "/admin/support/threads/:customerId",
    { preHandler: admin, schema: { tags, summary: "Reply to a customer", params: z.object({ customerId: z.uuid() }), body } },
    async (req, reply) => reply.status(201).send(await c.support.reply(req.params.customerId, req.user, req.body.body)),
  );
}
