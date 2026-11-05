import type { FastifyInstance } from "fastify";
import type { Container } from "../../container.js";
import { validTwilioSignature } from "./masked-call.js";

/**
 * Twilio voice webhooks for the masked number. Set the number's "A call comes in" webhook to
 * POST {PUBLIC_URL}/v1/voice/inbound. Every request must carry a valid Twilio signature.
 */
export async function voiceRoutes(app: FastifyInstance, c: Container) {
  await app.register(async (voice) => {
    voice.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string", bodyLimit: 20_000 }, (_req, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    });

    const verified = (url: string, params: Record<string, string>, sig: string | undefined) => {
      const token = c.env.TWILIO_AUTH_TOKEN;
      return !!token && validTwilioSignature(token, `${c.env.PUBLIC_URL}${url}`, params, sig);
    };

    voice.post("/voice/inbound", { schema: { hide: true } }, async (req, reply) => {
      const params = (req.body ?? {}) as Record<string, string>;
      if (!verified(req.url, params, req.headers["x-twilio-signature"] as string | undefined)) return reply.status(403).send();
      const twiml = await c.voice.inbound(params.From ?? "", params.CallSid);
      return reply.type("text/xml").send(twiml);
    });

    voice.post("/voice/ended", { schema: { hide: true } }, async (req, reply) => {
      const params = (req.body ?? {}) as Record<string, string>;
      if (!verified(req.url, params, req.headers["x-twilio-signature"] as string | undefined)) return reply.status(403).send();
      const logId = (req.query as { log?: string }).log ?? "";
      if (!/^[0-9a-f-]{36}$/.test(logId)) return reply.status(400).send();
      return reply.type("text/xml").send(await c.voice.ended(logId, Number(params.DialCallDuration ?? 0)));
    });
  });
}
