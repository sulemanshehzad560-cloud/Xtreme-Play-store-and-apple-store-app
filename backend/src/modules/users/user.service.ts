import { and, eq, isNull, ne } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { addresses, authIdentities, pushTokens, users } from "../../db/schema.js";
import { assertInServiceZone } from "../../config/service-zone.js";
import { conflict, notFound } from "../../lib/errors.js";
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
    patch: { fullName?: string | undefined; email?: string | null | undefined; locale?: "en" | "ar" | undefined; marketingOptIn?: boolean | undefined },
  ) {
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
      await tx.update(addresses).set({ deletedAt: new Date() }).where(eq(addresses.userId, userId));
      await tx
        .update(users)
        .set({ deletedAt: new Date(), fullName: null, email: null, phone: null, avatarUrl: null, updatedAt: new Date() })
        .where(eq(users.id, userId));
    });
    await this.tokens.revokeAllForUser(userId);
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
