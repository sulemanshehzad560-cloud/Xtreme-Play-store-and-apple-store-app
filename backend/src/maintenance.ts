import type { FastifyBaseLogger } from "fastify";
import { and, inArray, lt, or, isNotNull } from "drizzle-orm";
import type { Container } from "./container.js";
import { locationPings, otpChallenges, payments, refreshTokens } from "./db/schema.js";

/**
 * Housekeeping, run every hour: drops location history past its retention period
 * (privacy), expired codes and sessions, and re-checks payments stuck as pending in
 * case a webhook was missed.
 */
export async function runMaintenance(c: Container, log: FastifyBaseLogger) {
  const now = Date.now();
  const pings = await c.db
    .delete(locationPings)
    .where(lt(locationPings.recordedAt, new Date(now - c.env.LOCATION_HISTORY_RETENTION_DAYS * 86_400_000)))
    .returning({ id: locationPings.id });
  await c.db.delete(otpChallenges).where(lt(otpChallenges.createdAt, new Date(now - 86_400_000)));
  await c.db
    .delete(refreshTokens)
    .where(
      or(
        lt(refreshTokens.expiresAt, new Date(now - 7 * 86_400_000)),
        and(isNotNull(refreshTokens.revokedAt), lt(refreshTokens.revokedAt!, new Date(now - 7 * 86_400_000))),
      ),
    );

  const stuck = await c.db
    .select()
    .from(payments)
    .where(and(inArray(payments.status, ["pending", "authorised"]), lt(payments.updatedAt, new Date(now - 15 * 60_000)), isNotNull(payments.providerRef)))
    .limit(100);
  for (const p of stuck) {
    await c.payments.reconcile(p).catch((err) => log.warn({ err, paymentId: p.id }, "payment re-check failed"));
  }
  log.info({ prunedPings: pings.length, recheckedPayments: stuck.length }, "maintenance done");
}

export function scheduleMaintenance(c: Container, log: FastifyBaseLogger): () => void {
  const run = () => runMaintenance(c, log).catch((err) => log.error({ err }, "maintenance failed"));
  const timer = setInterval(run, 3_600_000);
  timer.unref();
  return () => clearInterval(timer);
}
