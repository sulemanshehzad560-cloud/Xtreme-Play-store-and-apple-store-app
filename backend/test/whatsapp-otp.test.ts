import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, resetDb, type TestContext } from "./helpers.js";
import { WhatsAppOtp, type CodeSender } from "../src/modules/auth/whatsapp.js";

class FakeWhatsApp implements CodeSender {
  sent: { to: string; code: string; locale?: string | undefined }[] = [];
  fail = false;
  async sendCode(to: string, code: string, locale?: string) {
    if (this.fail) throw new Error("not on WhatsApp");
    this.sent.push({ to, code, locale });
  }
}

let t: TestContext;
const wa = new FakeWhatsApp();
beforeAll(async () => {
  t = await createTestApp({}, { whatsapp: wa });
});
afterAll(() => t.app.close());
beforeEach(async () => {
  await resetDb();
  wa.sent.length = 0;
  wa.fail = false;
  t.sms.outbox.length = 0;
});

const request = (payload: object) => t.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload });

describe("sign-in codes on WhatsApp", () => {
  it("sends the code on WhatsApp first, and it signs the customer in", async () => {
    const res = await request({ phone: "0501112233", locale: "ar" });
    expect(res.json()).toMatchObject({ phone: "+971501112233", channel: "whatsapp" });
    expect(t.sms.outbox).toHaveLength(0);
    expect(wa.sent[0]).toMatchObject({ to: "+971501112233", locale: "ar" });
    const verify = await t.app.inject({ method: "POST", url: "/v1/auth/otp/verify", payload: { phone: "0501112233", code: wa.sent[0]!.code } });
    expect(verify.statusCode).toBe(200);
  });

  it("falls back to SMS when WhatsApp can't send, and sends SMS when asked", async () => {
    wa.fail = true;
    expect((await request({ phone: "0501112244" })).json().channel).toBe("sms");
    expect(t.sms.outbox.at(-1)!.body).toMatch(/^\d{6} is your Xtreme-Cleaning Partner verification code/);

    wa.fail = false;
    expect((await request({ phone: "0501112255", channel: "sms" })).json().channel).toBe("sms");
    expect(wa.sent).toHaveLength(0);
  });

  it("builds the Meta authentication template message", async () => {
    let call: { url: string; body: Record<string, unknown> } | undefined;
    const http = (async (url: string, init: RequestInit) => {
      call = { url, body: JSON.parse(String(init.body)) };
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const sender = new WhatsAppOtp({ token: "t", phoneNumberId: "123", template: "login_code", languages: { en: "en", ar: "ar" }, apiVersion: "v21.0" }, http);
    await sender.sendCode("+971501112233", "482913", "ar");
    expect(call!.url).toBe("https://graph.facebook.com/v21.0/123/messages");
    expect(call!.body).toMatchObject({
      messaging_product: "whatsapp",
      to: "971501112233",
      type: "template",
      template: { name: "login_code", language: { code: "ar" }, components: [{ type: "body", parameters: [{ text: "482913" }] }, { type: "button", sub_type: "url", parameters: [{ text: "482913" }] }] },
    });
  });
});

describe("WhatsApp login template from the dashboard", () => {
  it("creates an Authentication template with copy code, security note and 5-minute expiry", async () => {
    const { WhatsAppTemplates } = await import("../src/modules/auth/whatsapp.js");
    const calls: { url: string; init?: RequestInit }[] = [];
    const http = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === "POST") return new Response(JSON.stringify({ id: "1", status: "PENDING" }), { status: 200 });
      return new Response(JSON.stringify({ data: [{ name: "login_code", language: "en", status: "APPROVED", rejected_reason: "NONE" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const t = new WhatsAppTemplates({ token: "t", businessAccountId: "999", template: "login_code", apiVersion: "v25.0" }, http);
    expect(await t.status()).toEqual([{ language: "en", status: "APPROVED", reason: null }]);
    expect(await t.create("ar")).toEqual({ language: "ar", status: "PENDING" });
    const body = JSON.parse(String(calls[1]!.init!.body));
    expect(calls[1]!.url).toBe("https://graph.facebook.com/v25.0/999/message_templates");
    expect(body).toMatchObject({
      name: "login_code",
      language: "ar",
      category: "AUTHENTICATION",
      components: [{ type: "BODY", add_security_recommendation: true }, { type: "FOOTER", code_expiration_minutes: 5 }, { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE" }] }],
    });
  });

  it("tells the office what's missing when WhatsApp isn't set up", async () => {
    const { signInAs } = await import("./helpers.js");
    wa.fail = true; // the test sign-in reads its code from the SMS outbox
    const admin = await signInAs(t, "admin");
    const status = (await t.app.inject({ method: "GET", url: "/v1/admin/whatsapp", headers: admin.auth })).json();
    expect(status).toMatchObject({ sending: false, canManageTemplate: false, template: "login_code", languages: ["en"] });
    const res = await t.app.inject({ method: "POST", url: "/v1/admin/whatsapp/login-template", headers: admin.auth, payload: {} });
    expect(res.json().error.code).toBe("whatsapp_not_configured");
  });
});
