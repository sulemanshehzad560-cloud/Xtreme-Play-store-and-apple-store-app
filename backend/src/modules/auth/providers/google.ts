import { jwtVerify, type JWTVerifyGetKey } from "jose";
import { badRequest, unauthorized } from "../../../lib/errors.js";
import { remoteJwks } from "./jwks.js";
import type { SocialProfile, SocialVerifier } from "./types.js";

export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

/**
 * Verifies the ID token returned by Google Sign-In on iOS / Android.
 * `clientIds` must list every OAuth client the app uses (iOS, Android and web).
 */
export class GoogleVerifier implements SocialVerifier {
  readonly provider = "google" as const;

  constructor(
    private readonly clientIds: string[],
    private readonly jwks: JWTVerifyGetKey = remoteJwks(GOOGLE_JWKS_URL),
  ) {}

  get configured() {
    return this.clientIds.length > 0;
  }

  async verify(idToken: string): Promise<SocialProfile> {
    if (!this.configured) throw badRequest("provider_disabled", "Google sign-in is not enabled");
    try {
      const { payload } = await jwtVerify(idToken, this.jwks, {
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: this.clientIds,
      });
      if (!payload.sub) throw new Error("missing sub");
      return {
        provider: "google",
        subject: payload.sub,
        email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
        emailVerified: payload.email_verified === true,
        name: typeof payload.name === "string" ? payload.name : null,
        picture: typeof payload.picture === "string" ? payload.picture : null,
      };
    } catch {
      throw unauthorized("Google sign-in could not be verified", "invalid_provider_token");
    }
  }
}
