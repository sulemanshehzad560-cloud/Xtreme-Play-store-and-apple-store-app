import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Container } from "../../container.js";
import { avatarSignature } from "./user.service.js";

/** Profile photos by signed link, so images load without a sign-in token. */
export async function avatarRoutes(app: FastifyInstance, c: Container) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/avatars/:id/:v/:sig",
    {
      schema: {
        tags: ["Users"],
        summary: "A profile photo (signed link)",
        params: z.object({ id: z.uuid(), v: z.string().regex(/^\d{1,16}$/), sig: z.string().regex(/^[0-9a-f]{32}$/) }),
      },
    },
    async (req, reply) => {
      const { id, v, sig } = req.params;
      const expected = Buffer.from(avatarSignature(c.env.JWT_SECRET, id, v));
      if (!timingSafeEqual(expected, Buffer.from(sig))) return reply.status(404).send({ error: { code: "not_found", message: "Photo not found" } });
      const a = await c.users.avatar(id);
      // Each version has its own link, so it can be cached for a long time.
      return reply.type(a.contentType).header("cache-control", "private, max-age=2592000, immutable").send(a.bytes);
    },
  );
}
