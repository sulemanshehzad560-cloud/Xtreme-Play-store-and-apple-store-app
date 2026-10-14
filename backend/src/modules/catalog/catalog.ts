// Service catalog and price list (AED per visit), matching the Xtreme price list.
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
  /** "tiered": fixed price from PRICE_TABLE; "inspection": priced after a survey. */
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
    key: "move",
    name: "Move-in / move-out cleaning",
    nameAr: "التنظيف عند الانتقال",
    category: "cleaning",
    pricing: { kind: "tiered", tier: "deep" },
    durationMinutes: 360,
    highlights: ["Ready for handover inspection", "Inside cupboards, appliances and windows", "Bathrooms and kitchen fully sanitised", "Flexible timing around your move"],
  },
  {
    key: "postcon",
    name: "Post-construction cleaning",
    nameAr: "التنظيف بعد البناء",
    category: "cleaning",
    pricing: { kind: "inspection" },
    durationMinutes: 480,
    highlights: ["Fine dust removed from every surface", "Paint, cement and sticker residue cleaned", "Glass, frames and tracks detailed", "Waste cleared for handover"],
  },
  {
    key: "kitbath",
    name: "Kitchen & bathroom cleaning",
    nameAr: "تنظيف المطابخ والحمامات",
    category: "cleaning",
    pricing: { kind: "inspection" },
    durationMinutes: 180,
    highlights: ["Grease removed from hobs, hoods and tiles", "Limescale removed from taps and glass", "Grout and sealant cleaned", "Disinfected high-touch surfaces"],
  },
  {
    key: "carpet",
    name: "Carpet & upholstery cleaning",
    nameAr: "تنظيف السجاد والمفروشات",
    category: "cleaning",
    pricing: { kind: "inspection" },
    durationMinutes: 150,
    highlights: ["Deep extraction removes dust and allergens", "Stain treatment for sofas, rugs and mattresses", "Fabric-safe products", "Fast drying"],
  },
  {
    key: "ac",
    name: "AC duct cleaning",
    nameAr: "تنظيف مجاري التكييف",
    category: "technical",
    pricing: { kind: "inspection" },
    durationMinutes: 240,
    highlights: ["Ducts, vents and FCUs cleaned", "Removes dust, mould and odours", "Helps your AC cool efficiently", "Done with minimal disruption"],
  },
  {
    key: "pest",
    name: "Pest control",
    nameAr: "مكافحة الحشرات",
    category: "technical",
    pricing: { kind: "inspection" },
    durationMinutes: 90,
    highlights: ["Cockroaches, ants, bed bugs and more", "Safe for families and pets when used as directed", "Targeted, low-odour treatments", "Follow-up visit available"],
  },
  {
    key: "tank",
    name: "Water tank cleaning",
    nameAr: "تنظيف وتعقيم خزانات المياه",
    category: "technical",
    pricing: { kind: "inspection" },
    durationMinutes: 180,
    highlights: ["Tanks drained, scrubbed and disinfected", "Sediment and slime removed", "Suitable for villas and buildings", "Report after every clean"],
  },
  {
    key: "facade",
    name: "Facade & window cleaning",
    nameAr: "تنظيف الواجهات",
    category: "cleaning",
    pricing: { kind: "inspection" },
    durationMinutes: 300,
    highlights: ["Glass and cladding cleaned", "Trained, safety-equipped team", "Villas, shops and buildings", "One-off or scheduled"],
  },
  {
    key: "kitchenex",
    name: "Kitchen exhaust & grease trap",
    nameAr: "تنظيف شفاطات المطابخ ومصائد الدهون",
    category: "technical",
    pricing: { kind: "inspection" },
    durationMinutes: 240,
    highlights: ["Hoods, filters and ducts degreased", "Grease traps pumped and cleaned", "Helps reduce fire risk", "Out-of-hours service"],
  },
  {
    key: "laundry",
    name: "Bedroom laundry",
    nameAr: "خدمة غسيل المفروشات",
    category: "cleaning",
    pricing: { kind: "inspection" },
    durationMinutes: 60,
    highlights: ["Bed linen and towels washed and folded", "Beds made fresh", "Collected and returned", "Add to any cleaning visit"],
  },
  {
    key: "drapery",
    name: "Curtain & drapery care",
    nameAr: "تنظيف الستائر",
    category: "cleaning",
    pricing: { kind: "inspection" },
    durationMinutes: 120,
    highlights: ["Curtains and blinds cleaned", "Dust and odours removed", "Taken down and rehung", "Fabric-safe methods"],
  },
  {
    key: "helper",
    name: "Nanny & house helper",
    nameAr: "خدمات المربيات والمساعدات المنزليات",
    category: "staffing",
    pricing: { kind: "inspection" },
    durationMinutes: 240,
    highlights: ["Experienced, vetted helpers", "Hourly, part-time or full-time", "Cleaning, laundry and childcare support", "Flexible schedules"],
  },
  {
    key: "fm",
    name: "Facilities management",
    nameAr: "إدارة المرافق",
    category: "facilities",
    pricing: { kind: "inspection" },
    durationMinutes: 60,
    highlights: ["Cleaning, pest control and technical services", "Scheduled maintenance plans", "One point of contact", "Reports after every visit"],
  },
  {
    key: "disinfect",
    name: "Disinfection",
    nameAr: "خدمات التعقيم",
    category: "cleaning",
    pricing: { kind: "inspection" },
    durationMinutes: 120,
    highlights: ["High-touch surfaces disinfected", "Homes, offices and schools", "Approved disinfectants", "After illness or on schedule"],
  },
];

const byKey = new Map(SERVICES.map((s) => [s.key, s]));

export function findService(key: string): CatalogService | undefined {
  return byKey.get(key);
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
    return { priceAed: null, pricing: "inspection", tier: null, label: "Price confirmed after a free survey" };
  }
  const row = sizes[input.propertySize]!;
  let tier: PricingTier = service.pricing.tier;
  if (tier === "deep" && input.plan === "amc") tier = "deep_amc";
  const price = tier === "regular" ? row[0] : tier === "deep" ? row[1] : row[2];
  if (price == null) return { error: "Annual plan is not offered for this property" };
  return { priceAed: price, pricing: "fixed", tier, label: `AED ${price} per visit` };
}
