import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { bookings, reviews } from "../../db/schema.js";
import { COMPANY, SERVICE_AREAS } from "../../config/company.js";
import type { Container } from "../../container.js";
import { badRequest } from "../../lib/errors.js";
import { lat, lng } from "../../lib/schemas.js";
import { PRICE_TABLE, SERVICES, SIZE_LABELS, quote, startingFrom } from "./catalog.js";

const tags = ["catalog"];

export async function catalogRoutes(app: FastifyInstance, c: Container) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/company", { schema: { tags, summary: "Company contact details and branding" } }, async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=3600");
    return { ...COMPANY, serviceAreas: SERVICE_AREAS };
  });

  r.get("/catalog/services", { schema: { tags, summary: "Services and price list" } }, async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=600");
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
        startingFromAed: startingFrom(s),
        rating: byKey.get(s.key)?.avg ?? null,
        reviewCount: byKey.get(s.key)?.count ?? 0,
      })),
      propertySizes: Object.fromEntries(
        Object.entries(PRICE_TABLE).map(([type, sizes]) => [type, Object.keys(sizes).map((key) => ({ key, label: SIZE_LABELS[key] ?? key }))]),
      ),
    };
  });

  r.get(
    "/catalog/quote",
    {
      schema: {
        tags,
        summary: "Price for a service and property",
        querystring: z.object({
          serviceKey: z.string(),
          propertyType: z.enum(["apartment", "villa", "office"]),
          propertySize: z.string(),
          plan: z.enum(["one_off", "amc"]).default("one_off"),
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
