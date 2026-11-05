import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { bookings, reviews } from "../../db/schema.js";
import { COMPANY, SERVICE_AREAS } from "../../config/company.js";
import { SERVICE_ZONE } from "../../config/service-zone.js";
import type { Container } from "../../container.js";
import { badRequest } from "../../lib/errors.js";
import { lat, lng } from "../../lib/schemas.js";
import { PROPERTY_SIZES, SERVICES, SIZE_LABELS, pricingKind, propertyTypesFor, quote, startingFrom } from "./catalog.js";
import { pricing } from "./pricing.js";

const tags = ["catalog"];

export async function catalogRoutes(app: FastifyInstance, c: Container) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/company", { schema: { tags, summary: "Company contact details and branding" } }, async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=300");
    // Contacts are editable by admins in the dashboard; code values are the defaults.
    const c2 = await c.admin.company();
    return {
      ...COMPANY,
      tagline: c2.tagline,
      materials: { title: c2.materialsTitle, note: c2.materialsNote, titleAr: c2.materialsTitleAr, noteAr: c2.materialsNoteAr },
      phone: c2.phone,
      phoneDisplay: c2.phoneDisplay,
      landline: c2.landline,
      landlineDisplay: c2.landlineDisplay,
      whatsapp: c2.whatsapp,
      email: c2.email,
      website: c2.website,
      address: { ...COMPANY.address, line1: c2.addressLine1 },
      social: { facebook: c2.facebook, instagram: c2.instagram },
      serviceAreas: SERVICE_AREAS,
      serviceZone: SERVICE_ZONE,
    };
  });

  r.get("/catalog/services", { schema: { tags, summary: "Services and price list" } }, async (_req, reply) => {
    // Short cache: prices edited in the dashboard reach the app within a minute.
    reply.header("Cache-Control", "public, max-age=60");
    // Real ratings from completed-job reviews; services without reviews show as new.
    const stats = await c.db
      .select({
        serviceKey: bookings.serviceKey,
        avg: sql<number>`round(avg(${reviews.rating})::numeric, 1)::float`,
        count: sql<number>`count(*)::int`,
      })
      .from(reviews)
      .innerJoin(bookings, eq(bookings.id, reviews.bookingId))
      .groupBy(bookings.serviceKey);
    const byKey = new Map(stats.map((r) => [r.serviceKey, r]));
    return {
      currency: COMPANY.currency,
      vatIncluded: true,
      services: SERVICES.map((s) => ({
        ...s,
        pricing: pricingKind(s),
        propertyTypes: propertyTypesFor(s),
        startingFromAed: startingFrom(s),
        rating: byKey.get(s.key)?.avg ?? null,
        reviewCount: byKey.get(s.key)?.count ?? 0,
      })),
      propertySizes: Object.fromEntries(
        Object.entries(PROPERTY_SIZES).map(([type, sizes]) => [type, sizes.map((key) => ({ key, label: SIZE_LABELS[key] ?? key }))]),
      ),
      // Fixed prices by service, property type and size (price, time on site, team size).
      rates: pricing().rates,
      // Older app versions read this: regular cleaning of apartments.
      regularRates: pricing().rates.regular?.apartment ?? {},
      materialsIncluded: true,
      payments: {
        tamaraFeePercent: pricing().tamaraFeePercent,
        tamaraInstalments: c.env.TAMARA_INSTALMENTS,
        cardFeePercent: pricing().cardFeePercent,
        serviceFeeAed: pricing().serviceFeeAed,
        serviceFeePercent: pricing().serviceFeePercent,
      },
      frequencyDiscountPercent: pricing().frequencyDiscountPercent,
      referral: pricing().referral,
    };
  });

  // Social proof for the home screen: real ratings and completed jobs.
  r.get("/catalog/stats", { schema: { tags, summary: "Average rating, review count and completed cleans" } }, async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=300");
    const [rv] = await c.db
      .select({ avg: sql<number | null>`round(avg(${reviews.rating})::numeric, 1)::float`, count: sql<number>`count(*)::int` })
      .from(reviews);
    const [done] = await c.db.select({ count: sql<number>`count(*)::int` }).from(bookings).where(eq(bookings.status, "completed"));
    return { rating: rv?.avg ?? null, reviewCount: rv?.count ?? 0, completedJobs: done?.count ?? 0 };
  });

  r.get(
    "/catalog/quote",
    {
      schema: {
        tags,
        summary: "Price for a service and property",
        querystring: z.object({
          serviceKey: z.string(),
          propertyType: z.enum(["apartment", "villa", "office", "restaurant"]),
          propertySize: z.string(),
          plan: z.enum(["one_off", "amc"]).default("one_off"),
          frequency: z.enum(["one_time", "weekly", "biweekly"]).default("one_time"),
        }),
      },
    },
    async (req) => {
      const q = quote(req.query);
      if ("error" in q) throw badRequest("invalid_quote", q.error);
      return { ...q, currency: COMPANY.currency, vatIncluded: true };
    },
  );

  r.get(
    "/staff/availability",
    {
      schema: {
        tags,
        summary: "How many teams are on duty, available and deployed (optionally near a point)",
        querystring: z.object({ lat: z.coerce.number().pipe(lat).optional(), lng: z.coerce.number().pipe(lng).optional() }),
      },
    },
    async (req) => c.staff.availability(req.query.lat != null && req.query.lng != null ? { lat: req.query.lat, lng: req.query.lng } : undefined),
  );
}
