import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Field-level encryption for personal content stored in the database (chat messages, profile
// photos), on top of the database's own disk encryption: a copy of the database alone does not
// reveal them. AES-256-GCM with a random IV per value; values from before a key was set are
// read as they are.

const PREFIX = "enc:v1:";
let key: Buffer | null = null;

/** DATA_ENCRYPTION_KEY: 32 random bytes, base64 (e.g. `openssl rand -base64 32`). */
export function configureSealing(base64Key: string | undefined) {
  key = base64Key ? Buffer.from(base64Key, "base64") : null;
  if (key && key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
}

export function seal(plain: string): string {
  if (!key) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function unseal(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  if (!key) throw new Error("Encrypted data found but DATA_ENCRYPTION_KEY is not set");
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
