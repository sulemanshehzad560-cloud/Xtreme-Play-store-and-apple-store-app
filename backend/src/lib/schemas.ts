import { z } from "zod";

export const uuidParam = z.object({ id: z.uuid() });
export const lat = z.number().min(-90).max(90);
export const lng = z.number().min(-180).max(180);
export const phoneInput = z.string().trim().min(6).max(20);
export const otpCode = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");
export const isoDate = z.coerce.date();

export const addressInput = z.object({
  label: z.string().trim().min(1).max(40),
  area: z.string().trim().min(2).max(80),
  building: z.string().trim().max(120).nullish(),
  unit: z.string().trim().max(40).nullish(),
  street: z.string().trim().max(160).nullish(),
  notes: z.string().trim().max(300).nullish(),
  lat,
  lng,
});

export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  before: isoDate.optional(),
});
