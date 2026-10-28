import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { appSettings, auditLogs } from "../../db/schema.js";
import { badRequest } from "../../lib/errors.js";
import { PROPERTY_SIZES, REGULAR_RATES, SERVICES, propertyTypesFor, type PropertyType } from "./catalog.js";

export interface Rate {
  priceAed: number;
  minutes: number;
  cleaners: number;
}

/** Fixed prices by service, property type and size. Anything without a rate is quoted on a site visit. */
export type RateTable = Record<string, Partial<Record<PropertyType, Record<string, Rate>>>>;

export interface PricingConfig {
  rates: RateTable;
  /** Added when the customer pays in instalments with Tamara, in percent. */
  tamaraFeePercent: number;
  /** Added when the customer pays by card / Apple Pay / Google Pay, in percent (0 = none). */
  cardFeePercent: number;
  /** Flat service fee added to every payment, in AED (0 = none). */
  serviceFeeAed: number;
  /** Discount on repeat regular cleaning, in percent of the one-time price. */
  frequencyDiscountPercent: { weekly: number; biweekly: number };
}

const KEY = "pricing";

export function defaultPricing(tamaraFeePercent: number): PricingConfig {
  return {
    rates: { regular: { apartment: structuredClone(REGULAR_RATES) } },
    tamaraFeePercent,
    cardFeePercent: 0,
    serviceFeeAed: 0,
    frequencyDiscountPercent: { weekly: 0, biweekly: 0 },
  };
}

// Set lazily: catalog.ts and this file import each other.
let current: PricingConfig | undefined;

/** The prices in force. Read on every quote, so changes from the dashboard apply at once. */
export const pricing = (): PricingConfig => (current ??= defaultPricing(8));

/** The fixed rate for one service and property, or undefined when it is quoted on site. */
export function rateFor(serviceKey: string, type: PropertyType, size: string): Rate | undefined {
  return pricing().rates[serviceKey]?.[type]?.[size];
}

/** Checks a price list from the dashboard and drops empty entries. */
export function validatePricing(input: PricingConfig): PricingConfig {
  const rates: RateTable = {};
  for (const [serviceKey, byType] of Object.entries(input.rates ?? {})) {
    const service = SERVICES.find((s) => s.key === serviceKey);
    if (!service) throw badRequest("invalid_pricing", `Unknown service "${serviceKey}"`);
    for (const [type, bySize] of Object.entries(byType ?? {}) as [PropertyType, Record<string, Rate>][]) {
      if (!propertyTypesFor(service).includes(type)) throw badRequest("invalid_pricing", `${service.name} is not offered for ${type}`);
      for (const [size, r] of Object.entries(bySize ?? {})) {
        if (!PROPERTY_SIZES[type]?.includes(size)) throw badRequest("invalid_pricing", `"${size}" is not a ${type} size`);
        if (!r) continue;
        const ok = Number.isInteger(r.priceAed) && r.priceAed >= 1 && r.priceAed <= 100_000 && Number.isInteger(r.minutes) && r.minutes >= 15 && r.minutes <= 1440 && Number.isInteger(r.cleaners) && r.cleaners >= 1 && r.cleaners <= 20;
        if (!ok) throw badRequest("invalid_pricing", `${service.name}, ${type} ${size}: price 1–100000 AED, time 15–1440 minutes, 1–20 cleaners`);
        ((rates[serviceKey] ??= {})[type] ??= {})[size] = { priceAed: r.priceAed, minutes: r.minutes, cleaners: r.cleaners };
      }
    }
  }
  const pct = (v: unknown, max: number, what: string) => {
    if (typeof v !== "number" || !(v >= 0 && v <= max)) throw badRequest("invalid_pricing", `${what} must be between 0 and ${max}`);
    return Math.round(v * 100) / 100;
  };
  const freq = input.frequencyDiscountPercent ?? { weekly: 0, biweekly: 0 };
  return {
    rates,
    tamaraFeePercent: pct(input.tamaraFeePercent, 20, "The Tamara fee (%)"),
    cardFeePercent: pct(input.cardFeePercent ?? 0, 10, "The card fee (%)"),
    serviceFeeAed: pct(input.serviceFeeAed ?? 0, 1000, "The service fee (AED)"),
    frequencyDiscountPercent: { weekly: pct(freq.weekly ?? 0, 50, "The weekly discount (%)"), biweekly: pct(freq.biweekly ?? 0, 50, "The bi-weekly discount (%)") },
  };
}

/** Stores the price list in the database; the code values are only the first-run defaults. */
export class PricingService {
  constructor(
    private readonly db: Database,
    private readonly defaults: PricingConfig,
  ) {
    current = defaults;
  }

  async load(): Promise<PricingConfig> {
    const [row] = await this.db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
    try {
      current = row ? validatePricing(row.value as unknown as PricingConfig) : this.defaults;
    } catch {
      current = this.defaults; // a bad stored value never takes prices down
    }
    return current;
  }

  async update(actorId: string, input: PricingConfig): Promise<PricingConfig> {
    const next = validatePricing(input);
    await this.db
      .insert(appSettings)
      .values({ key: KEY, value: next as unknown as Record<string, unknown>, updatedBy: actorId })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: next as unknown as Record<string, unknown>, updatedBy: actorId, updatedAt: new Date() } });
    await this.db.insert(auditLogs).values({ actorId, action: "settings.pricing_updated", targetType: "settings", targetId: KEY, details: { before: pricing(), after: next } as unknown as Record<string, unknown> });
    current = next;
    return next;
  }
}
