import { jwtVerify, type JWTVerifyGetKey } from "jose";
import { sha256 } from "../../../lib/crypto.js";
import { badRequest, unauthorized } from "../../../lib/errors.js";
import { remoteJwks } from "./jwks.js";
import type { SocialProfile, SocialVerifier } from "./types.js";

export const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

/**
 * Verifies the identity token from Sign in with Apple. Apple only shares the user's name
 * on the very first sign-in, so the app sends it alongside the token and we store it then.
 */
export class AppleVerifier implements SocialVerifier {
  readonly provider = "apple" as const;

  constructor(
    private readonly audiences: string[],
    private readonly jwks: JWTVerifyGetKey = remoteJwks(APPLE_JWKS_URL),
  ) {}

  get configured() {
    return this.audiences.length > 0;
  }

  async verify(identityToken: string, options?: { nonce?: string }): Promise<SocialProfile> {
    if (!this.configured) throw badRequest("provider_disabled", "Apple sign-in is not enabled");
    let payload;
    try {
      ({ payload } = await jwtVerify(identityToken, this.jwks, {
        issuer: "https://appleid.apple.com",
        audience: this.audiences,
      }));
    } catch {
      throw unauthorized("Apple sign-in could not be verified", "invalid_provider_token");
    }
    // The app hashes a random nonce into the request; checking it stops token replay.
    if (options?.nonce && payload.nonce !== sha256(options.nonce)) {
      throw unauthorized("Apple sign-in could not be verified", "invalid_provider_token");
    }
    if (!payload.sub) throw unauthorized("Apple sign-in could not be verified", "invalid_provider_token");
    const verified = payload.email_verified === true || payload.email_verified === "true";
    return {
      provider: "apple",
      subject: payload.sub,
      email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
      emailVerified: verified,
      name: null,
      picture: null,
    };
  }
}
