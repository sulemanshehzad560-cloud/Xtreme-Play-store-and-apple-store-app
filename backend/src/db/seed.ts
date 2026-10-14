import { loadEnv } from "../config/env.js";
import { ensureFirstAdmin } from "./bootstrap.js";

/** Creates (or promotes) the admin from ADMIN_PHONE, even if other admins exist. They then sign in with OTP. */
const env = loadEnv();
if (!env.ADMIN_PHONE) throw new Error("Set ADMIN_PHONE to the office manager's mobile number");
console.log(await ensureFirstAdmin(env, { force: true }));
