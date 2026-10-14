import { and, eq, isNull } from "drizzle-orm";
import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import type { Database } from "../../db/client.js";
import { refreshTokens, type UserRole } from "../../db/schema.js";
import { randomToken, sha256 } from "../../lib/crypto.js";
import { unauthorized } from "../../lib/errors.js";

const ISSUER = "xtreme-api";
const AUDIENCE = "xtreme-app";

export interface AccessClaims {
  sub: string;
  role: UserRole;
}

export interface TokenConfig {
  secret: string;
  accessTtlSeconds: number;
  refreshTtlDays: number;
}

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface ClientInfo {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export class TokenService {
  private readonly key: Uint8Array;

  constructor(
    private readonly db: Database,
    private readonly config: TokenConfig,
  ) {
    this.key = new TextEncoder().encode(config.secret);
  }

  async signAccess(claims: AccessClaims): Promise<string> {
    return new SignJWT({ role: claims.role })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(claims.sub)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessTtlSeconds}s`)
      .sign(this.key);
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"] });
      if (typeof payload.sub !== "string" || typeof payload.role !== "string") throw unauthorized("Invalid token");
      return { sub: payload.sub, role: payload.role as UserRole };
    } catch (err) {
      if (err instanceof joseErrors.JWTExpired) throw unauthorized("Session expired", "token_expired");
      throw unauthorized("Invalid token", "invalid_token");
    }
  }

  /** Issues an access token plus a new refresh token (optionally continuing a rotation family). */
  async issue(user: { id: string; role: UserRole }, client: ClientInfo, familyId?: string): Promise<IssuedTokens> {
    const refreshToken = randomToken(32);
    const expiresAt = new Date(Date.now() + this.config.refreshTtlDays * 86_400_000);
    await this.db.insert(refreshTokens).values({
      userId: user.id,
      familyId: familyId ?? crypto.randomUUID(),
      tokenHash: sha256(refreshToken),
      expiresAt,
      ip: client.ip,
      userAgent: client.userAgent?.slice(0, 300),
    });
    return {
      accessToken: await this.signAccess({ sub: user.id, role: user.role }),
      accessTokenExpiresIn: this.config.accessTtlSeconds,
      refreshToken,
      refreshTokenExpiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Rotates a refresh token. Each token works once; presenting a token that was already
   * rotated means it leaked, so the whole family (every device session descended from
   * that sign-in) is revoked.
   */
  async rotate(raw: string): Promise<{ userId: string; familyId: string }> {
    const hash = sha256(raw);
    const [row] = await this.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash)).limit(1);
    if (!row) throw unauthorized("Invalid refresh token", "invalid_refresh_token");

    if (row.revokedAt || row.rotatedAt) {
      await this.revokeFamily(row.familyId);
      throw unauthorized("Session ended. Please sign in again.", "refresh_token_reused");
    }
    if (row.expiresAt.getTime() <= Date.now()) throw unauthorized("Session expired. Please sign in again.", "refresh_token_expired");

    // Conditional update makes concurrent rotations of the same token lose cleanly.
    const claimed = await this.db
      .update(refreshTokens)
      .set({ rotatedAt: new Date() })
      .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.rotatedAt), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });
    if (claimed.length === 0) {
      await this.revokeFamily(row.familyId);
      throw unauthorized("Session ended. Please sign in again.", "refresh_token_reused");
    }
    return { userId: row.userId, familyId: row.familyId };
  }

  async revoke(raw: string): Promise<void> {
    const [row] = await this.db
      .select({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, sha256(raw)))
      .limit(1);
    if (row) await this.revokeFamily(row.familyId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }
}
