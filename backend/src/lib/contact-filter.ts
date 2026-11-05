/**
 * Removes contact details from chat messages between customers and the team, so neither side
 * can take the job off Xtreme: phone numbers (including spaced-out, dotted or Arabic-Indic
 * digits), email addresses, and links or handles for WhatsApp, Telegram, Signal, etc.
 * Calls go through Xtreme's masked number instead.
 */

const MASK = "•••";

// Arabic-Indic (٠-٩) and Persian (۰-۹) digits count as digits.
const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

// A run that starts and ends with a digit and contains only digits and common separators.
const DIGIT_RUN = /\+?[0-9٠-٩۰-۹](?:[\s\-.()/_ ]*[0-9٠-٩۰-۹])+/g;
const EMAIL = /[A-Z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[A-Z0-9.-]+\s*(?:\.|\(dot\)|\[dot\])\s*[A-Z]{2,}/gi;
const LINKS = /\b(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|t\.me|telegram\.me|signal\.me|m\.me|instagram\.com|snapchat\.com|facebook\.com|fb\.com)\/\S*/gi;
const HANDLE = /(?:^|\s)@[A-Za-z0-9_.]{3,}/g;

export interface Filtered {
  text: string;
  redacted: boolean;
}

/** Masks anything that looks like contact details. Short numbers (prices, times, unit numbers) are kept. */
export function redactContacts(input: string): Filtered {
  let redacted = false;
  let text = input.replace(LINKS, () => ((redacted = true), MASK)).replace(EMAIL, () => ((redacted = true), MASK));
  text = text.replace(DIGIT_RUN, (run) => {
    const digits = toLatinDigits(run).replace(/\D/g, "");
    // 7+ digits is a phone number in every format used in the UAE (local, mobile, +971, 00971).
    if (digits.length >= 7) {
      redacted = true;
      return MASK;
    }
    return run;
  });
  text = text.replace(HANDLE, (m) => ((redacted = true), m.startsWith(" ") || m.startsWith("\n") ? m[0] + MASK : MASK));
  // Numbers split over several short chunks ("050 123 / 4567", "zero five zero…" in digits).
  const total = toLatinDigits(text).replace(/\D/g, "").length;
  if (!redacted && total >= 9 && /(?:\d\D{1,6}){8}\d/.test(toLatinDigits(text))) {
    text = text.replace(/[0-9٠-٩۰-۹]/g, "•");
    redacted = true;
  }
  return { text, redacted };
}
