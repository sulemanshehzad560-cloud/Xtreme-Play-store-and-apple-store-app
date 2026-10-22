import { and, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import type { Env } from "../../config/env.js";
import { COMPANY } from "../../config/company.js";
import type { Database } from "../../db/client.js";
import { appSettings, auditLogs, bookings, users } from "../../db/schema.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import type { TokenService } from "../auth/tokens.js";

/** Company contact details the office can change from the dashboard. */
export interface CompanyContacts {
  phone: string;
  phoneDisplay: string;
  landline: string;
  landlineDisplay: string;
  whatsapp: string;
  email: string;
  website: string;
  addressLine1: string;
  tagline: string;
  facebook: string;
  instagram: string;
}

const COMPANY_KEY = "company_contacts";

export const companyDefaults = (): CompanyContacts => ({
  phone: COMPANY.phone,
  phoneDisplay: COMPANY.phoneDisplay,
  landline: COMPANY.landline,
  landlineDisplay: COMPANY.landlineDisplay,
  whatsapp: COMPANY.whatsapp,
  email: COMPANY.email,
  website: COMPANY.website,
  addressLine1: COMPANY.address.line1,
  tagline: COMPANY.tagline,
  facebook: COMPANY.social.facebook,
  instagram: COMPANY.social.instagram,
});

export class AdminService {
  private companyCache: { value: CompanyContacts; at: number } | null = null;

  constructor(
    private readonly db: Database,
    private readonly tokens: TokenService,
    private readonly env: Env,
  ) {}

  // ------------------------------------------------------------ audit

  async audit(actorId: string | null, action: string, targetType: string, targetId: string | null, details?: Record<string, unknown>) {
    await this.db.insert(auditLogs).values({ actorId, action, targetType, targetId, details: details ?? null });
  }

  async auditList(opts: { limit: number; targetType?: string | undefined; targetId?: string | undefined }) {
    const rows = await this.db
      .select({ log: auditLogs, actorName: users.fullName, actorPhone: users.phone })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(
        and(
          opts.targetType ? eq(auditLogs.targetType, opts.targetType) : undefined,
          opts.targetId ? eq(auditLogs.targetId, opts.targetId) : undefined,
        ),
      )
      .orderBy(desc(auditLogs.id))
      .limit(opts.limit);
    return rows.map(({ log, actorName, actorPhone }) => ({
      id: log.id,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      details: log.details,
      actor: log.actorId ? { id: log.actorId, name: actorName, phone: actorPhone } : null,
      at: log.createdAt.toISOString(),
    }));
  }

  // ------------------------------------------------------------ admin access

  async listAdmins() {
    const rows = await this.db
      .select({ id: users.id, fullName: users.fullName, phone: users.phone, email: users.email, createdAt: users.createdAt, blockedAt: users.blockedAt })
      .from(users)
      .where(and(eq(users.role, "admin"), isNull(users.deletedAt)))
      .orderBy(users.createdAt);
    return rows.map((r) => ({ ...r, blocked: Boolean(r.blockedAt), createdAt: r.createdAt.toISOString(), blockedAt: undefined }));
  }

  /** Gives dashboard access to a mobile number (an existing customer or a new account). */
  async addAdmin(actorId: string, input: { phone: string; fullName: string; email?: string | undefined }) {
    const [existing] = await this.db.select().from(users).where(and(eq(users.phone, input.phone), isNull(users.deletedAt))).limit(1);
    if (existing?.role === "admin") throw conflict("already_admin", "This number already has admin access");
    if (existing?.role === "staff") throw conflict("is_staff", "This number belongs to a staff member. Use a different number for admin access.");
    const [user] = existing
      ? await this.db
          .update(users)
          .set({ role: "admin", fullName: existing.fullName ?? input.fullName, updatedAt: new Date() })
          .where(eq(users.id, existing.id))
          .returning()
      : await this.db.insert(users).values({ phone: input.phone, fullName: input.fullName, email: input.email ?? null, role: "admin" }).returning();
    // Existing sessions carry the old role in their access token; make them sign in again.
    await this.tokens.revokeAllForUser(user!.id);
    await this.audit(actorId, "admin.added", "user", user!.id, { phone: input.phone, name: input.fullName });
    return user!;
  }

  async removeAdmin(actorId: string, adminId: string) {
    if (actorId === adminId) throw badRequest("cannot_remove_self", "You can't remove your own admin access");
    const [target] = await this.db.select().from(users).where(and(eq(users.id, adminId), eq(users.role, "admin"), isNull(users.deletedAt)));
    if (!target) throw notFound("Admin");
    const [{ n }] = (await this.db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), isNull(users.deletedAt), isNull(users.blockedAt)))) as [{ n: number }];
    if (n <= 1) throw conflict("last_admin", "At least one admin must remain");
    await this.db.update(users).set({ role: "customer", updatedAt: new Date() }).where(eq(users.id, adminId));
    await this.tokens.revokeAllForUser(adminId);
    await this.audit(actorId, "admin.removed", "user", adminId, { phone: target.phone, name: target.fullName });
  }

  // ------------------------------------------------------------ customers

  async searchCustomers(q: string | undefined, limit: number) {
    const term = q?.trim();
    const like = term ? `%${term.replace(/[%_]/g, "")}%` : null;
    const rows = await this.db
      .select({
        id: users.id,
        fullName: users.fullName,
        phone: users.phone,
        email: users.email,
        createdAt: users.createdAt,
        blockedAt: users.blockedAt,
        bookings: sql<number>`(select count(*)::int from ${bookings} where ${bookings.customerId} = ${users.id})`,
      })
      .from(users)
      .where(
        and(
          eq(users.role, "customer"),
          isNull(users.deletedAt),
          like ? or(ilike(users.fullName, like), ilike(users.phone, like), ilike(users.email, like)) : undefined,
        ),
      )
      .orderBy(desc(users.createdAt))
      .limit(limit);
    return rows.map((r) => ({ ...r, blocked: Boolean(r.blockedAt), createdAt: r.createdAt.toISOString(), blockedAt: undefined }));
  }

  // ------------------------------------------------------------ company contacts

  /** Current contacts: code defaults overlaid with whatever the office saved. Cached briefly. */
  async company(): Promise<CompanyContacts> {
    if (this.companyCache && Date.now() - this.companyCache.at < 30_000) return this.companyCache.value;
    const [row] = await this.db.select().from(appSettings).where(eq(appSettings.key, COMPANY_KEY)).limit(1);
    const value = { ...companyDefaults(), ...((row?.value as Partial<CompanyContacts> | undefined) ?? {}) };
    this.companyCache = { value, at: Date.now() };
    return value;
  }

  async updateCompany(actorId: string, patch: Partial<CompanyContacts>) {
    const before = await this.company();
    const next = { ...before, ...patch };
    await this.db
      .insert(appSettings)
      .values({ key: COMPANY_KEY, value: next as unknown as Record<string, unknown>, updatedBy: actorId })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: next as unknown as Record<string, unknown>, updatedBy: actorId, updatedAt: new Date() } });
    this.companyCache = null;
    const changed = Object.fromEntries(Object.keys(patch).filter((k) => before[k as keyof CompanyContacts] !== next[k as keyof CompanyContacts]).map((k) => [k, { from: before[k as keyof CompanyContacts], to: next[k as keyof CompanyContacts] }]));
    await this.audit(actorId, "settings.company_updated", "settings", COMPANY_KEY, changed);
    return next;
  }

  // ------------------------------------------------------------ system status

  /** Which outside services are connected, and whether the database and Redis answer. */
  async system() {
    const e = this.env;
    const check = async (fn: () => Promise<unknown>) => {
      const t = Date.now();
      try {
        await fn();
        return { ok: true, ms: Date.now() - t };
      } catch (err) {
        return { ok: false, ms: Date.now() - t, error: err instanceof Error ? err.message : "failed" };
      }
    };
    return {
      environment: e.NODE_ENV,
      version: process.env.APP_VERSION ?? process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "dev",
      uptimeSeconds: Math.round(process.uptime()),
      health: {
        database: await check(() => this.db.execute(sql`select 1`)),
        redis: e.REDIS_URL
          ? await check(async () => {
              const client = new Redis(e.REDIS_URL!, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000 });
              try {
                await client.connect();
                await client.ping();
              } finally {
                client.disconnect();
              }
            })
          : { ok: null, note: "Not configured (single server)" },
      },
      integrations: [
        { key: "sms", name: "SMS sign-in codes", provider: e.SMS_PROVIDER === "twilio" ? "Twilio" : "Console (development)", connected: e.SMS_PROVIDER === "twilio" && Boolean(e.TWILIO_ACCOUNT_SID) },
        { key: "google", name: "Google sign-in", provider: "Google", connected: e.GOOGLE_CLIENT_IDS.length > 0 },
        { key: "apple", name: "Sign in with Apple", provider: "Apple", connected: e.APPLE_BUNDLE_IDS.length > 0 },
        { key: "facebook", name: "Facebook sign-in", provider: "Facebook", connected: Boolean(e.FACEBOOK_APP_ID && e.FACEBOOK_APP_SECRET) },
        { key: "card", name: "Card, Apple Pay, Google Pay", provider: "Stripe", connected: Boolean(e.STRIPE_SECRET_KEY && e.STRIPE_PUBLISHABLE_KEY), mode: e.STRIPE_SECRET_KEY?.startsWith("sk_live") ? "live" : e.STRIPE_SECRET_KEY ? "test" : null },
        { key: "tamara", name: "Pay in 4", provider: "Tamara", connected: Boolean(e.TAMARA_API_TOKEN), mode: e.TAMARA_API_URL.includes("sandbox") ? "sandbox" : "live" },
        { key: "mail", name: "Invoice emails", provider: e.MAIL_PROVIDER === "smtp" ? `Zoho Mail (${e.SMTP_USER ?? ""})` : "Not sending (console)", connected: e.MAIL_PROVIDER === "smtp" },
        { key: "push", name: "Push notifications", provider: "Expo (APNs / FCM)", connected: e.PUSH_ENABLED },
        { key: "realtime", name: "Live tracking across servers", provider: "Redis", connected: Boolean(e.REDIS_URL) },
      ],
      reviewerLogin: { configured: e.OTP_REVIEW_PHONES.length > 0 && Boolean(e.OTP_REVIEW_CODE), phones: e.OTP_REVIEW_PHONES.length },
    };
  }
}
