// Demo mode (EXPO_PUBLIC_DEMO=1): an in-app stand-in for the API, so a test build can be
// clicked through end to end without a server. Bookings move through their statuses on a
// timer and the assigned team "drives" to the customer, to show live tracking.

import { OUTSIDE_ZONE_MESSAGE, inServiceZone } from "./serviceZone";
import type { Booking, BookingStatus, Session, StaffStatus, TeamMember, User } from "./types";

export const DEMO = process.env.EXPO_PUBLIC_DEMO === "1";
export const DEMO_STAFF_PHONE = "+971500000002";

type Json = Record<string, any>;

const PRICES: Record<string, Record<string, [number, number, number | null]>> = {
  apartment: { studio: [100, 300, 250], "1bhk": [120, 350, 325], "2bhk": [150, 450, 375], "3bhk": [190, 600, 425], "4bhk": [240, 850, 500] },
  villa: { "2bhk": [300, 1100, 850], "3bhk": [350, 1300, 1050], "4bhk": [450, 1600, 1200], "5bhk": [600, 1900, 1350], "6bhk": [850, 2300, 1575] },
  office: { small: [200, 600, null], medium: [320, 900, null], large: [500, 1400, null] },
  restaurant: { small: [0, 0, null], medium: [0, 0, null], large: [0, 0, null] },
};
const REGULAR_RATES: Record<string, { priceAed: number; minutes: number; cleaners: number }> = {
  studio: { priceAed: 90, minutes: 45, cleaners: 2 },
  "1bhk": { priceAed: 120, minutes: 60, cleaners: 2 },
  "2bhk": { priceAed: 150, minutes: 90, cleaners: 2 },
  "3bhk": { priceAed: 190, minutes: 120, cleaners: 3 },
  "4bhk": { priceAed: 240, minutes: 180, cleaners: 3 },
};
const chat: { id: string; sender: string; body: string; createdAt: string }[] = [];
const SIZE_LABELS: Record<string, string> = {
  studio: "Studio", "1bhk": "1 BHK", "2bhk": "2 BHK", "3bhk": "3 BHK", "4bhk": "4 BHK", "5bhk": "5 BHK", "6bhk": "6 BHK",
  small: "Small (up to 1,000 sq ft)", medium: "Medium (1,001–3,000 sq ft)", large: "Large (3,001–5,000 sq ft)",
};

const S = (key: string, name: string, tier: "regular" | "deep" | null, minutes: number, highlights: string[]) => ({
  key,
  name,
  nameAr: "",
  category: "cleaning",
  pricing: tier ? { kind: "tiered", tier } : { kind: "inspection" },
  durationMinutes: minutes,
  highlights,
  startingFromAed: tier === "regular" ? 90 : null,
  propertyTypes: key === "restaurant" ? ["restaurant"] : ["apartment", "villa", "office"],
  // Sample ratings for the demo build only; the live API reports real review averages.
  rating: ({ regular: 4.9, deep: 4.8, sofa: 4.8, carpet: 4.7, kitchen: 4.8, bathroom: 4.7 } as Record<string, number>)[key] ?? null,
  reviewCount: ({ regular: 214, deep: 187, sofa: 96, carpet: 73, kitchen: 58, bathroom: 41 } as Record<string, number>)[key] ?? 0,
});

const SERVICES = [
  S("regular", "Regular cleaning", "regular", 180, ["Trained, vetted cleaners", "All cleaning materials included free", "Weekly, bi-weekly or one-time visits", "Same trusted team every visit"]),
  S("deep", "Deep cleaning", null, 360, ["Appliances cleaned inside and out", "Kitchen degreased; bathrooms descaled and disinfected", "Inside wardrobes, cabinets and windows", "Price depends on the home: empty or occupied"]),
  S("sofa", "Sofa cleaning", null, 120, ["Deep extraction lifts dust and allergens", "Stain and odour treatment", "Fabric-safe products for every material", "Fast drying"]),
  S("mattress", "Mattress cleaning", null, 90, ["Deep vacuum and steam sanitising", "Removes dust mites and allergens", "Stain and odour treatment", "Both sides, any size"]),
  S("carpet", "Carpet cleaning", null, 120, ["Hot-water extraction for carpets and rugs", "Spot and stain treatment", "Refreshes colour and pile", "Fast drying"]),
  S("glass", "Glass & window cleaning", null, 150, ["Windows, glass doors and mirrors", "Frames, tracks and sills wiped", "Streak-free finish", "Inside and reachable outside panes"]),
  S("kitchen", "Kitchen cleaning", null, 180, ["Appliances cleaned inside and out", "Counters and cabinets wiped inside and out", "Grease removed from hob, hood and tiles", "Floor scrubbed and disinfected"]),
  S("bathroom", "Bathroom cleaning", null, 90, ["Limescale removed from taps, glass and tiles", "Toilet, basin and shower disinfected", "Grout and sealant cleaned", "Mirrors and fittings polished"]),
  S("balcony", "Balcony cleaning", null, 90, ["Dust and sand washed away", "Railings and glass panels cleaned", "Floor scrubbed and drained", "Outdoor furniture wiped"]),
  S("wardrobe", "Wardrobe cleaning", null, 90, ["Shelves, rails and drawers cleaned inside", "Dust and odours removed", "Doors and mirrors polished", "Clothes neatly put back"]),
  S("restaurant", "Restaurant cleaning", null, 240, ["Kitchen, hoods and equipment degreased", "Dining area, tables and seating cleaned", "Washrooms disinfected", "Out-of-hours visits to suit your opening times"]),
  S("cupboard", "Cupboard cleaning", null, 90, ["Kitchen and storage cupboards emptied and wiped", "Shelves and hinges degreased", "Food-safe products", "Items returned in order"]),
];

const COMPANY = {
  name: "Xtreme Facilities Management",
  phone: "+971503641714",
  phoneDisplay: "+971 50 364 1714",
  whatsapp: "https://wa.me/971503641714",
  email: "sales@xtreme-fmgroup.com",
  website: "https://www.xtreme-fmgroup.com",
  address: { line1: "Mazyad Offices T-1, Office 1102-4", city: "Abu Dhabi" },
  serviceAreas: ["Al Reem Island", "Al Raha Beach", "Yas Island", "Saadiyat Island", "Khalifa City", "Mohammed Bin Zayed City", "Al Reef", "Masdar City", "Corniche", "Al Khalidiyah", "Mussafah", "Al Shamkha", "Al Maryah Island"],
};

// ------------------------------------------------------------------ state

const TEAM: TeamMember[] = [
  { id: "staff-1", displayName: "Ahmed K.", photoUrl: null, teamName: "Gold Team", status: "available", isLead: true },
  { id: "staff-2", displayName: "Maria S.", photoUrl: null, teamName: "Gold Team", status: "available", isLead: false },
];

interface DemoBooking extends Omit<Booking, "status" | "team" | "trackable" | "canCancel" | "canReschedule" | "canPay"> {
  createdMs: number;
  cancelled: boolean;
  forcedStatus?: BookingStatus;
}

let user: User | null = null;
let staffStatus: StaffStatus = "off_duty";
const addresses: Json[] = [];
const bookings: DemoBooking[] = [];
const notifications: Json[] = [];
let seq = 100230;

// Subscriptions (demo): prices as the office would set them in the dashboard.
const PLANS = [
  { id: "plan-home", name: "Home care weekly", description: "A regular clean every week by the same team", service: { key: "regular", name: "Regular cleaning" }, visitsPerMonth: 4, priceMonthlyAed: 650, priceYearlyAed: 7000 },
  { id: "plan-deep", name: "Deep clean monthly", description: "A full deep clean every month, priority time slots", service: { key: "deep", name: "Deep cleaning" }, visitsPerMonth: 1, priceMonthlyAed: 420, priceYearlyAed: 4600 },
  { id: "plan-fabric", name: "Fresh fabrics", description: "Sofa and mattress care twice a month", service: { key: "sofa", name: "Sofa cleaning" }, visitsPerMonth: 2, priceMonthlyAed: null, priceYearlyAed: 3900 },
];
interface DemoSub {
  id: string;
  reference: string;
  plan: (typeof PLANS)[number];
  interval: "monthly" | "yearly";
  priceAed: number;
  address: Json;
  bookingIds: string[];
  chargeId: string;
  cancelled: boolean;
}
const subs: DemoSub[] = [];

const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => Date.now();

// Timeline of a demo booking, in seconds after it was placed.
const STEPS: [number, BookingStatus][] = [
  [0, "requested"],
  [6, "confirmed"],
  [12, "assigned"],
  [18, "en_route"],
  [78, "arrived"],
  [90, "in_progress"],
  [120, "completed"],
];
const DRIVE_START = 18;
const DRIVE_SECONDS = 60;

function statusOf(b: DemoBooking): BookingStatus {
  if (b.cancelled) return "cancelled";
  if (b.forcedStatus) return b.forcedStatus;
  const t = (now() - b.createdMs) / 1000;
  let s: BookingStatus = "requested";
  for (const [at, st] of STEPS) if (t >= at) s = st;
  return s;
}

function teamFor(status: BookingStatus): TeamMember[] {
  if (["requested", "confirmed", "cancelled"].includes(status)) return [];
  const st: StaffStatus = status === "en_route" ? "en_route" : status === "arrived" || status === "in_progress" ? "on_job" : "available";
  return TEAM.map((m) => ({ ...m, status: st }));
}

/** Demo promotions: 15% off the first booking (up to AED 150), or code XTREME10 for 10%. */
function demoDiscount(b: DemoBooking) {
  if (b.priceAed == null || b.paymentStatus === "included") return 0;
  if (b.paymentStatus !== "unpaid" && b.paymentStatus !== "pending") return (b as any).discountAed ?? 0;
  const first = !bookings.some((x) => x.id !== b.id && x.paymentStatus === "paid") ? Math.min(150, Math.floor(b.priceAed * 0.15)) : 0;
  const code = (b as any).promoCode === "XTREME10" ? Math.floor(b.priceAed * 0.1) : 0;
  return Math.max(first, code);
}

function view(b: DemoBooking): Booking {
  const status = statusOf(b);
  const discountAed = demoDiscount(b);
  const terminal = status === "completed" || status === "cancelled";
  const timeline = STEPS.filter(([at]) => (now() - b.createdMs) / 1000 >= at && !b.cancelled).map(([at, st]) => ({
    type: "status",
    to: st,
    at: new Date(b.createdMs + at * 1000).toISOString(),
  }));
  if (b.cancelled) timeline.push({ type: "status", to: "cancelled", at: new Date().toISOString() });
  return {
    ...(b as any),
    status,
    team: teamFor(status),
    trackable: ["en_route", "arrived", "in_progress"].includes(status),
    canCancel: ["requested", "confirmed", "assigned"].includes(status),
    canReschedule: ["requested", "confirmed"].includes(status),
    canPay: b.priceAed != null && b.paymentStatus === "unpaid" && status !== "cancelled",
    discountAed,
    amountDueAed: b.priceAed == null ? null : b.priceAed - discountAed,
    promoCode: (b as any).promoCode ?? null,
    awaitingPayment: status === "requested" && b.pricing === "fixed" && b.paymentStatus === "unpaid",
    timeline,
    customer: { fullName: user?.fullName ?? "Customer", phone: user?.phone ?? null },
  };
}

/** Van position: starts ~3.5 km north-west and drives to the address. */
function vanPosition(b: DemoBooking) {
  const t = Math.min(1, Math.max(0, ((now() - b.createdMs) / 1000 - DRIVE_START) / DRIVE_SECONDS));
  const start = { lat: b.address.lat + 0.026, lng: b.address.lng - 0.022 };
  const mid = { lat: b.address.lat + 0.004, lng: b.address.lng - 0.02 };
  // Two straight legs, like following a road.
  const p = t < 0.55 ? lerp(start, mid, t / 0.55) : lerp(mid, b.address, (t - 0.55) / 0.45);
  const heading = t < 0.55 ? 160 : 90;
  return { ...p, heading, remaining: 1 - t };
}

const lerp = (a: { lat: number; lng: number }, b: { lat: number; lng: number }, t: number) => ({
  lat: a.lat + (b.lat - a.lat) * t,
  lng: a.lng + (b.lng - a.lng) * t,
});

function seedHistory() {
  if (bookings.length) return;
  const past = now() - 9 * 86_400_000;
  bookings.push({
    id: uid(),
    reference: `XT-${seq++}`,
    service: { key: "regular", name: "Regular cleaning" },
    property: { type: "apartment", size: "2bhk" },
    priceAed: 150,
    pricing: "fixed",
    paymentMethod: "card",
    paymentStatus: "paid",
    scheduledAt: new Date(past).toISOString(),
    address: { label: "Home", area: "Al Reem Island", building: "Sky Tower", unit: "1204", lat: 24.4958, lng: 54.4035 },
    notes: null,
    review: { rating: 5 },
    createdMs: past - 3_600_000,
    cancelled: false,
    forcedStatus: "completed",
  });
}

function session(): Session {
  return { accessToken: "demo", refreshToken: "demo", user: user!, isNewUser: false };
}

function signIn(partial: Partial<User>): Session {
  user = {
    id: "demo-user",
    role: "customer",
    fullName: null,
    phone: null,
    phoneVerified: false,
    email: null,
    avatarUrl: null,
    locale: "en",
    signInMethods: [],
    ...partial,
  };
  seedHistory();
  return session();
}

function notify(title: string, body: string) {
  notifications.unshift({ id: uid(), title, body, read: false, createdAt: new Date().toISOString() });
}

class DemoError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function subView(sub: DemoSub) {
  const charge = bookings.find((b) => b.id === sub.chargeId);
  const paid = charge?.paymentStatus === "paid";
  const months = sub.interval === "monthly" ? 1 : 12;
  const start = charge ? new Date(charge.createdMs) : new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);
  const visits = sub.bookingIds.map((id) => bookings.find((b) => b.id === id)).filter(Boolean).map((b) => view(b!));
  const allowance = sub.plan.visitsPerMonth * months;
  const used = visits.filter((v) => v.status !== "cancelled").length;
  return {
    id: sub.id,
    reference: sub.reference,
    planName: sub.plan.name,
    service: sub.plan.service,
    interval: sub.interval,
    priceAed: sub.priceAed,
    visitsPerPeriod: allowance,
    visitsUsed: paid ? used : 0,
    visitsLeft: paid ? Math.max(0, allowance - used) : 0,
    status: sub.cancelled ? "cancelled" : paid ? "active" : "pending_payment",
    currentPeriodStart: paid ? start.toISOString() : null,
    currentPeriodEnd: paid ? end.toISOString() : null,
    address: sub.address,
    paymentBookingId: paid || sub.cancelled ? null : sub.chargeId,
    canBookVisit: paid && used < allowance,
    canRenew: paid,
    canCancel: !paid && !sub.cancelled,
    visits: visits.map((v) => ({ id: v.id, reference: v.reference, status: v.status, scheduledAt: v.scheduledAt, included: v.priceAed === 0 })),
  };
}

// ------------------------------------------------------------------ router

export async function demoApi(path: string, method: string, body: Json | undefined): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 250 + Math.random() * 300)); // feel like a network
  const [route, query = ""] = path.split("?");
  const q = Object.fromEntries(new URLSearchParams(query));
  const seg = route!.split("/").filter(Boolean);

  // auth
  if (route === "/auth/otp/request") return { phone: normalize(body!.phone), expiresIn: 300, resendIn: 30 };
  if (route === "/auth/otp/verify") {
    if (!/^\d{6}$/.test(body!.code)) throw new DemoError(400, "invalid_code", "Enter any 6 digits in demo mode");
    const phone = normalize(body!.phone);
    return signIn({
      phone,
      phoneVerified: true,
      fullName: body!.fullName ?? (phone === DEMO_STAFF_PHONE ? "Ahmed K." : "Sara Al Mansoori"),
      role: phone === DEMO_STAFF_PHONE ? "staff" : "customer",
      signInMethods: ["phone"],
    });
  }
  if (route === "/auth/staff/login") {
    if (!body!.staffId || String(body!.password ?? "").length < 4) throw new DemoError(401, "unauthorized", "Staff ID or password is incorrect");
    return signIn({ phone: DEMO_STAFF_PHONE, phoneVerified: true, fullName: "Ahmed K.", role: "staff", signInMethods: ["staff"] });
  }
  if (["/auth/google", "/auth/apple", "/auth/facebook"].includes(route!)) {
    const provider = route!.split("/")[2]!;
    return signIn({ fullName: body?.fullName ?? "Sara Al Mansoori", email: "sara@example.com", signInMethods: [provider] });
  }
  if (route === "/auth/logout" || route === "/auth/refresh") return session();

  // public
  if (route === "/company") return COMPANY;
  if (route === "/subscription-plans") return PLANS;
  if (route === "/catalog/services") {
    return {
      currency: "AED",
      vatIncluded: true,
      services: SERVICES,
      propertySizes: Object.fromEntries(Object.entries(PRICES).map(([t, sizes]) => [t, Object.keys(sizes).map((key) => ({ key, label: SIZE_LABELS[key] }))])),
      regularRates: REGULAR_RATES,
      payments: { tamaraFeePercent: 8, tamaraInstalments: 4 },
    };
  }
  if (route === "/catalog/quote") {
    const svc = SERVICES.find((s) => s.key === q.serviceKey);
    const row = PRICES[q.propertyType!]?.[q.propertySize!];
    if (!svc || !row) throw new DemoError(400, "invalid_quote", "Choose a property size");
    const rate = svc.key === "regular" && q.propertyType === "apartment" ? REGULAR_RATES[q.propertySize!] : undefined;
    if (!rate) return { priceAed: null, pricing: "inspection", label: "Our team visits, inspects and quotes on site", durationMinutes: null, cleaners: null };
    return { priceAed: rate.priceAed, pricing: "fixed", label: `AED ${rate.priceAed} per visit`, durationMinutes: rate.minutes, cleaners: rate.cleaners };
  }
  if (route === "/staff/availability") return { onDuty: 14, available: 6, deployed: 8, onBreak: 0, nearbyAvailable: 3, nearestEtaMinutes: 12 };

  if (!user) throw new DemoError(401, "unauthorized", "Sign in required");

  // chat
  if (route === "/me/support/unread") return { unread: 0 };
  if (route === "/me/support/messages" && method === "GET") return chat;
  if (route === "/me/support/messages" && method === "POST") {
    const now = new Date().toISOString();
    const text = String(body!.body);
    const answer = /material/i.test(text)
      ? "All cleaning materials and equipment are included free of cost."
      : /price|cost|how much/i.test(text)
        ? "Regular cleaning of apartments: Studio AED 90, 1 BHK AED 120, 2 BHK AED 150, 3 BHK AED 190, 4 BHK AED 240. Other services are priced on a site visit."
        : "Thanks for your message! Our team will reply here shortly.";
    const added = [
      { id: uid(), sender: "customer", body: text, createdAt: now },
      { id: uid(), sender: "bot", body: answer, createdAt: now },
    ];
    chat.push(...added);
    return added;
  }

  // me
  if (route === "/me" && method === "GET") return user;
  if (route === "/me/avatar" && method === "DELETE") return (user = { ...user, avatarUrl: null });
  if (route === "/me" && method === "PATCH") {
    user = {
      ...user,
      ...(body?.fullName ? { fullName: body.fullName } : {}),
      ...(body && "email" in body ? { email: body.email } : {}),
      ...(body?.dateOfBirth ? { dateOfBirth: body.dateOfBirth } : {}),
      ...(body && "avatarUrl" in body ? { avatarUrl: body.avatarUrl } : {}),
    };
    return user;
  }
  if (route === "/me" && method === "DELETE") {
    user = null;
    return undefined;
  }
  if (route === "/me/phone") {
    user = { ...user, phone: normalize(body!.phone), phoneVerified: true, signInMethods: [...new Set([...user.signInMethods, "phone"])] };
    return user;
  }
  if (seg[0] === "me" && seg[1] === "identities") {
    user = { ...user, signInMethods: [...new Set([...user.signInMethods, seg[2]!])] };
    return user;
  }
  if (route === "/me/addresses" && method === "GET") return addresses;
  if (route === "/me/addresses" && method === "POST") {
    if (!inServiceZone(body!.lat, body!.lng)) throw new DemoError(400, "outside_service_area", OUTSIDE_ZONE_MESSAGE);
    const a = { id: uid(), ...body, isDefault: addresses.length === 0 };
    addresses.push(a);
    return a;
  }
  if (seg[0] === "me" && seg[1] === "addresses" && seg[2]) {
    const i = addresses.findIndex((a) => a.id === seg[2]);
    if (i < 0) throw new DemoError(404, "not_found", "Address not found");
    if (method === "DELETE") {
      addresses.splice(i, 1);
      return undefined;
    }
    if (body?.isDefault) addresses.forEach((a) => (a.isDefault = false));
    Object.assign(addresses[i]!, body);
    return addresses[i];
  }
  if (route === "/me/push-tokens") return undefined;
  if (route === "/me/notifications") return notifications;

  // subscriptions
  if (route === "/me/subscriptions") return subs.filter((x) => !x.cancelled).map(subView);
  if (route === "/subscriptions" && method === "POST") {
    const plan = PLANS.find((p) => p.id === body!.planId)!;
    const priceAed = (body!.interval === "monthly" ? plan.priceMonthlyAed : plan.priceYearlyAed)!;
    const charge = (await demoApi("/bookings", "POST", { ...body!, serviceKey: plan.service.key, scheduledAt: body!.firstVisitAt })) as Json;
    const b = bookings.find((x) => x.id === charge.id)!;
    b.priceAed = priceAed;
    b.pricing = "fixed";
    const sub: DemoSub = { id: uid(), reference: `SUB-${seq++}`, plan, interval: body!.interval, priceAed, address: b.address, bookingIds: [b.id], chargeId: b.id, cancelled: false };
    b.subscriptionId = sub.id;
    subs.unshift(sub);
    return { subscription: subView(sub), paymentBookingId: b.id };
  }
  if (seg[0] === "subscriptions" && seg[1]) {
    const sub = subs.find((x) => x.id === seg[1]);
    if (!sub) throw new DemoError(404, "not_found", "Subscription not found");
    if (seg[2] === "cancel") {
      sub.cancelled = true;
      return subView(sub);
    }
    if (seg[2] === "visits") {
      const v = (await demoApi("/bookings", "POST", { serviceKey: sub.plan.service.key, propertyType: "apartment", propertySize: "2bhk", scheduledAt: body!.scheduledAt, address: sub.address })) as Json;
      const b = bookings.find((x) => x.id === v.id)!;
      b.priceAed = 0;
      b.paymentStatus = "included";
      b.subscriptionId = sub.id;
      sub.bookingIds.push(b.id);
      return view(b);
    }
    return subView(sub);
  }

  // bookings
  if (route === "/bookings" && method === "POST") {
    if (!user.phone) throw new DemoError(400, "phone_required", "Add and verify your mobile number so the team can reach you");
    const svc = SERVICES.find((s) => s.key === body!.serviceKey)!;
    const quote = (await demoApi(`/catalog/quote?serviceKey=${svc.key}&propertyType=${body!.propertyType}&propertySize=${body!.propertySize}&plan=${body!.plan ?? "one_off"}`, "GET", undefined)) as Json;
    const addr = body!.addressId ? addresses.find((a) => a.id === body!.addressId) : body!.address;
    if (addr && !inServiceZone(addr.lat, addr.lng)) throw new DemoError(400, "outside_service_area", OUTSIDE_ZONE_MESSAGE);
    const b: DemoBooking = {
      id: uid(),
      reference: `XT-${seq++}`,
      service: { key: svc.key, name: svc.name },
      property: { type: body!.propertyType, size: body!.propertySize },
      priceAed: quote.priceAed,
      pricing: quote.pricing,
      paymentMethod: body!.paymentMethod ?? "card",
      paymentStatus: "unpaid",
      scheduledAt: body!.scheduledAt,
      address: { label: addr.label, area: addr.area, building: addr.building ?? null, unit: addr.unit ?? null, lat: addr.lat, lng: addr.lng },
      notes: body!.notes ?? null,
      review: null,
      createdMs: now(),
      cancelled: false,
    };
    bookings.unshift(b);
    notify("Booking received", `${b.reference} · ${svc.name}. In demo mode it will progress on its own.`);
    return view(b);
  }
  if (route === "/bookings" && method === "GET") {
    const all = bookings.map(view);
    const active = (s: BookingStatus) => !["completed", "cancelled"].includes(s);
    const list = q.scope === "active" ? all.filter((b) => active(b.status)) : q.scope === "past" ? all.filter((b) => !active(b.status)) : all;
    return list.slice(0, Number(q.limit ?? 50));
  }
  if (seg[0] === "bookings" && seg[1]) {
    const b = bookings.find((x) => x.id === seg[1]);
    if (!b) throw new DemoError(404, "not_found", "Booking not found");
    const action = seg[2];
    if (!action && method === "PATCH") {
      if (body?.scheduledAt) b.scheduledAt = body.scheduledAt;
      if (body?.notes !== undefined) b.notes = body.notes;
      notify("Booking rescheduled", `${b.reference} moved to your new time.`);
      return view(b);
    }
    if (!action) return view(b);
    if (action === "cancel") {
      b.cancelled = true;
      if (b.paymentStatus === "paid") b.paymentStatus = "refunded";
      return view(b);
    }
    if (action === "review") {
      b.review = { rating: body!.rating };
      return view(b);
    }
    if (action === "tracking") return tracking(b);
    if (action === "promo") {
      if (method === "DELETE") (b as any).promoCode = null;
      else {
        const code = String(body!.code).trim().toUpperCase();
        if (code !== "XTREME10") throw new DemoError(400, "invalid_code", "This code is not valid");
        (b as any).promoCode = code;
      }
      return { ...view(b), promoMessage: "Code applied" };
    }
    if (action === "payment-options") {
      const discountAed = demoDiscount(b);
      const total = b.priceAed! - discountAed;
      return {
        bookingId: b.id,
        promoCode: (b as any).promoCode ?? null,
        amount: { priceAed: b.priceAed, discountAed, totalAed: total, vatAed: Math.round((total - total / 1.05) * 100) / 100, vatIncluded: true, currency: "AED" },
        methods: [
          { method: "card", available: true, label: "Credit / debit card, Apple Pay or Google Pay", feeAed: 0, totalAed: total },
          { method: "tamara", available: true, label: "Pay in 4 with Tamara", feePercent: 8, feeAed: Math.round(total * 8) / 100, totalAed: Math.round(total * 108) / 100, instalments: 4 },
        ],
      };
    }
    if (action === "invoice") {
      if (b.paymentStatus !== "paid" || b.priceAed == null) throw new DemoError(409, "not_paid", "The invoice is available once the booking is paid");
      const vat = Math.round((b.priceAed - b.priceAed / 1.05) * 100) / 100;
      return {
        invoiceNumber: `INV-${b.reference.replace(/^XT-/, "")}`,
        issuedAt: new Date().toISOString(),
        bookingReference: b.reference,
        seller: { name: COMPANY.name, trn: null, address: `${COMPANY.address.line1}, ${COMPANY.address.city}, United Arab Emirates`, phone: COMPANY.phoneDisplay, email: COMPANY.email },
        customer: { name: user?.fullName ?? null, phone: user?.phone ?? null, email: user?.email ?? null, address: [b.address.unit, b.address.building, b.address.area].filter(Boolean).join(", ") },
        lines: [{ description: `${b.service.name} (${b.property.type}, ${b.property.size.toUpperCase()})`, serviceDate: b.scheduledAt, amountAed: b.priceAed }],
        vatRate: 0.05,
        subtotalAed: Math.round((b.priceAed - vat) * 100) / 100,
        vatAed: vat,
        totalAed: b.priceAed,
        refundedAed: 0,
        payment: { method: b.paymentMethod === "tamara" ? "Tamara" : "Card", paidAt: new Date().toISOString() },
      };
    }
    if (action === "payments" && method === "POST") return { paymentId: `pay_${b.id}`, provider: body!.method, demo: true };
  }
  if (seg[0] === "payments" && seg[2] === "sync") {
    const b = bookings.find((x) => `pay_${x.id}` === seg[1]);
    if (b) {
      const discount = demoDiscount(b);
      (b as any).discountAed = discount;
      b.paymentStatus = "paid";
      notify("Payment received", `Thank you! AED ${b.priceAed! - discount} received for ${b.reference}.`);
    }
    return { status: "captured" };
  }

  // staff
  if (route === "/staff/me") return { displayName: user.fullName ?? "Team member", status: staffStatus, teamName: "Gold Team" };
  if (route === "/staff/me/status") {
    staffStatus = body!.status;
    return { displayName: user.fullName, status: staffStatus, teamName: "Gold Team" };
  }
  if (route === "/staff/me/location") return { accepted: body?.pings?.length ?? 0 };
  if (route === "/staff/me/jobs") return bookings.map(view).filter((b) => !["completed", "cancelled"].includes(b.status));
  if (seg[0] === "staff" && seg[1] === "jobs") {
    const b = bookings.find((x) => x.id === seg[2])!;
    b.forcedStatus = body!.status;
    return view(b);
  }

  throw new DemoError(404, "route_not_found", `${method} ${route} is not available in demo mode`);
}

export function tracking(b: DemoBooking) {
  const v = view(b);
  const live = v.trackable;
  const pos = vanPosition(b);
  return {
    bookingId: b.id,
    reference: b.reference,
    status: v.status,
    live,
    destination: { lat: b.address.lat, lng: b.address.lng },
    team: v.team,
    location: live ? { lat: v.status === "en_route" ? pos.lat : b.address.lat, lng: v.status === "en_route" ? pos.lng : b.address.lng, heading: pos.heading, at: new Date().toISOString(), stale: false } : null,
    etaMinutes: v.status === "en_route" ? Math.max(1, Math.round(pos.remaining * 14)) : null,
  };
}

/** Lets the tracking screen poll the simulated van in demo mode. */
export function demoTracking(bookingId: string) {
  const b = bookings.find((x) => x.id === bookingId);
  return b ? tracking(b) : null;
}

export { DemoError };

function normalize(phone: string) {
  const digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("971")) return `+${digits}`;
  if (digits.startsWith("0")) return `+971${digits.slice(1)}`;
  return `+971${digits}`;
}
