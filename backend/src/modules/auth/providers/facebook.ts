import { jwtVerify, type JWTVerifyGetKey } from "jose";
import { badRequest, unauthorized } from "../../../lib/errors.js";
import { remoteJwks } from "./jwks.js";
import type { SocialProfile, SocialVerifier } from "./types.js";

export const FACEBOOK_LIMITED_JWKS_URL = "https://limited.facebook.com/.well-known/oauth/openid/jwks/";
const GRAPH = "https://graph.facebook.com/v21.0";

type FetchLike = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * Facebook Login gives Android (and iOS with tracking allowed) a classic access token,
 * which we check with the Graph API. iOS without tracking permission uses Limited Login,
 * which returns an OpenID Connect JWT instead; that is verified against Facebook's keys.
 */
export class FacebookVerifier implements SocialVerifier {
  readonly provider = "facebook" as const;

  constructor(
    private readonly appId: string | undefined,
    private readonly appSecret: string | undefined,
    private readonly fetchFn: FetchLike = (url) => fetch(url),
    private readonly jwks: JWTVerifyGetKey = remoteJwks(FACEBOOK_LIMITED_JWKS_URL),
  ) {}

  get configured() {
    return Boolean(this.appId && this.appSecret);
  }

  async verify(token: string, options?: { nonce?: string }): Promise<SocialProfile> {
    if (!this.configured) throw badRequest("provider_disabled", "Facebook sign-in is not enabled");
    return token.split(".").length === 3 ? this.verifyLimitedLogin(token, options?.nonce) : this.verifyAccessToken(token);
  }

  private async verifyAccessToken(accessToken: string): Promise<SocialProfile> {
    const appToken = `${this.appId}|${this.appSecret}`;
    const debug = (await this.getJson(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`,
    )) as { data?: { is_valid?: boolean; app_id?: string; user_id?: string } };
    const data = debug.data;
    if (!data?.is_valid || data.app_id !== this.appId || !data.user_id) {
      throw unauthorized("Facebook sign-in could not be verified", "invalid_provider_token");
    }
    const me = (await this.getJson(
      `${GRAPH}/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(accessToken)}`,
    )) as { id?: string; name?: string; email?: string; picture?: { data?: { url?: string } } };
    if (me.id !== data.user_id) throw unauthorized("Facebook sign-in could not be verified", "invalid_provider_token");
    return {
      provider: "facebook",
      subject: me.id,
      email: me.email?.toLowerCase() ?? null,
      // Facebook only returns confirmed emails.
      emailVerified: Boolean(me.email),
      name: me.name ?? null,
      picture: me.picture?.data?.url ?? null,
    };
  }

  private async verifyLimitedLogin(idToken: string, nonce?: string): Promise<SocialProfile> {
    let payload;
    try {
      ({ payload } = await jwtVerify(idToken, this.jwks, {
        issuer: ["https://www.facebook.com", "https://limited.facebook.com"],
        audience: this.appId!,
      }));
    } catch {
      throw unauthorized("Facebook sign-in could not be verified", "invalid_provider_token");
    }
    if ((nonce && payload.nonce !== nonce) || !payload.sub) {
      throw unauthorized("Facebook sign-in could not be verified", "invalid_provider_token");
    }
    return {
      provider: "facebook",
      subject: payload.sub,
      email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
      emailVerified: typeof payload.email === "string",
      name: typeof payload.name === "string" ? payload.name : null,
      picture: typeof payload.picture === "string" ? payload.picture : null,
    };
  }

  private async getJson(url: string): Promise<unknown> {
    const res = await this.fetchFn(url);
    if (!res.ok) throw unauthorized("Facebook sign-in could not be verified", "invalid_provider_token");
    return res.json();
  }
}
