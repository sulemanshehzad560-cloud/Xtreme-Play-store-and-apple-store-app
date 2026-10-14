import type { FastifyError, FastifyInstance } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
import { AppError } from "../lib/errors.js";

/** Every error leaves the API in one shape: { error: { code, message, details? } }. */
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof AppError) {
      if (err.statusCode === 429) {
        const retry = (err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
        if (retry) reply.header("Retry-After", String(retry));
      }
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({
        error: {
          code: "validation_error",
          message: "Some fields are missing or invalid",
          details: err.validation.map((v) => ({ path: v.instancePath.replace(/^\//, "").replaceAll("/", "."), message: v.message })),
        },
      });
    }
    if (err.statusCode === 429) {
      return reply.status(429).send({ error: { code: "rate_limited", message: "Too many requests. Please slow down." } });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: { code: err.code ?? "bad_request", message: err.message } });
    }
    req.log.error({ err }, "unhandled error");
    return reply.status(500).send({ error: { code: "internal_error", message: "Something went wrong. Please try again." } });
  });

  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({ error: { code: "route_not_found", message: `${req.method} ${req.url} does not exist` } }),
  );
}
