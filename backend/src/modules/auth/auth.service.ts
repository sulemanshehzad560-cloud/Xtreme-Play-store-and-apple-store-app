import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { authIdentities, staffProfiles, users, type User } from "../../db/schema.js";
import { conflict, forbidden, notFound, tooManyRequests, unauthorized } from "../../lib/errors.js";
import { verifyPassword } from "../../lib/password.js";
import { isUniqueViolation } from "../bookings/booking.service.js";
import { toPublicUser, type PublicUser } from "../users/mappers.js";
import type { OtpService } from "./otp.js";
import type { SocialProfile, SocialProvider, SocialVerifier } from "./providers/types.js";
import type { ClientInfo, IssuedTokens, TokenService } from "./tokens.js";

const MAX_STAFF_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
// A valid hash of a random password, compared against when the Staff ID is unknown.
const DUMMY_HASH = "scrypt$16384$8$1$ZHVtbXlzYWx0ZHVtbXlzYQ==$7PjQ4j3dMPYWqk7cNG1bUcQ0x4D5mQyH2sJ6S2Jp1yk=";

export interface Session extends IssuedTokens {
  user: PublicUser;
  isNewUser: boolean;
}

type Identity = { provider: "phone" | SocialProvider; subject: string; email: string | null };

export class AuthService {
  constructor(
    private readonly db: Database,
    private readonly tokens: TokenService,
    private readonly otp: OtpService,
    private readonly verifiers: Record<SocialProvider, SocialVerifier>,
  ) {}

  enabledProviders(): string[] {
    return ["phone", ...Object.values(this.verifiers).filter((v) => v.configured).map((v) => v.provider)];
  }

  // ------------------------------------------------------------ sign in

  async signInWithPhone(phone: string, code: string, client: ClientInfo, profile?: { fullName?: string | undefined }): Promise<Session> {
    await this.otp.verify(phone, code);
    const { user, isNew } = await this.resolveUser({ provider: "phone", subject: phone, email: null }, () => ({
      phone,
      phoneVerifiedAt: new Date(),
      fullName: profile?.fullName ?? null,
    }));
    return this.session(user, isNew, client);
  }

  /**
   * Staff sign in with the Staff ID (employee code) and password an admin set in the
   * dashboard. Five wrong passwords lock the account for 15 minutes.
   */
  async signInStaff(staffId: string, password: string, client: ClientInfo): Promise<Session> {
    const wrong = () => unauthorized("Staff ID or password is incorrect");
    const [row] = await this.db
      .select({ user: users, profile: staffProfiles })
      .from(staffProfiles)
      .innerJoin(users, eq(users.id, staffProfiles.userId))
      .where(and(sql`lower(${staffProfiles.employeeCode}) = lower(${staffId.trim()})`, isNull(users.deletedAt)))
      .limit(1);
    if (!row || row.user.role !== "staff" || !row.profile.passwordHash) {
      await verifyPassword(password, DUMMY_HASH); // same timing whether or not the ID exists
      throw wrong();
    }
    const { user, profile } = row;
    if (profile.lockedUntil && profile.lockedUntil > new Date()) {
      const minutes = Math.ceil((profile.lockedUntil.getTime() - Date.now()) / 60_000);
      throw tooManyRequests(`Too many wrong passwords. Try again in ${minutes} min or ask the office to reset it.`, minutes * 60);
    }
    if (!(await verifyPassword(password, profile.passwordHash))) {
      const failed = profile.failedLogins + 1;
      await this.db
        .update(staffProfiles)
        .set(failed >= MAX_STAFF_ATTEMPTS ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLogins: failed })
        .where(eq(staffProfiles.userId, user.id));
      throw wrong();
    }
    if (user.blockedAt || !profile.active) throw forbidden("This staff account is inactive. Please contact the office.", "account_inactive");
    await this.db.update(staffProfiles).set({ failedLogins: 0, lockedUntil: null }).where(eq(staffProfiles.userId, user.id));
    return this.session(user, false, client);
  }

  async signInWithSocial(
    provider: SocialProvider,
    token: string,
    client: ClientInfo,
    extra: { nonce?: string | undefined; fullName?: string | undefined } = {},
  ): Promise<Session> {
    const profile = await this.verifiers[provider].verify(token, { nonce: extra.nonce });
    const { user, isNew } = await this.resolveUser(
      { provider, subject: profile.subject, email: profile.email },
      () => newUserFromProfile(profile, extra.fullName),
    );
    return this.session(user, isNew, client);
  }

  async refresh(refreshToken: string, client: ClientInfo): Promise<IssuedTokens> {
    const { userId, familyId } = await this.tokens.rotate(refreshToken);
    const user = await this.activeUser(userId);
    return this.tokens.issue(user, client, familyId);
  }

  async signOut(refreshToken: string): Promise<void> {
    await this.tokens.revoke(refreshToken);
  }

  // ------------------------------------------------------------ linking

  /** Adds another sign-in method to the signed-in account. */
  async linkSocial(userId: string, provider: SocialProvider, token: string, nonce?: string): Promise<PublicUser> {
    const profile = await this.verifiers[provider].verify(token, { nonce });
    await this.attachIdentity(userId, { provider, subject: profile.subject, email: profile.email });
    const user = await this.activeUser(userId);
    const patch: Partial<User> = {};
    if (!user.email && profile.email && profile.emailVerified) patch.email = profile.email;
    if (!user.fullName && profile.name) patch.fullName = profile.name;
    if (!user.avatarUrl && profile.picture) patch.avatarUrl = profile.picture;
    if (Object.keys(patch).length) await this.db.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, userId));
    return this.publicUser(userId);
  }

  /** Verifies a phone number and sets it as the account's contact number. */
  async linkPhone(userId: string, phone: string, code: string): Promise<PublicUser> {
    await this.otp.verify(phone, code);
    const [taken] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phone, phone), ne(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    if (taken) throw conflict("phone_in_use", "This number is already used by another account. Sign in with it instead.");

    await this.db.transaction(async (tx) => {
      // Replace any previous phone identity: one phone per account.
      await tx.delete(authIdentities).where(and(eq(authIdentities.userId, userId), eq(authIdentities.provider, "phone")));
      await tx.insert(authIdentities).values({ userId, provider: "phone", providerUserId: phone });
      await tx.update(users).set({ phone, phoneVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
    });
    return this.publicUser(userId);
  }

  async unlink(userId: string, provider: "phone" | SocialProvider): Promise<PublicUser> {
    const identities = await this.db.select().from(authIdentities).where(eq(authIdentities.userId, userId));
    if (!identities.some((i) => i.provider === provider)) throw notFound("Sign-in method");
    if (identities.length <= 1) throw conflict("last_sign_in_method", "Add another sign-in method before removing this one");
    await this.db.delete(authIdentities).where(and(eq(authIdentities.userId, userId), eq(authIdentities.provider, provider)));
    return this.publicUser(userId);
  }

  // ------------------------------------------------------------ helpers

  async publicUser(userId: string): Promise<PublicUser> {
    const user = await this.activeUser(userId);
    const providers = await this.db
      .select({ provider: authIdentities.provider })
      .from(authIdentities)
      .where(eq(authIdentities.userId, userId));
    return toPublicUser(user, providers.map((p) => p.provider).sort());
  }

  async activeUser(userId: string): Promise<User> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.deletedAt) throw unauthorized("Account not found", "account_not_found");
    if (user.blockedAt) throw forbidden("This account has been suspended. Please contact Xtreme.", "account_blocked");
    return user;
  }

  /** Finds the account behind an identity, creating the account on first sign-in. */
  private async resolveUser(
    identity: Identity,
    newUser: () => Partial<typeof users.$inferInsert>,
    retried = false,
  ): Promise<{ user: User; isNew: boolean }> {
    const [existing] = await this.db
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .where(and(eq(authIdentities.provider, identity.provider), eq(authIdentities.providerUserId, identity.subject)))
      .limit(1);

    if (existing) {
      const user = await this.activeUser(existing.userId);
      await this.db
        .update(authIdentities)
        .set({ lastUsedAt: new Date() })
        .where(and(eq(authIdentities.provider, identity.provider), eq(authIdentities.providerUserId, identity.subject)));
      return { user, isNew: false };
    }

    // Staff and admins are created by the office with a phone number but no identity
    // yet; their first OTP sign-in claims that account instead of creating a new one.
    if (identity.provider === "phone") {
      const [byPhone] = await this.db
        .select()
        .from(users)
        .where(and(eq(users.phone, identity.subject), isNull(users.deletedAt)))
        .limit(1);
      if (byPhone) {
        await this.attachIdentity(byPhone.id, identity);
        if (!byPhone.phoneVerifiedAt) await this.db.update(users).set({ phoneVerifiedAt: new Date() }).where(eq(users.id, byPhone.id));
        return { user: await this.activeUser(byPhone.id), isNew: false };
      }
    }

    // Accounts are never merged automatically by email: provider emails can be
    // unverified or recycled. Users link methods explicitly from their profile.
    let user: User;
    try {
      user = await this.createWithIdentity(identity, newUser);
    } catch (err) {
      // Two first sign-ins raced (e.g. a double tap): the other one created the account.
      if (isUniqueViolation(err) && !retried) return this.resolveUser(identity, newUser, true);
      throw err;
    }
    return { user, isNew: true };
  }

  private async createWithIdentity(identity: Identity, newUser: () => Partial<typeof users.$inferInsert>) {
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(users).values(newUser()).returning();
      await tx.insert(authIdentities).values({
        userId: created!.id,
        provider: identity.provider,
        providerUserId: identity.subject,
        email: identity.email,
      });
      return created!;
    });
  }

  private async attachIdentity(userId: string, identity: Identity) {
    const [owner] = await this.db
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .where(and(eq(authIdentities.provider, identity.provider), eq(authIdentities.providerUserId, identity.subject)))
      .limit(1);
    if (owner && owner.userId !== userId) {
      throw conflict("identity_in_use", "This sign-in is already connected to another Xtreme account");
    }
    if (!owner) {
      await this.db.insert(authIdentities).values({
        userId,
        provider: identity.provider,
        providerUserId: identity.subject,
        email: identity.email,
      });
    }
  }

  private async session(user: User, isNewUser: boolean, client: ClientInfo): Promise<Session> {
    const tokens = await this.tokens.issue(user, client);
    return { ...tokens, user: await this.publicUser(user.id), isNewUser };
  }
}

function newUserFromProfile(profile: SocialProfile, fullName?: string) {
  return {
    fullName: fullName ?? profile.name,
    email: profile.emailVerified ? profile.email : null,
    avatarUrl: profile.picture,
  };
}
