import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { bookingAssignments, bookingCalls, bookings, users } from "../../db/schema.js";
import { COMPANY } from "../../config/company.js";
import { bridgeTwiml, type CallBridge } from "./masked-call.js";

/** Booking statuses during which the customer and the team can reach each other by phone. */
export const CALLABLE = ["assigned", "en_route", "arrived", "in_progress"] as const;

export interface VoiceOptions {
  publicUrl: string;
  /** The masked number everyone sees (E.164). */
  voiceNumber: string | undefined;
  /** Estimated USD per minute per call leg. */
  costPerMinUsd: number;
}

/**
 * Masked calling through Xtreme's number. Calls from the app ring the caller and connect them;
 * calls *to* the number (someone calling back) are matched to the caller's active job and
 * connected to the other side, or to the office. Every call is logged with its talk time.
 */
export class VoiceService {
  constructor(
    private readonly db: Database,
    private readonly bridge: CallBridge,
    private readonly opts: VoiceOptions,
  ) {}

  get enabled() {
    return this.bridge.enabled && !!this.opts.voiceNumber;
  }

  private endedUrl(logId: string) {
    return `${this.opts.publicUrl}/v1/voice/ended?log=${logId}`;
  }

  /** The other side of the caller's most relevant active job, if any. */
  async activeJobFor(userId: string, role: string) {
    const now = Date.now();
    const pick = <T extends { scheduledAt: Date }>(rows: T[]) => rows.sort((a, b) => Math.abs(a.scheduledAt.getTime() - now) - Math.abs(b.scheduledAt.getTime() - now))[0];
    if (role === "customer") {
      const rows = await this.db
        .select({ id: bookings.id, reference: bookings.reference, scheduledAt: bookings.scheduledAt })
        .from(bookings)
        .where(and(eq(bookings.customerId, userId), inArray(bookings.status, [...CALLABLE])));
      const b = pick(rows);
      if (!b) return null;
      const [lead] = await this.db
        .select({ id: users.id, phone: users.phone })
        .from(bookingAssignments)
        .innerJoin(users, eq(users.id, bookingAssignments.staffId))
        .where(eq(bookingAssignments.bookingId, b.id))
        .orderBy(desc(bookingAssignments.isLead))
        .limit(1);
      return lead?.phone ? { bookingId: b.id, reference: b.reference, otherId: lead.id, otherPhone: lead.phone, otherRole: "staff" as const } : null;
    }
    if (role === "staff") {
      const rows = await this.db
        .select({ id: bookings.id, reference: bookings.reference, scheduledAt: bookings.scheduledAt, customerId: bookings.customerId })
        .from(bookingAssignments)
        .innerJoin(bookings, eq(bookings.id, bookingAssignments.bookingId))
        .where(and(eq(bookingAssignments.staffId, userId), inArray(bookings.status, [...CALLABLE])));
      const b = pick(rows);
      if (!b) return null;
      const [customer] = await this.db.select({ phone: users.phone }).from(users).where(eq(users.id, b.customerId)).limit(1);
      return customer?.phone ? { bookingId: b.id, reference: b.reference, otherId: b.customerId, otherPhone: customer.phone, otherRole: "customer" as const } : null;
    }
    return null;
  }

  /** From the app: ring the caller from the masked number, then connect them to `calleePhone`. */
  async startFromApp(input: { bookingId: string; reference: string; callerId: string; callerRole: string; callerPhone: string; calleePhone: string; calleeRole: "customer" | "staff" }) {
    const [log] = await this.db.insert(bookingCalls).values({ bookingId: input.bookingId, callerId: input.callerId, callerRole: input.callerRole, kind: "app" }).returning();
    const intro = input.calleeRole === "staff" ? `Connecting you to your Xtreme team for booking ${input.reference}.` : `Connecting you to the customer for booking ${input.reference}.`;
    const twiml = bridgeTwiml({ intro, callee: input.calleePhone, callerId: this.opts.voiceNumber!, action: this.endedUrl(log!.id) });
    const { sid } = await this.bridge.connect(input.callerPhone, twiml);
    if (sid) await this.db.update(bookingCalls).set({ twilioSid: sid }).where(eq(bookingCalls.id, log!.id));
    return log!.id;
  }

  /** Someone called the masked number: connect them to their active job's other side, or the office. */
  async inbound(from: string, callSid: string | undefined) {
    const [caller] = from ? await this.db.select({ id: users.id, role: users.role }).from(users).where(and(eq(users.phone, from), isNull(users.deletedAt))).limit(1) : [];
    const job = caller ? await this.activeJobFor(caller.id, caller.role) : null;
    const [log] = await this.db
      .insert(bookingCalls)
      .values({ bookingId: job?.bookingId ?? null, callerId: caller?.id ?? null, callerRole: caller?.role ?? "unknown", kind: "callback", toOffice: !job, twilioSid: callSid ?? null })
      .onConflictDoNothing()
      .returning();
    const action = log ? this.endedUrl(log.id) : undefined;
    if (job && this.opts.voiceNumber) {
      const intro = job.otherRole === "staff" ? `Connecting you to your Xtreme team for booking ${job.reference}.` : `Connecting you to the customer for booking ${job.reference}.`;
      return bridgeTwiml({ intro, callee: job.otherPhone, callerId: this.opts.voiceNumber, action });
    }
    return bridgeTwiml({ intro: "Thank you for calling Xtreme Cleaning. Connecting you to our team.", callee: COMPANY.phone, callerId: this.opts.voiceNumber ?? COMPANY.phone, action });
  }

  /** Twilio reports the connected call's talk time when it ends. */
  async ended(logId: string, durationSeconds: number) {
    await this.db
      .update(bookingCalls)
      .set({ durationSeconds: Math.max(0, Math.round(durationSeconds)), endedAt: new Date() })
      .where(and(eq(bookingCalls.id, logId), isNull(bookingCalls.endedAt)));
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
  }

  /** Calls, talk minutes and estimated cost for the dashboard (two legs per bridged call). */
  async summary(days = 30) {
    const since = new Date(Date.now() - days * 86_400_000);
    const [row] = await this.db
      .select({
        calls: sql<number>`count(*) filter (where ${bookingCalls.kind} <> 'voip')::int`,
        callbacks: sql<number>`count(*) filter (where ${bookingCalls.kind} = 'callback')::int`,
        toOffice: sql<number>`count(*) filter (where ${bookingCalls.toOffice})::int`,
        seconds: sql<number>`coalesce(sum(${bookingCalls.durationSeconds}) filter (where ${bookingCalls.kind} <> 'voip'), 0)::int`,
        inAppCalls: sql<number>`count(*) filter (where ${bookingCalls.kind} = 'voip')::int`,
        inAppAnswered: sql<number>`count(*) filter (where ${bookingCalls.kind} = 'voip' and ${bookingCalls.answeredAt} is not null)::int`,
        inAppSeconds: sql<number>`coalesce(sum(${bookingCalls.durationSeconds}) filter (where ${bookingCalls.kind} = 'voip'), 0)::int`,
      })
      .from(bookingCalls)
      .where(gte(bookingCalls.createdAt, since));
    const minutes = Math.round(((row?.seconds ?? 0) / 60) * 10) / 10;
    return {
      days,
      enabled: this.enabled,
      maskedNumber: this.opts.voiceNumber ?? null,
      calls: row?.calls ?? 0,
      callbacks: row?.callbacks ?? 0,
      toOffice: row?.toOffice ?? 0,
      minutes,
      estimatedCostUsd: Math.round(minutes * 2 * this.opts.costPerMinUsd * 100) / 100,
      costPerMinUsd: this.opts.costPerMinUsd,
      // In-app calls (free; only TURN relay data if configured).
      inApp: {
        calls: row?.inAppCalls ?? 0,
        answered: row?.inAppAnswered ?? 0,
        minutes: Math.round(((row?.inAppSeconds ?? 0) / 60) * 10) / 10,
      },
    };
  }
}

