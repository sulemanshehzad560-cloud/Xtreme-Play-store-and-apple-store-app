import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
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
    return {
      currency: COMPANY.currency,
      vatIncluded: true,
      services: SERVICES.map((s) => ({ ...s, startingFromAed: startingFrom(s) })),
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
