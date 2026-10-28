import { sql } from "drizzle-orm";
import {
  bigserial,
  date,
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
export const propertyType = pgEnum("property_type", ["apartment", "villa", "office", "restaurant"]);
export const bookingFrequency = pgEnum("booking_frequency", ["one_time", "weekly", "biweekly"]);
export const supportSender = pgEnum("support_sender", ["customer", "bot", "staff"]);
export const bookingPlan = pgEnum("booking_plan", ["one_off", "amc"]);
export const pricingKind = pgEnum("pricing_kind", ["fixed", "inspection"]);
/** How the customer intends to pay. "card" and "tamara" are paid in the app. */
export const paymentMethod = pgEnum("payment_method", ["card", "tamara", "cash", "card_on_site", "bank_transfer"]);
/** Roll-up on the booking, derived from its payments. */
// "included": a visit covered by a paid subscription, so nothing to pay.
export const bookingPaymentStatus = pgEnum("booking_payment_status", ["unpaid", "pending", "paid", "partially_refunded", "refunded", "included"]);
export const subscriptionInterval = pgEnum("subscription_interval", ["monthly", "yearly"]);
/** pending_payment → active (paid period) → expired (period over, not renewed) / cancelled. */
export const subscriptionStatus = pgEnum("subscription_status", ["pending_payment", "active", "expired", "cancelled"]);
export const promotionKind = pgEnum("promotion_kind", ["percent", "fixed"]);
export const paymentProvider = pgEnum("payment_provider", ["stripe", "tamara", "ngenius"]);
export const paymentStatus = pgEnum("payment_status", [
  "pending", // created, customer has not finished paying
  "authorised", // money reserved (Tamara approved), not captured yet
  "captured", // money taken
  "failed",
  "cancelled",
  "partially_refunded",
  "refunded",
]);
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
    /** YYYY-MM-DD, asked when an account has no name (phone sign-in). */
    dateOfBirth: date("date_of_birth", { mode: "string" }),
    locale: text("locale").notNull().default("en"),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    stripeCustomerId: text("stripe_customer_id"),
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
    // HR / contact details, managed by admins in the dashboard.
    jobTitle: text("job_title"),
    email: text("email"),
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactPhone: text("emergency_contact_phone"),
    joinedOn: date("joined_on", { mode: "string" }),
    notes: text("notes"),
    skills: text("skills").array().notNull().default(sql`'{}'::text[]`),
    // App sign-in for staff: Staff ID (employee code) + a password the admin sets.
    passwordHash: text("password_hash"),
    passwordSetAt: ts("password_set_at"),
    failedLogins: smallint("failed_logins").notNull().default(0),
    lockedUntil: ts("locked_until"),
    // Push alert for every new customer order.
    notifyNewOrders: boolean("notify_new_orders").notNull().default(true),
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
    /** Regular cleaning can repeat weekly or every two weeks; each visit is its own booking. */
    frequency: bookingFrequency("frequency").notNull().default("one_time"),
    /** The visit this one follows in a repeating series. */
    repeatOfId: uuid("repeat_of_id"),
    pricing: pricingKind("pricing").notNull(),
    priceAed: integer("price_aed"),
    paymentMethod: paymentMethod("payment_method").notNull().default("cash"),
    paymentStatus: bookingPaymentStatus("payment_status").notNull().default("unpaid"),
    status: bookingStatus("status").notNull().default("requested"),
    scheduledAt: ts("scheduled_at").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    addressId: uuid("address_id").references(() => addresses.id, { onDelete: "set null" }),
    address: jsonb("address").$type<AddressSnapshot>().notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    notes: text("notes"),
    idempotencyKey: text("idempotency_key"),
    // Set for visits that belong to a subscription (the paid first visit of a period, or included visits).
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
    // Promotion applied to the price (the customer pays priceAed - discountAed). Recomputed until paid.
    discountAed: integer("discount_aed").notNull().default(0),
    promotionId: uuid("promotion_id").references(() => promotions.id, { onDelete: "set null" }),
    /** Promo code the customer entered for this booking, if any. */
    promoCode: text("promo_code"),
    cancelReason: text("cancel_reason"),
    completedAt: ts("completed_at"),
    // Tax invoice emailed to the customer (once, after the job is completed and paid).
    invoiceSentAt: ts("invoice_sent_at"),
    invoiceSentTo: text("invoice_sent_to"),
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

/**
 * Discounts the office runs from the dashboard. Automatic ones (e.g. "15% off your first
 * booking") apply by themselves; the rest need the customer to enter the code. A booking
 * gets the single best discount it qualifies for.
 */
export const promotions = pgTable(
  "promotions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** Upper-case code customers type. Null for automatic-only promotions. */
    code: text("code"),
    kind: promotionKind("kind").notNull(),
    /** Percent (1–100) or AED off. */
    value: integer("value").notNull(),
    autoApply: boolean("auto_apply").notNull().default(false),
    firstBookingOnly: boolean("first_booking_only").notNull().default(false),
    minOrderAed: integer("min_order_aed"),
    maxDiscountAed: integer("max_discount_aed"),
    /** Limits the promotion to these services. Null = every service. */
    serviceKeys: text("service_keys").array(),
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    usageLimit: integer("usage_limit"),
    usedCount: integer("used_count").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("promotions_code_unique").on(t.code).where(sql`${t.code} is not null`)],
);

/** Contract plans the office sells (e.g. "Home care: 4 regular cleans a month"). Prices are set by admins. */
export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  serviceKey: text("service_key").notNull(),
  visitsPerMonth: smallint("visits_per_month").notNull(),
  /** Null when the plan is not sold monthly / yearly. */
  priceMonthlyAed: integer("price_monthly_aed"),
  priceYearlyAed: integer("price_yearly_aed"),
  active: boolean("active").notNull().default(true),
  sortOrder: smallint("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id),
    planId: uuid("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),
    // Snapshot of the plan when bought, so later price edits do not change a running contract.
    planName: text("plan_name").notNull(),
    serviceKey: text("service_key").notNull(),
    interval: subscriptionInterval("interval").notNull(),
    priceAed: integer("price_aed").notNull(),
    visitsPerMonth: smallint("visits_per_month").notNull(),
    propertyType: propertyType("property_type").notNull(),
    propertySize: text("property_size").notNull(),
    status: subscriptionStatus("status").notNull().default("pending_payment"),
    currentPeriodStart: ts("current_period_start"),
    currentPeriodEnd: ts("current_period_end"),
    addressId: uuid("address_id").references(() => addresses.id, { onDelete: "set null" }),
    address: jsonb("address").$type<AddressSnapshot>().notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    notes: text("notes"),
    /** Dates the customer picked for the rest of the period; booked as included visits once paid. */
    plannedVisits: jsonb("planned_visits").$type<string[]>(),
    cancelledAt: ts("cancelled_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("subscriptions_reference_unique").on(t.reference), index("subscriptions_customer_idx").on(t.customerId, t.createdAt)],
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

// ---------------------------------------------------------------- payments

/** One attempt to pay for a booking. Amounts are in fils (AED minor units). */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id),
    provider: paymentProvider("provider").notNull(),
    status: paymentStatus("status").notNull().default("pending"),
    amountMinor: integer("amount_minor").notNull(),
    /** Part of amountMinor that is a payment-method fee (Tamara instalments), shown separately on the invoice. */
    feeMinor: integer("fee_minor").notNull().default(0),
    /** Part of feeMinor that is the flat service fee (the rest is the card or Tamara fee). */
    serviceFeeMinor: integer("service_fee_minor").notNull().default(0),
    refundedMinor: integer("refunded_minor").notNull().default(0),
    currency: text("currency").notNull().default("AED"),
    providerRef: text("provider_ref"),
    checkoutUrl: text("checkout_url"),
    instalments: smallint("instalments"),
    failureReason: text("failure_reason"),
    capturedAt: ts("captured_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("payments_booking_idx").on(t.bookingId),
    uniqueIndex("payments_provider_ref_unique").on(t.provider, t.providerRef),
    check("payments_refund_le_amount", sql`${t.refundedMinor} between 0 and ${t.amountMinor}`),
  ],
);

/** Webhook ids already handled, so a provider retry is processed once. */
export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    provider: paymentProvider("provider").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    receivedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.eventId] })],
);

// ---------------------------------------------------------------- administration

/** Who changed what in the back office (staff, admins, settings). */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt), index("audit_logs_target_idx").on(t.targetType, t.targetId)],
);

/** Settings editable from the dashboard without a code change (e.g. company contacts). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

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

/** Profile photos uploaded in the app (small JPEG/PNG/WebP, base64). Served only to signed-in users. */
export const userAvatars = pgTable("user_avatars", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  data: text("data").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** "Chat with us": one thread per customer, with instant automated answers and replies from the office. */
export const supportMessages = pgTable(
  "support_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sender: supportSender("sender").notNull(),
    /** Office user who replied (sender = staff). */
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    /** Customer messages: when the office read them. Office/bot messages: when the customer read them. */
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("support_messages_customer_created_idx").on(t.customerId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type PaymentStatus = (typeof paymentStatus.enumValues)[number];
export type Booking = typeof bookings.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Promotion = typeof promotions.$inferSelect;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type StaffProfile = typeof staffProfiles.$inferSelect;
export type BookingStatus = (typeof bookingStatus.enumValues)[number];
export type StaffStatus = (typeof staffStatus.enumValues)[number];
export type UserRole = (typeof userRole.enumValues)[number];
