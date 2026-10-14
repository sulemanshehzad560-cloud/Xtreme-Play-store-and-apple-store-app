import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { locationPings, staffProfiles, users, type StaffStatus } from "../../db/schema.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { distanceMeters, estimateEtaMinutes, etaMinutesForDistance, type LatLng } from "../../lib/geo.js";
import { rooms, type RealtimeHub } from "../tracking/realtime.js";
import type { BookingService } from "../bookings/booking.service.js";

export interface LocationPing {
  lat: number;
  lng: number;
  accuracy?: number | null | undefined;
  heading?: number | null | undefined;
  speed?: number | null | undefined;
  recordedAt?: Date | undefined;
}

export interface TrackingConfig {
  historyMinIntervalSeconds: number;
  etaSpeedKmh: number;
}

/** Staff can only report positions this fresh; older ones are ignored. */
const MAX_PING_AGE_MS = 10 * 60_000;
/** Pings this inaccurate (metres) are stored but do not move the live marker. */
const MAX_LIVE_ACCURACY_M = 200;
const NEARBY_RADIUS_M = 15_000;
const ON_DUTY: StaffStatus[] = ["available", "en_route", "on_job", "on_break"];

export class StaffService {
  private readonly lastStored = new Map<string, number>();

  constructor(
    private readonly db: Database,
    private readonly bookingsSvc: BookingService,
    private readonly hub: RealtimeHub,
    private readonly config: TrackingConfig,
  ) {}

  async profile(staffId: string) {
    const [row] = await this.db.select().from(staffProfiles).where(eq(staffProfiles.userId, staffId)).limit(1);
    if (!row) throw notFound("Staff profile");
    return row;
  }

  /** Staff go on/off duty or take a break. Job statuses come from the job itself. */
  async setDutyStatus(staffId: string, status: "available" | "on_break" | "off_duty") {
    const current = await this.bookingsSvc.currentJobFor(staffId);
    if (current && status !== "available") {
      throw conflict("job_in_progress", `Finish job ${current.reference} before going ${status === "off_duty" ? "off duty" : "on break"}`);
    }
    const [row] = await this.db
      .update(staffProfiles)
      .set({ status: current ? (current.status === "en_route" ? "en_route" : "on_job") : status, statusChangedAt: new Date() })
      .where(eq(staffProfiles.userId, staffId))
      .returning();
    if (!row) throw notFound("Staff profile");
    this.hub.emit(rooms.admins, "staff:status", { staffId, status: row.status, at: row.statusChangedAt.toISOString() });
    return row;
  }

  /**
   * Records a staff member's position. Positions are only accepted while on duty, are
   * relayed live to the customer whose job they are on, and are kept as a thinned-out
   * history (one point per interval) for the office and for disputes.
   */
  async ingest(staffId: string, pings: LocationPing[]): Promise<{ accepted: number }> {
    const profile = await this.profile(staffId);
    if (!profile.active) throw conflict("staff_inactive", "This staff account is inactive");
    if (profile.status === "off_duty") return { accepted: 0 };

    const now = Date.now();
    const valid = pings
      .map((p) => ({ ...p, at: p.recordedAt ? Math.min(p.recordedAt.getTime(), now) : now }))
      .filter((p) => now - p.at <= MAX_PING_AGE_MS)
      .sort((a, b) => a.at - b.at);
    if (valid.length === 0) return { accepted: 0 };

    const job = await this.bookingsSvc.currentJobFor(staffId);
    const toStore = [];
    let last = this.lastStored.get(staffId) ?? 0;
    for (const p of valid) {
      if (p.at - last >= this.config.historyMinIntervalSeconds * 1000) {
        toStore.push(p);
        last = p.at;
      }
    }
    if (toStore.length) {
      this.lastStored.set(staffId, last);
      await this.db.insert(locationPings).values(
        toStore.map((p) => ({
          staffId,
          bookingId: job?.id ?? null,
          lat: p.lat,
          lng: p.lng,
          accuracy: p.accuracy ?? null,
          heading: p.heading ?? null,
          speed: p.speed ?? null,
          recordedAt: new Date(p.at),
        })),
      );
    }

    const latest = [...valid].reverse().find((p) => p.accuracy == null || p.accuracy <= MAX_LIVE_ACCURACY_M);
    if (!latest) return { accepted: valid.length };
    const at = new Date(latest.at);
    // Only move forward in time; a late batch from a phone that was offline must not
    // pull the marker back.
    const moved = await this.db
      .update(staffProfiles)
      .set({
        lastLat: latest.lat,
        lastLng: latest.lng,
        lastHeading: latest.heading ?? null,
        lastSpeed: latest.speed ?? null,
        lastAccuracy: latest.accuracy ?? null,
        lastLocationAt: at,
      })
      .where(
        and(
          eq(staffProfiles.userId, staffId),
          sql`(${staffProfiles.lastLocationAt} is null or ${staffProfiles.lastLocationAt} < ${at})`,
        ),
      )
      .returning({ userId: staffProfiles.userId });

    if (moved.length) {
      const point = {
        staffId,
        lat: latest.lat,
        lng: latest.lng,
        heading: latest.heading ?? null,
        speed: latest.speed ?? null,
        at: at.toISOString(),
      };
      this.hub.emit(rooms.admins, "staff:location", { ...point, status: profile.status, bookingId: job?.id ?? null });
      if (job) {
        const etaMinutes =
          job.status === "en_route"
            ? estimateEtaMinutes(latest, { lat: job.lat, lng: job.lng }, this.config.etaSpeedKmh)
            : null;
        this.hub.emit(rooms.booking(job.id), "staff:location", { ...point, bookingId: job.id, etaMinutes });
      }
    }
    return { accepted: valid.length };
  }

  /**
   * The public "who's out there" summary on the home screen. Counts only: individual
   * staff positions are never shown to customers outside their own job.
   */
  async availability(near?: LatLng) {
    const rows = await this.db
      .select({
        status: staffProfiles.status,
        lat: staffProfiles.lastLat,
        lng: staffProfiles.lastLng,
        at: staffProfiles.lastLocationAt,
      })
      .from(staffProfiles)
      .innerJoin(users, eq(users.id, staffProfiles.userId))
      .where(and(eq(staffProfiles.active, true), isNull(users.deletedAt), isNull(users.blockedAt)));

    const counts = { onDuty: 0, available: 0, deployed: 0, onBreak: 0 };
    let nearestAvailableMeters: number | null = null;
    let nearbyAvailable = 0;
    for (const r of rows) {
      if (!ON_DUTY.includes(r.status)) continue;
      counts.onDuty++;
      if (r.status === "available") counts.available++;
      if (r.status === "en_route" || r.status === "on_job") counts.deployed++;
      if (r.status === "on_break") counts.onBreak++;
      if (near && r.status === "available" && r.lat != null && r.lng != null && r.at && Date.now() - r.at.getTime() < 30 * 60_000) {
        const d = distanceMeters(near, { lat: r.lat, lng: r.lng });
        if (d <= NEARBY_RADIUS_M) nearbyAvailable++;
        if (nearestAvailableMeters == null || d < nearestAvailableMeters) nearestAvailableMeters = d;
      }
    }
    return {
      ...counts,
      ...(near
        ? {
            nearbyAvailable,
            nearestEtaMinutes:
              nearestAvailableMeters == null
                ? null
                : etaMinutesForDistance(nearestAvailableMeters, this.config.etaSpeedKmh),
          }
        : {}),
      updatedAt: new Date().toISOString(),
    };
  }

  // ------------------------------------------------------------ admin

  async create(input: {
    phone: string;
    displayName: string;
    employeeCode: string;
    teamName?: string | undefined;
    skills: string[];
    photoUrl?: string | undefined;
  }) {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(users).where(and(eq(users.phone, input.phone), isNull(users.deletedAt))).limit(1);
      if (existing && existing.role !== "customer") throw conflict("phone_in_use", "This number already belongs to a staff or admin account");
      const user =
        existing ??
        (await tx.insert(users).values({ phone: input.phone, fullName: input.displayName, role: "staff" }).returning())[0]!;
      if (existing) await tx.update(users).set({ role: "staff", updatedAt: new Date() }).where(eq(users.id, existing.id));
      const [profile] = await tx
        .insert(staffProfiles)
        .values({
          userId: user.id,
          displayName: input.displayName,
          employeeCode: input.employeeCode,
          teamName: input.teamName ?? null,
          skills: input.skills,
          photoUrl: input.photoUrl ?? null,
        })
        .returning();
      return profile!;
    });
  }

  async update(
    staffId: string,
    patch: Partial<{ displayName: string; teamName: string | null; skills: string[]; photoUrl: string | null; active: boolean }>,
  ) {
    const [row] = await this.db
      .update(staffProfiles)
      .set({ ...patch, ...(patch.active === false ? { status: "off_duty" as const, statusChangedAt: new Date() } : {}) })
      .where(eq(staffProfiles.userId, staffId))
      .returning();
    if (!row) throw notFound("Staff member");
    return row;
  }

  async listForAdmin() {
    const rows = await this.db
      .select({ staff: staffProfiles, phone: users.phone })
      .from(staffProfiles)
      .innerJoin(users, eq(users.id, staffProfiles.userId))
      .where(isNull(users.deletedAt))
      .orderBy(staffProfiles.displayName);
    return Promise.all(
      rows.map(async ({ staff, phone }) => {
        const job = await this.bookingsSvc.currentJobFor(staff.userId);
        return { ...adminStaffView(staff), phone, currentBooking: job ? { id: job.id, reference: job.reference, status: job.status } : null };
      }),
    );
  }

  async history(staffId: string, from: Date, to: Date) {
    if (to.getTime() - from.getTime() > 7 * 86_400_000) throw badRequest("range_too_large", "Pick a range of 7 days or less");
    const rows = await this.db
      .select()
      .from(locationPings)
      .where(and(eq(locationPings.staffId, staffId), gte(locationPings.recordedAt, from), lte(locationPings.recordedAt, to)))
      .orderBy(desc(locationPings.recordedAt))
      .limit(5000);
    return rows.reverse().map((p) => ({
      lat: p.lat,
      lng: p.lng,
      accuracy: p.accuracy,
      speed: p.speed,
      bookingId: p.bookingId,
      at: p.recordedAt.toISOString(),
    }));
  }
}

export function adminStaffView(s: typeof staffProfiles.$inferSelect) {
  return {
    id: s.userId,
    displayName: s.displayName,
    employeeCode: s.employeeCode,
    teamName: s.teamName,
    photoUrl: s.photoUrl,
    skills: s.skills,
    status: s.status,
    active: s.active,
    statusChangedAt: s.statusChangedAt.toISOString(),
    location:
      s.lastLat != null && s.lastLng != null && s.lastLocationAt
        ? { lat: s.lastLat, lng: s.lastLng, heading: s.lastHeading, accuracy: s.lastAccuracy, at: s.lastLocationAt.toISOString() }
        : null,
  };
}
