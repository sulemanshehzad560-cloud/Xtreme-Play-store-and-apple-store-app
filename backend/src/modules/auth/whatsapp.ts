/**
 * Sends sign-in codes as a WhatsApp "authentication" template message through Meta's
 * WhatsApp Cloud API. The template (default name "login_code") must be an approved
 * Authentication template with a "Copy code" button.
 */
export interface CodeSender {
  sendCode(to: string, code: string, locale?: string): Promise<void>;
}

export interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
  template: string;
  /** Template language per app language; falls back to the English one. */
  languages: { en: string; ar?: string | undefined };
  apiVersion: string;
}

export class WhatsAppOtp implements CodeSender {
  constructor(
    private readonly config: WhatsAppConfig,
    private readonly http: typeof fetch = fetch,
  ) {}

  async sendCode(to: string, code: string, locale?: string) {
    const lang = locale === "ar" && this.config.languages.ar ? this.config.languages.ar : this.config.languages.en;
    const res = await this.http(`https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: this.config.template,
          language: { code: lang },
          components: [
            { type: "body", parameters: [{ type: "text", text: code }] },
            // The "Copy code" button carries the code too.
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
          ],
        },
      }),
    });
    if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
}

export interface TemplateState {
  language: string;
  status: string;
  reason?: string | null;
}

/**
 * Manages the sign-in code template through Meta's API, so the office can create it from the
 * dashboard even when WhatsApp Manager's website refuses (it often does on phones).
 */
export class WhatsAppTemplates {
  constructor(
    private readonly config: { token: string; businessAccountId: string; template: string; apiVersion: string },
    private readonly http: typeof fetch = fetch,
  ) {}

  private url(query = "") {
    return `https://graph.facebook.com/${this.config.apiVersion}/${this.config.businessAccountId}/message_templates${query}`;
  }

  private async call(url: string, init?: RequestInit) {
    const res = await this.http(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.config.token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { data?: unknown[]; id?: string; status?: string; error?: { message?: string; error_user_msg?: string } };
    if (!res.ok) throw new Error(body.error?.error_user_msg || body.error?.message || `Meta returned ${res.status}`);
    return body;
  }

  /** Status of the login template in each language (APPROVED, PENDING, REJECTED…). */
  async status(): Promise<TemplateState[]> {
    const body = await this.call(this.url(`?name=${encodeURIComponent(this.config.template)}&fields=name,language,status,rejected_reason&limit=20`));
    return ((body.data ?? []) as { name: string; language: string; status: string; rejected_reason?: string }[])
      .filter((t) => t.name === this.config.template)
      .map((t) => ({ language: t.language, status: t.status, reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null }));
  }

  /** Creates the Authentication template with a "Copy code" button, a security note and a 5-minute expiry. */
  async create(language: string): Promise<TemplateState> {
    const body = await this.call(this.url(), {
      method: "POST",
      body: JSON.stringify({
        name: this.config.template,
        language,
        category: "AUTHENTICATION",
        message_send_ttl_seconds: 300,
        components: [
          { type: "BODY", add_security_recommendation: true },
          { type: "FOOTER", code_expiration_minutes: 5 },
          { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE" }] },
        ],
      }),
    });
    return { language, status: body.status ?? "PENDING" };
  }
}
