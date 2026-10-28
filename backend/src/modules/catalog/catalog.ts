// Service catalog and price list (AED per visit, VAT included), matching the Xtreme price list.
// Kept in code so prices are versioned and reviewed; the booking stores a price snapshot.

export type PropertyType = "apartment" | "villa" | "office" | "restaurant";

/** Sizes customers can pick for each property type. */
export const PROPERTY_SIZES: Record<PropertyType, string[]> = {
  apartment: ["studio", "1bhk", "2bhk", "3bhk", "4bhk"],
  villa: ["2bhk", "3bhk", "4bhk", "5bhk", "6bhk"],
  office: ["small", "medium", "large"],
  restaurant: ["small", "medium", "large"],
};

/**
 * Regular cleaning of apartments: fixed price per visit (AED, VAT included), time on site and
 * team size. Cleaning materials are always included free. Every other service, and regular
 * cleaning of villas, offices and restaurants, is priced by our team on a site visit.
 */
export const REGULAR_RATES: Record<string, { priceAed: number; minutes: number; cleaners: number }> = {
  studio: { priceAed: 90, minutes: 45, cleaners: 2 },
  "1bhk": { priceAed: 120, minutes: 60, cleaners: 2 },
  "2bhk": { priceAed: 150, minutes: 90, cleaners: 2 },
  "3bhk": { priceAed: 190, minutes: 120, cleaners: 3 },
  "4bhk": { priceAed: 240, minutes: 180, cleaners: 3 },
};

export const SIZE_LABELS: Record<string, string> = {
  studio: "Studio",
  "1bhk": "1 BHK",
  "2bhk": "2 BHK",
  "3bhk": "3 BHK",
  "4bhk": "4 BHK",
  "5bhk": "5 BHK",
  "6bhk": "6 BHK",
  small: "Small (up to 1,000 sq ft)",
  medium: "Medium (1,001–3,000 sq ft)",
  large: "Large (3,001–5,000 sq ft)",
};

export interface CatalogService {
  key: string;
  name: string;
  nameAr: string;
  category: "cleaning" | "technical" | "staffing" | "facilities";
  /** "tiered": fixed price for apartments from REGULAR_RATES; "inspection": quoted by our team on a site visit. */
  pricing: { kind: "tiered" } | { kind: "inspection" };
  durationMinutes: number;
  highlights: string[];
  /** Property types this service is offered for. Defaults to homes and offices. */
  propertyTypes?: PropertyType[];
}

const MATERIALS = "All cleaning materials included free";

export const SERVICES: CatalogService[] = [
  {
    key: "regular",
    name: "Regular cleaning",
    nameAr: "التنظيف الدوري",
    category: "cleaning",
    pricing: { kind: "tiered" },
    durationMinutes: 90,
    highlights: ["Trained, vetted cleaners", MATERIALS, "Weekly, bi-weekly or one-time visits", "Same trusted team every visit"],
  },
  {
    key: "deep",
    name: "Deep cleaning",
    nameAr: "التنظيف العميق",
    category: "cleaning",
    pricing: { kind: "inspection" },
    durationMinutes: 360,
    highlights: ["Appliances cleaned inside and out", "Kitchen degreased; bathrooms descaled and disinfected", "Inside wardrobes, cabinets and windows", "Price depends on the home: empty or occupied", MATERIALS],
  },
  {
    key: "sofa",
    name: "Sofa cleaning",
    nameAr: "تنظيف الكنب",
    category: "cleaning",
    pricing: { kind: "inspection" },
    durationMinutes: 120,
    highlights: ["Deep extraction lifts dust and allergens", "Stain and odour treatment", "Fabric-safe products for every material", "Fast drying"],
  },
  {
    key: "mattress",
    name: "Mattress cleaning",
    nameAr: "تنظيف المراتب",
    category: "cleaning",
    pricing: { kind: "inspection" },
    durationMinutes: 90,
    highlights: ["Deep vacuum and steam sanitising", "Removes dust mites and allergens", "Stain and odour treatment", "Both sides, any size"],
  },
  {
    key: "carpet",
    name: "Carpet cleaning",
    nameAr: "تنظيف السجاد",
    category: "cleaning",
    pricing: { kind: "inspection" },
    durationMinutes: 120,
    highlights: ["Hot-water extraction for carpets and rugs", "Spot and stain treatment", "Refreshes colour and pile", "Fast drying"],
  },
  {
    key: "glass",
    name: "Glass & window cleaning",
    nameAr: "تنظيف الزجاج والنوافذ",
    category: "cleaning",
    pricing: { kind: "inspection" },
    durationMinutes: 150,
    highlights: ["Windows, glass doors and mirrors", "Frames, tracks and sills wiped", "Streak-free finish", "Inside and reachable outside panes"],
  },
  {
    key: "kitchen",
    name: "Kitchen cleaning",
    nameAr: "تنظيف المطبخ",
    category: "cleaning",
    pricing: { kind: "inspection" },
    durationMinutes: 180,
    highlights: ["Appliances cleaned inside and out", "Counters and cabinets wiped inside and out", "Grease removed from hob, hood and tiles", "Floor scrubbed and disinfected", MATERIALS],
  },
  {
    key: "bathroom",
    name: "Bathroom cleaning",
    nameAr: "تنظيف الحمامات",
    category: "cleaning",
    pricing: { kind: "inspection" },
    durationMinutes: 90,
    highlights: ["Limescale removed from taps, glass and tiles", "Toilet, basin and shower disinfected", "Grout and sealant cleaned", "Mirrors and fittings polished"],
  },
  {
    key: "balcony",
    name: "Balcony cleaning",
    nameAr: "تنظيف الشرفة",
    category: "cleaning",
    pricing: { kind: "inspection" },
    durationMinutes: 90,
    highlights: ["Dust and sand washed away", "Railings and glass panels cleaned", "Floor scrubbed and drained", "Outdoor furniture wiped"],
  },
  {
    key: "wardrobe",
    name: "Wardrobe cleaning",
    nameAr: "تنظيف خزائن الملابس",
    category: "cleaning",
    pricing: { kind: "inspection" },
    durationMinutes: 90,
    highlights: ["Shelves, rails and drawers cleaned inside", "Dust and odours removed", "Doors and mirrors polished", "Clothes neatly put back"],
  },
  {
    key: "restaurant",
    name: "Restaurant cleaning",
    nameAr: "تنظيف المطاعم",
    category: "cleaning",
    pricing: { kind: "inspection" },
    durationMinutes: 240,
    highlights: ["Kitchen, hoods and equipment degreased", "Dining area, tables and seating cleaned", "Washrooms disinfected", "Out-of-hours visits to suit your opening times", MATERIALS],
    propertyTypes: ["restaurant"],
  },
  {
    key: "cupboard",
    name: "Cupboard cleaning",
    nameAr: "تنظيف الخزائن",
    category: "cleaning",
    pricing: { kind: "inspection" },
    durationMinutes: 90,
    highlights: ["Kitchen and storage cupboards emptied and wiped", "Shelves and hinges degreased", "Food-safe products", "Items returned in order"],
  },
];

/** Services no longer offered. Kept so older bookings still show a proper name. */
const RETIRED_NAMES: Record<string, string> = {
  move: "Move-in / move-out cleaning",
  postcon: "Post-construction cleaning",
  kitbath: "Kitchen & bathroom cleaning",
  ac: "AC duct cleaning",
  pest: "Pest control",
  tank: "Water tank cleaning",
  facade: "Facade & window cleaning",
  kitchenex: "Kitchen exhaust & grease trap",
  laundry: "Bedroom laundry",
  drapery: "Curtain & drapery care",
  helper: "Nanny & house helper",
  fm: "Facilities management",
  disinfect: "Disinfection",
};

const byKey = new Map(SERVICES.map((s) => [s.key, s]));

/** A service customers can book today. */
export function findService(key: string): CatalogService | undefined {
  return byKey.get(key);
}

/** Display name for any service key, including retired ones on older bookings. */
export function serviceName(key: string): string {
  return byKey.get(key)?.name ?? RETIRED_NAMES[key] ?? "Cleaning service";
}

export interface Quote {
  priceAed: number | null;
  pricing: "fixed" | "inspection";
  label: string;
  /** Time on site and team size, when known up front (regular cleaning of apartments). */
  durationMinutes: number | null;
  cleaners: number | null;
}

const DEFAULT_TYPES: PropertyType[] = ["apartment", "villa", "office"];

export function propertyTypesFor(service: CatalogService): PropertyType[] {
  return service.propertyTypes ?? DEFAULT_TYPES;
}

/**
 * Server-side price. The app never sends a price; it sends the service and property,
 * and the booking stores whatever this returns at the moment of booking.
 */
export function quote(input: { serviceKey: string; propertyType: PropertyType; propertySize: string; plan?: "one_off" | "amc" | undefined }): Quote | { error: string } {
  const service = findService(input.serviceKey);
  if (!service) return { error: "Unknown service" };
  if (!propertyTypesFor(service).includes(input.propertyType)) return { error: `${service.name} is not offered for this property type` };
  if (!PROPERTY_SIZES[input.propertyType]?.includes(input.propertySize)) return { error: `Size "${input.propertySize}" is not valid for ${input.propertyType}` };

  const rate = service.pricing.kind === "tiered" && input.propertyType === "apartment" ? REGULAR_RATES[input.propertySize] : undefined;
  if (!rate) {
    return { priceAed: null, pricing: "inspection", label: "Our team visits, inspects and quotes on site; pay securely in the app", durationMinutes: null, cleaners: null };
  }
  return { priceAed: rate.priceAed, pricing: "fixed", label: `AED ${rate.priceAed} per visit`, durationMinutes: rate.minutes, cleaners: rate.cleaners };
}

/** Lowest per-visit price for a fixed-price service, for "from AED …" labels. */
export function startingFrom(service: CatalogService): number | null {
  if (service.pricing.kind !== "tiered") return null;
  return Math.min(...Object.values(REGULAR_RATES).map((r) => r.priceAed));
}
