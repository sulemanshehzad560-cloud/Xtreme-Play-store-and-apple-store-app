import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

// ---------------------------------------------------------------- enums

export const userRole = pgEnum("user_role", ["customer", "staff", "admin"]);
export const authProvider = pgEnum("auth_provider", ["phone", "google", "facebook", "apple"]);
export const staffStatus = pgEnum("staff_status", ["off_duty", "available", "en_route", "on_job", "on_break"]);
export const propertyType = pgEnum("property_type", ["apartment", "villa", "office"]);
export const bookingPlan = pgEnum("booking_plan", ["one_off", "amc"]);
export const pricingKind = pgEnum("pricing_kind", ["fixed", "inspection"]);
export const paymentMethod = pgEnum("payment_method", ["cash", "card_on_site", "bank_transfer"]);
export const bookingStatus = pgEnum("booking_status", [
  "requested", // customer placed it
  "confirmed", // office accepted the slot
  "assigned", // team assigned
  "en_route", // team driving to the customer
  "arrived",
  "in_progress",
  "completed",
  "cancelled",
]);
export const devicePlatform = pgEnum("device_platform", ["ios", "android", "web"]);

// ---------------------------------------------------------------- identity

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: userRole("role").notNull().default("customer"),
    fullName: text("full_name"),
    phone: text("phone"), // E.164
    phoneVerifiedAt: ts("phone_verified_at"),
    email: text("email"),
    avatarUrl: text("avatar_url"),
    locale: text("locale").notNull().default("en"),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    blockedAt: ts("blocked_at"),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_phone_unique").on(t.phone).where(sql`${t.deletedAt} is null`),
    index("users_email_idx").on(t.email),
  ],
);

/** One row per sign-in method. A user can link phone + Google + Facebook + Apple. */
export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: authProvider("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    email: text("email"),
    createdAt: createdAt(),
    lastUsedAt: ts("last_used_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("auth_identities_provider_subject").on(t.provider, t.providerUserId),
    index("auth_identities_user_idx").on(t.userId),
  ],
);

export const otpChallenges = pgTable(
  "otp_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: smallint("attempts").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
    consumedAt: ts("consumed_at"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("otp_challenges_phone_created_idx").on(t.phone, t.createdAt)],
);

/** Opaque rotating refresh tokens; only the SHA-256 hash is stored. */
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    rotatedAt: ts("rotated_at"),
    revokedAt: ts("revoked_at"),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("refresh_tokens_hash_unique").on(t.tokenHash),
    index("refresh_tokens_family_idx").on(t.familyId),
    index("refresh_tokens_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------- customers

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    area: text("area").notNull(),
    building: text("building"),
    unit: text("unit"),
    street: text("street"),
    notes: text("notes"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("addresses_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------- staff

export const staffProfiles = pgTable(
  "staff_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    employeeCode: text("employee_code").notNull(),
    displayName: text("display_name").notNull(),
    photoUrl: text("photo_url"),
    teamName: text("team_name"),
    skills: text("skills").array().notNull().default(sql`'{}'::text[]`),
    status: staffStatus("status").notNull().default("off_duty"),
    statusChangedAt: ts("status_changed_at").notNull().defaultNow(),
    active: boolean("active").notNull().default(true),
    lastLat: doublePrecision("last_lat"),
    lastLng: doublePrecision("last_lng"),
    lastHeading: doublePrecision("last_heading"),
    lastSpeed: doublePrecision("last_speed"),
    lastAccuracy: doublePrecision("last_accuracy"),
    lastLocationAt: ts("last_location_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("staff_employee_code_unique").on(t.employeeCode), index("staff_status_idx").on(t.status)],
);

export const locationPings = pgTable(
  "location_pings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    accuracy: doublePrecision("accuracy"),
    heading: doublePrecision("heading"),
    speed: doublePrecision("speed"),
    recordedAt: ts("recorded_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("location_pings_staff_time_idx").on(t.staffId, t.recordedAt),
    index("location_pings_booking_time_idx").on(t.bookingId, t.recordedAt),
  ],
);

// ---------------------------------------------------------------- bookings

export const bookingRefSeq = pgSequence("booking_ref_seq", { startWith: 100001 });

export interface AddressSnapshot {
  label: string;
  area: string;
  building: string | null;
  unit: string | null;
  street: string | null;
  notes: string | null;
}

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference")
      .notNull()
      .default(sql`'XT-' || nextval('booking_ref_seq')::text`),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id),
    serviceKey: text("service_key").notNull(),
    propertyType: propertyType("property_type").notNull(),
    propertySize: text("property_size").notNull(),
    plan: bookingPlan("plan").notNull().default("one_off"),
    pricing: pricingKind("pricing").notNull(),
    priceAed: integer("price_aed"),
    paymentMethod: paymentMethod("payment_method").notNull().default("cash"),
    status: bookingStatus("status").notNull().default("requested"),
    scheduledAt: ts("scheduled_at").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    addressId: uuid("address_id").references(() => addresses.id, { onDelete: "set null" }),
    address: jsonb("address").$type<AddressSnapshot>().notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    notes: text("notes"),
    idempotencyKey: text("idempotency_key"),
    cancelReason: text("cancel_reason"),
    completedAt: ts("completed_at"),
    cancelledAt: ts("cancelled_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bookings_reference_unique").on(t.reference),
    index("bookings_customer_created_idx").on(t.customerId, t.createdAt),
    index("bookings_status_scheduled_idx").on(t.status, t.scheduledAt),
    uniqueIndex("bookings_customer_idempotency_unique")
      .on(t.customerId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
  ],
);

export const bookingAssignments = pgTable(
  "booking_assignments",
  {
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => users.id),
    isLead: boolean("is_lead").notNull().default(false),
    assignedAt: ts("assigned_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.bookingId, t.staffId] }), index("booking_assignments_staff_idx").on(t.staffId)],
);

/** Append-only timeline of everything that happens to a booking. */
export const bookingEvents = pgTable(
  "booking_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    fromStatus: bookingStatus("from_status"),
    toStatus: bookingStatus("to_status"),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorRole: userRole("actor_role"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("booking_events_booking_idx").on(t.bookingId, t.createdAt)],
);

export const reviews = pgTable(
  "reviews",
  {
  bookingId: uuid("booking_id")
    .primaryKey()
    .references(() => bookings.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  rating: smallint("rating").notNull(),
  comment: text("comment"),
  createdAt: createdAt(),
  },
  (t) => [check("reviews_rating_range", sql`${t.rating} between 1 and 5`)],
);

// ---------------------------------------------------------------- notifications

export const pushTokens = pgTable(
  "push_tokens",
  {
    token: text("token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: devicePlatform("platform").notNull(),
    createdAt: createdAt(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  },
  (t) => [index("push_tokens_user_idx").on(t.userId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_created_idx").on(t.userId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type StaffProfile = typeof staffProfiles.$inferSelect;
export type BookingStatus = (typeof bookingStatus.enumValues)[number];
export type StaffStatus = (typeof staffStatus.enumValues)[number];
export type UserRole = (typeof userRole.enumValues)[number];
