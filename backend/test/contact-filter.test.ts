import { describe, expect, it } from "vitest";
import { redactContacts } from "../src/lib/contact-filter.js";

describe("contact filter", () => {
  it.each([
    "Call me on 0501234567",
    "my number +971 50 123 4567",
    "00971-50-123-4567 thanks",
    "whatsapp ٠٥٠١٢٣٤٥٦٧",
    "reach me at sara.k@gmail.com",
    "sara (at) gmail (dot) com",
    "https://wa.me/971501234567",
    "add me on t.me/sarak",
    "insta @sara_cleaning",
    "050 123 / 45 67",
    "0 5 0 1 2 3 4 5 6 7",
  ])("masks contact details: %s", (msg) => {
    const r = redactContacts(msg);
    expect(r.redacted).toBe(true);
    expect(r.text).not.toMatch(/\d{3,}/);
    expect(r.text).not.toMatch(/gmail|wa\.me|t\.me|@sara/);
  });

  it.each(["See you at 10:30 tomorrow", "Flat 1204, tower B", "The sofa is 3 seats, 2 cushions", "Price AED 250", "I'll be there in 15 minutes"])(
    "keeps ordinary messages: %s",
    (msg) => {
      expect(redactContacts(msg)).toEqual({ text: msg, redacted: false });
    },
  );
});
