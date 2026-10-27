// Service catalog and price list (AED per visit, VAT included), matching the Xtreme price list.
// Kept in code so prices are versioned and reviewed; the booking stores a price snapshot.

export type PropertyType = "apartment" | "villa" | "office";
export type PricingTier = "regular" | "deep" | "deep_amc";

/** [regular, deep, deep AMC] per visit. null = not offered for that size. */
export const PRICE_TABLE: Record<PropertyType, Record<string, [number, number, number | null]>> = {
  apartment: {
    studio: [100, 300, 250],
    "1bhk": [120, 350, 325],
    "2bhk": [150, 450, 375],
    "3bhk": [190, 600, 425],
    "4bhk": [240, 850, 500],
  },
  villa: {
    "2bhk": [300, 1100, 850],
    "3bhk": [350, 1300, 1050],
    "4bhk": [450, 1600, 1200],
    "5bhk": [600, 1900, 1350],
    "6bhk": [850, 2300, 1575],
  },
  office: {
    small: [200, 600, null],
    medium: [320, 900, null],
    large: [500, 1400, null],
  },
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
  /** "tiered": fixed price from PRICE_TABLE; "inspection": the office confirms the price before the visit. */
  pricing: { kind: "tiered"; tier: "regular" | "deep" } | { kind: "inspection" };
  durationMinutes: number;
  highlights: string[];
}

export const SERVICES: CatalogService[] = [
  {
    key: "regular",
    name: "Regular cleaning",
    nameAr: "التنظيف الدوري",
    category: "cleaning",
    pricing: { kind: "tiered", tier: "regular" },
    durationMinutes: 180,
    highlights: ["Trained, vetted cleaners", "All materials and equipment included", "Weekly, bi-weekly or one-off visits", "Same trusted team every visit"],
  },
  {
    key: "deep",
    name: "Deep cleaning",
    nameAr: "التنظيف العميق",
    category: "cleaning",
    pricing: { kind: "tiered", tier: "deep" },
    durationMinutes: 360,
    highlights: ["Kitchen degreasing and appliance exteriors", "Bathrooms descaled and disinfected", "Inside wardrobes, cabinets and windows", "Floors, skirting and upholstery vacuumed"],
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
    highlights: ["Grease removed from hob, hood and tiles", "Appliance exteriors and sink polished", "Counters and cabinet fronts wiped", "Floor scrubbed and disinfected"],
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
  tier: PricingTier | null;
  label: string;
}

/**
 * Server-side price. The app never sends a price; it sends the service and property,
 * and the booking stores whatever this returns at the moment of booking.
 */
export function quote(input: {
  serviceKey: string;
  propertyType: PropertyType;
  propertySize: string;
  plan?: "one_off" | "amc";
}): Quote | { error: string } {
  const service = findService(input.serviceKey);
  if (!service) return { error: "Unknown service" };
  const sizes = PRICE_TABLE[input.propertyType];
  if (!sizes[input.propertySize]) return { error: `Size "${input.propertySize}" is not valid for ${input.propertyType}` };

  if (service.pricing.kind === "inspection") {
    return { priceAed: null, pricing: "inspection", tier: null, label: "Quoted by our team on site; pay securely in the app" };
  }
  const row = sizes[input.propertySize]!;
  let tier: PricingTier = service.pricing.tier;
  if (tier === "deep" && input.plan === "amc") tier = "deep_amc";
  const price = tier === "regular" ? row[0] : tier === "deep" ? row[1] : row[2];
  if (price == null) return { error: "Annual plan is not offered for this property" };
  return { priceAed: price, pricing: "fixed", tier, label: `AED ${price} per visit` };
}

/** Lowest per-visit price for a fixed-price service, for "from AED …" labels. */
export function startingFrom(service: CatalogService): number | null {
  if (service.pricing.kind !== "tiered") return null;
  const col = service.pricing.tier === "regular" ? 0 : 1;
  return Math.min(...Object.values(PRICE_TABLE).flatMap((sizes) => Object.values(sizes).map((row) => row[col]!)));
}
