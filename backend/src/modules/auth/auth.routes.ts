import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Container } from "../../container.js";
import { normalizePhone } from "../../lib/phone.js";
import { otpCode, phoneInput } from "../../lib/schemas.js";

const client = (req: FastifyRequest) => ({ ip: req.ip, userAgent: req.headers["user-agent"] });
const tags = ["auth"];

export async function authRoutes(app: FastifyInstance, c: Container) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const strict = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  r.get("/auth/providers", { schema: { tags, summary: "Sign-in methods enabled on this server" } }, async () => ({
    providers: c.auth.enabledProviders(),
  }));

  r.post(
    "/auth/otp/request",
    { ...strict, schema: { tags, summary: "Text a 6-digit code to a mobile number", body: z.object({ phone: phoneInput }) } },
    async (req) => {
      const phone = normalizePhone(req.body.phone, c.env.OTP_DEFAULT_REGION);
      return { phone, ...(await c.otp.request(phone, req.ip)) };
    },
  );

  r.post(
    "/auth/otp/verify",
    {
      ...strict,
      schema: {
        tags,
        summary: "Sign in (or sign up) with the texted code",
        body: z.object({ phone: phoneInput, code: otpCode, fullName: z.string().trim().min(2).max(80).optional() }),
      },
    },
    async (req) => {
      const phone = normalizePhone(req.body.phone, c.env.OTP_DEFAULT_REGION);
      return c.auth.signInWithPhone(phone, req.body.code, client(req), { fullName: req.body.fullName });
    },
  );

  r.post(
    "/auth/staff/login",
    {
      ...strict,
      schema: {
        tags,
        summary: "Staff sign-in with the Staff ID and password set by an admin",
        body: z.object({ staffId: z.string().trim().min(1).max(40), password: z.string().min(1).max(200) }),
      },
    },
    async (req) => c.auth.signInStaff(req.body.staffId, req.body.password, client(req)),
  );

  r.post(
    "/auth/google",
    { ...strict, schema: { tags, summary: "Sign in with a Google ID token", body: z.object({ idToken: z.string().min(20) }) } },
    async (req) => c.auth.signInWithSocial("google", req.body.idToken, client(req)),
  );

  r.post(
    "/auth/facebook",
    {
      ...strict,
      schema: {
        tags,
        summary: "Sign in with a Facebook access token (or Limited Login token on iOS)",
        body: z.object({ accessToken: z.string().min(20), nonce: z.string().max(200).optional() }),
      },
    },
    async (req) => c.auth.signInWithSocial("facebook", req.body.accessToken, client(req), { nonce: req.body.nonce }),
  );

  r.post(
    "/auth/apple",
    {
      ...strict,
      schema: {
        tags,
        summary: "Sign in with Apple",
        body: z.object({
          identityToken: z.string().min(20),
          nonce: z.string().max(200).optional(),
          fullName: z.string().trim().max(80).optional(),
        }),
      },
    },
    async (req) =>
      c.auth.signInWithSocial("apple", req.body.identityToken, client(req), {
        nonce: req.body.nonce,
        fullName: req.body.fullName || undefined,
      }),
  );

  r.post(
    "/auth/refresh",
    { schema: { tags, summary: "Swap a refresh token for new tokens", body: z.object({ refreshToken: z.string().min(20) }) } },
    async (req) => c.auth.refresh(req.body.refreshToken, client(req)),
  );

  r.post(
    "/auth/logout",
    { schema: { tags, summary: "End this device's session", body: z.object({ refreshToken: z.string().min(20) }) } },
    async (req, reply) => {
      await c.auth.signOut(req.body.refreshToken);
      return reply.status(204).send();
    },
  );
}
