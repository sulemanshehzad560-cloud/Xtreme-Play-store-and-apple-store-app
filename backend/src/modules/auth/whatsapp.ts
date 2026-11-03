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
