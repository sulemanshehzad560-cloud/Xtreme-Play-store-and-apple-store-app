import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1 };
const KEYLEN = 32;

/** scrypt hash stored as "scrypt$N$r$p$salt$hash" (base64). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEYLEN, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [kind, n, r, p, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Readable one-time password for staff, e.g. "Kite-7342-Moon". No look-alike characters. */
export function generatePassword(): string {
  const words = ["Gold", "Kite", "Moon", "Palm", "Dune", "Reef", "Star", "Wave", "Fern", "Lime", "Sand", "Pearl", "Sky", "Oak", "Jade", "Mint"];
  const pick = () => words[randomInt(words.length)]!;
  return `${pick()}-${String(randomInt(1000, 10000))}-${pick()}`;
}
