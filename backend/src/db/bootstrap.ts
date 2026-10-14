import { and, eq, isNull } from "drizzle-orm";
import type { Env } from "../config/env.js";
import { normalizePhone } from "../lib/phone.js";
import { createDb } from "./client.js";
import { users } from "./schema.js";

/**
 * Creates (or promotes) the first admin from ADMIN_PHONE, but only while no admin exists,
 * so admins removed later from the dashboard are not brought back. Returns a short status line.
 */
export async function ensureFirstAdmin(env: Env, opts: { force?: boolean } = {}): Promise<string> {
  if (!env.ADMIN_PHONE) return "ADMIN_PHONE not set; no admin created";
  const phone = normalizePhone(env.ADMIN_PHONE, env.OTP_DEFAULT_REGION);
  const { db, pool } = createDb(env.DATABASE_URL, 1);
  try {
    if (!opts.force) {
      const [admin] = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), isNull(users.deletedAt))).limit(1);
      if (admin) return "Admin already exists";
    }
    const [existing] = await db.select().from(users).where(and(eq(users.phone, phone), isNull(users.deletedAt)));
    if (existing?.role === "staff") return `ADMIN_PHONE ${phone} belongs to a staff member; use another number`;
    if (existing) await db.update(users).set({ role: "admin" }).where(eq(users.id, existing.id));
    else await db.insert(users).values({ phone, role: "admin", fullName: "Xtreme Office" });
    return `Admin ready: ${phone}. Sign in with this number.`;
  } finally {
    await pool.end();
  }
}
