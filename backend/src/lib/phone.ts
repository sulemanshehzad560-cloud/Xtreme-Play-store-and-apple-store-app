import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { badRequest } from "./errors.js";

/** Normalises user input like "050 123 4567" to E.164 ("+971501234567"). */
export function normalizePhone(input: string, defaultRegion: string): string {
  const parsed = parsePhoneNumberFromString(input, defaultRegion as CountryCode);
  if (!parsed || !parsed.isValid()) throw badRequest("invalid_phone", "Enter a valid mobile number");
  return parsed.number;
}

export function maskPhone(e164: string): string {
  return e164.length > 6 ? `${e164.slice(0, 4)}${"•".repeat(e164.length - 7)}${e164.slice(-3)}` : e164;
}
