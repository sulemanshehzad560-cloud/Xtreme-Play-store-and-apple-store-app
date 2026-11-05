import type { FastifyInstance } from "fastify";
import type { Container } from "../../container.js";
import { validTwilioSignature } from "./masked-call.js";

/**
 * Twilio voice webhooks for the masked number. Set the number's "A call comes in" webhook to
 * POST {PUBLIC_URL}/v1/voice/inbound. Every request must carry a valid Twilio signature.
 */
export async function voiceRoutes(app: FastifyInstance, c: Container) {
  // Call recordings for the dashboard's audio player (signed links; supports seeking).
  app.get("/call-recordings/:id/:sig", { schema: { hide: true } }, async (req, reply) => {
    const { id, sig } = req.params as { id: string; sig: string };
    if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{32}$/.test(sig)) return reply.status(404).send();
    try {
      const rec = await c.calls.recording(id, sig, req.headers.range);
      reply.status(rec.status).type(rec.contentType).header("cache-control", "private, max-age=3600").header("accept-ranges", "bytes");
      if (rec.length != null) reply.header("content-length", rec.length);
      if (rec.range) reply.header("content-range", rec.range);
      return reply.send(rec.body);
    } catch {
      return reply.status(404).send();
    }
  });

  // LiveKit webhooks (recording finished, room closed). Set in LiveKit Cloud → Settings → Webhooks:
  // {PUBLIC_URL}/v1/livekit/webhook
  await app.register(async (lk) => {
    lk.addContentTypeParser(["application/webhook+json", "application/json"], { parseAs: "string", bodyLimit: 100_000 }, (_req, body, done) => done(null, body));
    lk.post("/livekit/webhook", { schema: { hide: true } }, async (req, reply) => {
      try {
        return await c.calls.onWebhook(req.body as string, req.headers.authorization);
      } catch {
        return reply.status(401).send();
      }
    });
  });

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
