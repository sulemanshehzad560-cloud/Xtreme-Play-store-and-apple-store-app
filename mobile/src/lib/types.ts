export type Role = "customer" | "staff" | "admin";
export type BookingStatus = "requested" | "confirmed" | "assigned" | "en_route" | "arrived" | "in_progress" | "completed" | "cancelled";
export type StaffStatus = "off_duty" | "available" | "en_route" | "on_job" | "on_break";

export interface User {
  id: string;
  role: Role;
  fullName: string | null;
  phone: string | null;
  phoneVerified: boolean;
  email: string | null;
  avatarUrl: string | null;
  locale: string;
  signInMethods: string[];
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
  isNewUser?: boolean;
}

export interface Service {
  key: string;
  name: string;
  nameAr: string;
  category: string;
  pricing: { kind: "tiered"; tier: string } | { kind: "inspection" };
  durationMinutes: number;
  highlights: string[];
  startingFromAed: number | null;
  /** Average customer rating from completed jobs; null until reviewed. */
  rating: number | null;
  reviewCount: number;
}

export interface TeamMember {
  id: string;
  displayName: string;
  photoUrl: string | null;
  teamName: string | null;
  status: StaffStatus;
  isLead: boolean;
}

export interface Booking {
  id: string;
  reference: string;
  status: BookingStatus;
  service: { key: string; name: string };
  property: { type: string; size: string };
  priceAed: number | null;
  pricing: "fixed" | "inspection";
  paymentMethod: string;
  paymentStatus: "unpaid" | "pending" | "paid" | "partially_refunded" | "refunded" | "included";
  subscriptionId?: string | null;
  canPay: boolean;
  canCancel: boolean;
  canReschedule: boolean;
  scheduledAt: string;
  address: { label: string; area: string; building: string | null; unit: string | null; lat: number; lng: number };
  notes: string | null;
  team: TeamMember[];
  trackable: boolean;
  review: { rating: number } | null;
  customer?: { fullName: string | null; phone: string | null } | null;
  timeline?: { type: string; to: BookingStatus | null; at: string }[];
}

export interface Tracking {
  status: BookingStatus;
  live: boolean;
  destination: { lat: number; lng: number };
  team: TeamMember[];
  location: { lat: number; lng: number; heading: number | null; at: string; stale: boolean } | null;
  etaMinutes: number | null;
}

export interface Company {
  name: string;
  phone: string;
  phoneDisplay: string;
  whatsapp: string;
  email: string;
  website: string;
  address: { line1: string; city: string };
  serviceAreas: string[];
}

export type Interval = "monthly" | "yearly";

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  service: { key: string; name: string };
  visitsPerMonth: number;
  priceMonthlyAed: number | null;
  priceYearlyAed: number | null;
}

export interface Subscription {
  id: string;
  reference: string;
  planName: string;
  service: { key: string; name: string };
  interval: Interval;
  priceAed: number;
  visitsPerPeriod: number;
  visitsUsed: number;
  visitsLeft: number;
  status: "pending_payment" | "active" | "expired" | "cancelled";
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  address: { label: string; area: string; building: string | null; unit: string | null };
  paymentBookingId: string | null;
  canBookVisit: boolean;
  canRenew: boolean;
  canCancel: boolean;
  visits: { id: string; reference: string; status: BookingStatus; scheduledAt: string; included: boolean }[];
}
