import { and, eq, isNull } from "drizzle-orm";
import { loadEnv } from "../config/env.js";
import { normalizePhone } from "../lib/phone.js";
import { createDb } from "./client.js";
import { users } from "./schema.js";

/** Creates (or promotes) the first admin from ADMIN_PHONE. They then sign in with OTP. */
const env = loadEnv();
if (!env.ADMIN_PHONE) throw new Error("Set ADMIN_PHONE to the office manager's mobile number");
const phone = normalizePhone(env.ADMIN_PHONE, env.OTP_DEFAULT_REGION);
const { db, pool } = createDb(env.DATABASE_URL, 1);
const [existing] = await db.select().from(users).where(and(eq(users.phone, phone), isNull(users.deletedAt)));
if (existing) await db.update(users).set({ role: "admin" }).where(eq(users.id, existing.id));
else await db.insert(users).values({ phone, role: "admin", fullName: "Xtreme Office" });
console.log(`Admin ready: ${phone}. Sign in with this number in the app.`);
await pool.end();
