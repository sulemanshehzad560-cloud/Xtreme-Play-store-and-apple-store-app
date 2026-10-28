import { and, eq, isNull, ne } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { addresses, authIdentities, pushTokens, userAvatars, users } from "../../db/schema.js";
import { assertInServiceZone } from "../../config/service-zone.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import type { AddressInput, BookingService } from "../bookings/booking.service.js";
import type { TokenService } from "../auth/tokens.js";

export class UserService {
  constructor(
    private readonly db: Database,
    private readonly tokens: TokenService,
    private readonly bookingsSvc: BookingService,
  ) {}

  async updateProfile(
    userId: string,
    patch: {
      fullName?: string | undefined;
      email?: string | null | undefined;
      dateOfBirth?: string | null | undefined;
      locale?: "en" | "ar" | undefined;
      marketingOptIn?: boolean | undefined;
    },
  ) {
    if (patch.dateOfBirth) {
      const dob = new Date(`${patch.dateOfBirth}T00:00:00Z`);
      const age = (Date.now() - dob.getTime()) / (365.25 * 86_400_000);
      if (Number.isNaN(age) || age < 13 || age > 110) throw badRequest("invalid_date_of_birth", "Please enter a valid date of birth (13 or older)");
    }
    await this.db
      .update(users)
      .set({ ...patch, ...(patch.email ? { email: patch.email.toLowerCase() } : {}), updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  /**
   * Account deletion, as both stores require. Personal data is erased and every
   * session ends; completed bookings stay (anonymised) for the company's records.
   */
  async deleteAccount(userId: string) {
    await this.bookingsSvc.cancelAllOpenFor(userId);
    await this.db.transaction(async (tx) => {
      await tx.delete(authIdentities).where(eq(authIdentities.userId, userId));
      await tx.delete(pushTokens).where(eq(pushTokens.userId, userId));
      await tx.delete(userAvatars).where(eq(userAvatars.userId, userId));
      await tx.update(addresses).set({ deletedAt: new Date() }).where(eq(addresses.userId, userId));
      await tx
        .update(users)
        .set({ deletedAt: new Date(), fullName: null, email: null, phone: null, avatarUrl: null, dateOfBirth: null, updatedAt: new Date() })
        .where(eq(users.id, userId));
    });
    await this.tokens.revokeAllForUser(userId);
  }

  // ------------------------------------------------------------ profile photo

  /** Stores a profile photo (the app sends a small, already-resized image). */
  async setAvatar(userId: string, base64: string, publicUrl: string) {
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length < 100 || bytes.length > 1_500_000) throw badRequest("invalid_image", "Please choose a photo under 1.5 MB");
    const contentType = sniffImage(bytes);
    if (!contentType) throw badRequest("invalid_image", "Please choose a JPEG, PNG or WebP photo");
    const now = new Date();
    await this.db
      .insert(userAvatars)
      .values({ userId, contentType, data: bytes.toString("base64"), updatedAt: now })
      .onConflictDoUpdate({ target: userAvatars.userId, set: { contentType, data: bytes.toString("base64"), updatedAt: now } });
    // Versioned URL so apps refresh their cached copy when the photo changes.
    await this.db
      .update(users)
      .set({ avatarUrl: `${publicUrl}/v1/users/${userId}/avatar?v=${now.getTime()}`, updatedAt: now })
      .where(eq(users.id, userId));
  }

  async removeAvatar(userId: string) {
    await this.db.delete(userAvatars).where(eq(userAvatars.userId, userId));
    await this.db.update(users).set({ avatarUrl: null, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async avatar(userId: string) {
    const [row] = await this.db.select().from(userAvatars).where(eq(userAvatars.userId, userId)).limit(1);
    if (!row) throw notFound("Photo");
    return { contentType: row.contentType, bytes: Buffer.from(row.data, "base64"), updatedAt: row.updatedAt };
  }

  // ------------------------------------------------------------ addresses

  async listAddresses(userId: string) {
    const rows = await this.db
      .select()
      .from(addresses)
      .where(and(eq(addresses.userId, userId), isNull(addresses.deletedAt)))
      .orderBy(addresses.createdAt);
    return rows.map(addressView);
  }

  async addAddress(userId: string, input: AddressInput & { isDefault?: boolean | undefined }) {
    assertInServiceZone(input);
    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: addresses.id })
        .from(addresses)
        .where(and(eq(addresses.userId, userId), isNull(addresses.deletedAt)));
      if (existing.length >= 20) throw conflict("too_many_addresses", "You can save up to 20 addresses");
      const makeDefault = input.isDefault || existing.length === 0;
      if (makeDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
      const [row] = await tx
        .insert(addresses)
        .values({
          userId,
          label: input.label,
          area: input.area,
          building: input.building ?? null,
          unit: input.unit ?? null,
          street: input.street ?? null,
          notes: input.notes ?? null,
          lat: input.lat,
          lng: input.lng,
          isDefault: makeDefault,
        })
        .returning();
      return addressView(row!);
    });
  }

  async updateAddress(userId: string, id: string, patch: Partial<AddressInput> & { isDefault?: boolean | undefined }) {
    return this.db.transaction(async (tx) => {
      if (patch.lat != null || patch.lng != null) {
        const [current] = await tx
          .select({ lat: addresses.lat, lng: addresses.lng })
          .from(addresses)
          .where(and(eq(addresses.id, id), eq(addresses.userId, userId), isNull(addresses.deletedAt)));
        if (!current) throw notFound("Address");
        assertInServiceZone({ lat: patch.lat ?? current.lat, lng: patch.lng ?? current.lng });
      }
      if (patch.isDefault) {
        await tx.update(addresses).set({ isDefault: false }).where(and(eq(addresses.userId, userId), ne(addresses.id, id)));
      }
      const [row] = await tx
        .update(addresses)
        .set(patch)
        .where(and(eq(addresses.id, id), eq(addresses.userId, userId), isNull(addresses.deletedAt)))
        .returning();
      if (!row) throw notFound("Address");
      return addressView(row);
    });
  }

  async deleteAddress(userId: string, id: string) {
    const [row] = await this.db
      .update(addresses)
      .set({ deletedAt: new Date(), isDefault: false })
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId), isNull(addresses.deletedAt)))
      .returning();
    if (!row) throw notFound("Address");
  }

  // ------------------------------------------------------------ push tokens

  async registerPushToken(userId: string, token: string, platform: "ios" | "android" | "web") {
    // A device that changes hands moves its token to the new account.
    await this.db
      .insert(pushTokens)
      .values({ token, userId, platform })
      .onConflictDoUpdate({ target: pushTokens.token, set: { userId, platform, lastSeenAt: new Date() } });
  }

  async removePushToken(userId: string, token: string) {
    await this.db.delete(pushTokens).where(and(eq(pushTokens.token, token), eq(pushTokens.userId, userId)));
  }
}

function addressView(a: typeof addresses.$inferSelect) {
  return {
    id: a.id,
    label: a.label,
    area: a.area,
    building: a.building,
    unit: a.unit,
    street: a.street,
    notes: a.notes,
    lat: a.lat,
    lng: a.lng,
    isDefault: a.isDefault,
  };
}

/** Image type from the file's first bytes (never trust the client's label). */
function sniffImage(b: Buffer): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}
