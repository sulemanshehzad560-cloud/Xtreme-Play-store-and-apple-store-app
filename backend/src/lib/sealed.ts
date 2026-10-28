import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Field-level encryption for personal content stored in the database (chat messages, profile
// photos), on top of the database's own disk encryption: a copy of the database alone does not
// reveal them. AES-256-GCM with a random IV per value; values from before a key was set are
// read as they are.

const PREFIX = "enc:v1:";
let key: Buffer | null = null;

/**
 * DATA_ENCRYPTION_KEY: 32 random bytes in base64 (Render's "Generate" button or
 * `openssl rand -base64 32`), or any other random secret of 32+ characters, which is
 * turned into a 256-bit key with SHA-256.
 */
export function deriveKey(secret: string): Buffer {
  const raw = Buffer.from(secret, "base64");
  return /^[A-Za-z0-9+/]{42,43}=?=?$/.test(secret) && raw.length === 32 ? raw : createHash("sha256").update(secret, "utf8").digest();
}

export function configureSealing(secret: string | undefined) {
  key = secret ? deriveKey(secret) : null;
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
