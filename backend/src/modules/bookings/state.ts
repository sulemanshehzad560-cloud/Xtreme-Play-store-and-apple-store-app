import type { BookingStatus, StaffStatus, UserRole } from "../../db/schema.js";

/**
 * Who may move a booking from one status to the next. Anything not listed is refused.
 *
 *   requested ─► confirmed ─► assigned ─► en_route ─► arrived ─► in_progress ─► completed
 *       │            │            │           │           │
 *       └────────────┴────────────┴───────────┴───────────┴──► cancelled
 */
export const TRANSITIONS: Record<BookingStatus, Partial<Record<BookingStatus, readonly UserRole[]>>> = {
  requested: { confirmed: ["admin"], assigned: ["admin"], cancelled: ["customer", "admin"] },
  confirmed: { assigned: ["admin"], cancelled: ["customer", "admin"] },
  assigned: { assigned: ["admin"], confirmed: ["admin"], en_route: ["staff", "admin"], cancelled: ["customer", "admin"] },
  en_route: { arrived: ["staff", "admin"], cancelled: ["admin"] },
  arrived: { in_progress: ["staff", "admin"], cancelled: ["admin"] },
  in_progress: { completed: ["staff", "admin"] },
  completed: {},
  cancelled: {},
};

export function canTransition(from: BookingStatus, to: BookingStatus, role: UserRole): boolean {
  return TRANSITIONS[from][to]?.includes(role) ?? false;
}

/** Statuses during which the customer can see the team's live position. */
export const TRACKABLE: readonly BookingStatus[] = ["en_route", "arrived", "in_progress"];

export const ACTIVE: readonly BookingStatus[] = ["requested", "confirmed", "assigned", "en_route", "arrived", "in_progress"];

export const TERMINAL: readonly BookingStatus[] = ["completed", "cancelled"];

/** When the lead can quote an inspection-priced job on site. */
export const ON_SITE_QUOTE: readonly BookingStatus[] = ["en_route", "arrived", "in_progress"];

/** What the assigned team's status becomes when their job changes status. */
export function staffStatusFor(status: BookingStatus): StaffStatus | null {
  switch (status) {
    case "en_route":
      return "en_route";
    case "arrived":
    case "in_progress":
      return "on_job";
    case "completed":
    case "cancelled":
      return "available";
    default:
      return null;
  }
}
