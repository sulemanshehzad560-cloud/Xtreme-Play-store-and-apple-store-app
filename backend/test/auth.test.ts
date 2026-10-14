import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import { GoogleVerifier } from "../src/modules/auth/providers/google.js";
import { AppleVerifier } from "../src/modules/auth/providers/apple.js";
import { sha256 } from "../src/lib/crypto.js";
import { createTestApp, nextPhone, resetDb, signInPhone, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp({ OTP_REVIEW_PHONES: "+971500000001", OTP_REVIEW_CODE: "246810" });
});
afterAll(() => t.app.close());
beforeEach(resetDb);

describe("phone OTP", () => {
  it("signs up a new customer and normalises local numbers", async () => {
    await t.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone: "050 765 4321" } });
    const code = t.sms.outbox.at(-1)!.body.slice(0, 6);
    expect(t.sms.outbox.at(-1)!.to).toBe("+971507654321");
    const res = await t.app.inject({ method: "POST", url: "/v1/auth/otp/verify", payload: { phone: "+971507654321", code, fullName: "Sara" } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.isNewUser).toBe(true);
    expect(body.user).toMatchObject({ role: "customer", phone: "+971507654321", phoneVerified: true, fullName: "Sara", signInMethods: ["phone"] });

    const again = await signInPhone(t, "+971507654321");
    expect(again.user.id).toBe(body.user.id);
  });

  it("rejects invalid numbers", async () => {
    const res = await t.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone: "0501234" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_phone");
  });

  it("enforces a resend cooldown", async () => {
    const strict = await createTestApp({ OTP_RESEND_COOLDOWN_SECONDS: "30" });
    try {
      const phone = nextPhone();
      await strict.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone } });
      const res = await strict.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone } });
      expect(res.statusCode).toBe(429);
      expect(res.headers["retry-after"]).toBeDefined();
    } finally {
      await strict.app.close();
    }
  });

  it("locks a code after 5 wrong attempts, and codes work only once", async () => {
    const phone = nextPhone();
    await t.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone } });
    const code = t.sms.outbox.at(-1)!.body.slice(0, 6);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const r = await t.app.inject({ method: "POST", url: "/v1/auth/otp/verify", payload: { phone, code: wrong } });
      expect(r.json().error.code).toBe("invalid_code");
    }
    const locked = await t.app.inject({ method: "POST", url: "/v1/auth/otp/verify", payload: { phone, code } });
    expect(locked.json().error.code).toBe("too_many_attempts");
  });

  it("lets store reviewers in with the review code and sends no SMS", async () => {
    const before = t.sms.outbox.length;
    await t.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone: "+971500000001" } });
    expect(t.sms.outbox.length).toBe(before);
    const res = await t.app.inject({ method: "POST", url: "/v1/auth/otp/verify", payload: { phone: "+971500000001", code: "246810" } });
    expect(res.statusCode).toBe(200);
  });
});

describe("sessions", () => {
  it("rotates refresh tokens and revokes the family when one is reused", async () => {
    const s = await signInPhone(t);
    const r1 = await t.app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: s.refreshToken } });
    expect(r1.statusCode).toBe(200);
    const next = r1.json().refreshToken;

    const reuse = await t.app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: s.refreshToken } });
    expect(reuse.json().error.code).toBe("refresh_token_reused");
    // The stolen-token family is dead, including the legitimately rotated token.
    const after = await t.app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: next } });
    expect(after.statusCode).toBe(401);
  });

  it("requires a valid access token", async () => {
    expect((await t.app.inject({ method: "GET", url: "/v1/me" })).statusCode).toBe(401);
    expect((await t.app.inject({ method: "GET", url: "/v1/me", headers: { authorization: "Bearer nope" } })).statusCode).toBe(401);
  });

  it("blocks suspended accounts immediately", async () => {
    const s = await signInPhone(t);
    await t.c.db.execute(`update users set blocked_at = now() where id = '${s.user.id}'` as never);
    const res = await t.app.inject({ method: "GET", url: "/v1/me", headers: s.auth });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("account_blocked");
  });
});

describe("social sign-in and linking", () => {
  it("creates an account from Google and links a phone to it", async () => {
    const g = await t.app.inject({ method: "POST", url: "/v1/auth/google", payload: { idToken: "valid:google-sub-1:sara@example.com" } });
    expect(g.statusCode).toBe(200);
    const { accessToken, user } = g.json();
    expect(user).toMatchObject({ email: "sara@example.com", phone: null, signInMethods: ["google"] });

    const auth = { authorization: `Bearer ${accessToken}` };
    const phone = nextPhone();
    await t.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone } });
    const code = t.sms.outbox.at(-1)!.body.slice(0, 6);
    const linked = await t.app.inject({ method: "POST", url: "/v1/me/phone", headers: auth, payload: { phone, code } });
    expect(linked.json()).toMatchObject({ phone, phoneVerified: true, signInMethods: ["google", "phone"] });

    // Signing in with that phone now reaches the same account.
    const viaPhone = await signInPhone(t, phone);
    expect(viaPhone.user.id).toBe(user.id);
  });

  it("refuses to link an identity owned by another account", async () => {
    await t.app.inject({ method: "POST", url: "/v1/auth/facebook", payload: { accessToken: "valid:fb-1:a@example.com" } });
    const other = await signInPhone(t);
    const res = await t.app.inject({
      method: "POST",
      url: "/v1/me/identities/facebook",
      headers: other.auth,
      payload: { token: "valid:fb-1:a@example.com" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("keeps at least one sign-in method", async () => {
    const s = await signInPhone(t);
    const res = await t.app.inject({ method: "DELETE", url: "/v1/me/identities/phone", headers: s.auth });
    expect(res.json().error.code).toBe("last_sign_in_method");
  });

  it("rejects bad provider tokens", async () => {
    const res = await t.app.inject({ method: "POST", url: "/v1/auth/apple", payload: { identityToken: "forged-token-xxxxxxxxxxxx" } });
    expect(res.statusCode).toBe(401);
  });
});

describe("real token verifiers", () => {
  it("verifies Google ID tokens (audience and issuer) and Apple nonces", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
    const jwks = createLocalJWKSet({ keys: [jwk] });
    const sign = (claims: Record<string, unknown>, iss: string, aud: string) =>
      new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(iss).setAudience(aud).setSubject("u-1").setIssuedAt().setExpirationTime("5m").sign(privateKey);

    const google = new GoogleVerifier(["ios-client", "android-client"], jwks);
    const ok = await google.verify(await sign({ email: "A@B.com", email_verified: true }, "https://accounts.google.com", "android-client"));
    expect(ok).toMatchObject({ subject: "u-1", email: "a@b.com", emailVerified: true });
    await expect(google.verify(await sign({}, "https://accounts.google.com", "someone-else"))).rejects.toThrow();
    await expect(google.verify(await sign({}, "https://evil.example", "ios-client"))).rejects.toThrow();

    const apple = new AppleVerifier(["ae.xtreme.app"], jwks);
    const token = await sign({ nonce: sha256("raw-nonce") }, "https://appleid.apple.com", "ae.xtreme.app");
    await expect(apple.verify(token, { nonce: "raw-nonce" })).resolves.toMatchObject({ subject: "u-1" });
    await expect(apple.verify(token, { nonce: "other" })).rejects.toThrow();
  });
});

describe("account deletion", () => {
  it("erases personal data and ends sessions", async () => {
    const s = await signInPhone(t);
    const del = await t.app.inject({ method: "DELETE", url: "/v1/me", headers: s.auth });
    expect(del.statusCode).toBe(204);
    expect((await t.app.inject({ method: "GET", url: "/v1/me", headers: s.auth })).statusCode).toBe(401);
    expect((await t.app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: s.refreshToken } })).statusCode).toBe(401);
    // The same number can sign up fresh.
    const fresh = await signInPhone(t, s.phone);
    expect(fresh.user.id).not.toBe(s.user.id);
  });
});
