import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Container } from "../../container.js";
import { normalizePhone } from "../../lib/phone.js";
import { addressInput, otpCode, pageQuery, phoneInput, uuidParam } from "../../lib/schemas.js";
import { requireAuth } from "../../plugins/auth.js";

const tags = ["me"];

export async function meRoutes(app: FastifyInstance, c: Container) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook("preHandler", requireAuth(c));

  r.get("/me", { schema: { tags, summary: "My profile" } }, async (req) => c.auth.publicUser(req.user.id));

  r.patch(
    "/me",
    {
      schema: {
        tags,
        summary: "Update my profile",
        body: z.object({
          fullName: z.string().trim().min(2).max(80).optional(),
          email: z.email().max(160).nullish(),
          locale: z.enum(["en", "ar"]).optional(),
          marketingOptIn: z.boolean().optional(),
        }),
      },
    },
    async (req) => {
      await c.users.updateProfile(req.user.id, req.body);
      return c.auth.publicUser(req.user.id);
    },
  );

  r.delete("/me", { schema: { tags, summary: "Delete my account and personal data" } }, async (req, reply) => {
    await c.users.deleteAccount(req.user.id);
    return reply.status(204).send();
  });

  // Sign-in methods
  r.post(
    "/me/phone",
    { schema: { tags, summary: "Verify and set my mobile number", body: z.object({ phone: phoneInput, code: otpCode }) } },
    async (req) => c.auth.linkPhone(req.user.id, normalizePhone(req.body.phone, c.env.OTP_DEFAULT_REGION), req.body.code),
  );
  r.post(
    "/me/identities/:provider",
    {
      schema: {
        tags,
        summary: "Connect Google, Facebook or Apple to my account",
        params: z.object({ provider: z.enum(["google", "facebook", "apple"]) }),
        body: z.object({ token: z.string().min(20), nonce: z.string().max(200).optional() }),
      },
    },
    async (req) => c.auth.linkSocial(req.user.id, req.params.provider, req.body.token, req.body.nonce),
  );
  r.delete(
    "/me/identities/:provider",
    {
      schema: { tags, summary: "Remove a sign-in method", params: z.object({ provider: z.enum(["phone", "google", "facebook", "apple"]) }) },
    },
    async (req) => c.auth.unlink(req.user.id, req.params.provider),
  );

  // Addresses
  r.get("/me/addresses", { schema: { tags, summary: "My saved addresses" } }, async (req) => c.users.listAddresses(req.user.id));
  r.post(
    "/me/addresses",
    { schema: { tags, summary: "Save an address", body: addressInput.extend({ isDefault: z.boolean().optional() }) } },
    async (req, reply) => reply.status(201).send(await c.users.addAddress(req.user.id, req.body)),
  );
  r.patch(
    "/me/addresses/:id",
    {
      schema: { tags, summary: "Edit an address", params: uuidParam, body: addressInput.partial().extend({ isDefault: z.boolean().optional() }) },
    },
    async (req) => c.users.updateAddress(req.user.id, req.params.id, req.body),
  );
  r.delete("/me/addresses/:id", { schema: { tags, summary: "Delete an address", params: uuidParam } }, async (req, reply) => {
    await c.users.deleteAddress(req.user.id, req.params.id);
    return reply.status(204).send();
  });

  // Push notifications
  r.post(
    "/me/push-tokens",
    {
      schema: {
        tags,
        summary: "Register this device for push notifications",
        body: z.object({ token: z.string().min(10).max(300), platform: z.enum(["ios", "android", "web"]) }),
      },
    },
    async (req, reply) => {
      await c.users.registerPushToken(req.user.id, req.body.token, req.body.platform);
      return reply.status(204).send();
    },
  );
  r.delete(
    "/me/push-tokens",
    { schema: { tags, summary: "Stop push notifications on this device", body: z.object({ token: z.string().min(10).max(300) }) } },
    async (req, reply) => {
      await c.users.removePushToken(req.user.id, req.body.token);
      return reply.status(204).send();
    },
  );

  r.get("/me/notifications", { schema: { tags, summary: "My notification inbox", querystring: pageQuery } }, async (req) =>
    c.notifications.list(req.user.id, req.query),
  );
  r.post(
    "/me/notifications/read",
    { schema: { tags, summary: "Mark notifications read", body: z.object({ ids: z.array(z.uuid()).max(200).or(z.literal("all")) }) } },
    async (req, reply) => {
      await c.notifications.markRead(req.user.id, req.body.ids);
      return reply.status(204).send();
    },
  );
}
