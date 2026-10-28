import { REGULAR_RATES, SIZE_LABELS } from "../catalog/catalog.js";

/**
 * Instant answers for "Chat with us". Matches common questions by keyword (English and
 * Arabic); anything else gets an acknowledgement and goes to the office, who reply in the
 * same thread. Kept deliberately simple and predictable: no free-form generation.
 */
interface Rule {
  topic: string;
  match: RegExp;
  answer: (ctx: BotContext) => string;
}

export interface BotContext {
  whatsappDisplay: string;
  tamaraFeePercent: number;
}

const rates = () =>
  Object.entries(REGULAR_RATES)
    .map(([k, r]) => `• ${SIZE_LABELS[k] ?? k}: AED ${r.priceAed} (${r.minutes < 60 ? `${r.minutes} min` : `${r.minutes / 60} hr${r.minutes > 60 ? "s" : ""}`}, ${r.cleaners} cleaners)`)
    .join("\n");

const RULES: Rule[] = [
  {
    topic: "materials",
    match: /material|supplies|product|chemical|equipment|bring|مواد/i,
    answer: () => "All cleaning materials and equipment are included free of cost. Our team brings everything needed.",
  },
  {
    topic: "price",
    match: /price|cost|how much|rate|charge|fee|cheap|expensive|aed|سعر|كم/i,
    answer: () =>
      `Regular cleaning of apartments (per visit, VAT and materials included):\n${rates()}\n\nVillas, offices, restaurants, deep cleaning and specialist services (sofa, carpet, kitchen and more) are priced by our team on a site visit. You get the quote in the app and pay there.`,
  },
  {
    topic: "deep",
    match: /deep|move.?in|move.?out|empty|occupied/i,
    answer: () =>
      "Deep cleaning is quoted on site: the price depends on the property and whether it is empty or occupied. Book a visit in the app; our team inspects, sends the quote to your app, and you pay securely before the work starts.",
  },
  {
    topic: "area",
    match: /area|where|location|cover|serve|reem|abu dhabi|dubai|sharjah|منطقة|أين/i,
    answer: () => "We currently serve Abu Dhabi city and Al Reem Island. The app checks your address when you book.",
  },
  {
    topic: "repeat",
    match: /weekly|bi-?weekly|every week|regular|repeat|recurring|contract|monthly|yearly|plan/i,
    answer: () =>
      "Regular cleaning can be one-time, weekly or bi-weekly: choose it when you book. Each next visit is set up automatically and you pay it in the app. We also have monthly and yearly plans under Home → Plans.",
  },
  {
    topic: "payment",
    match: /pay|card|apple pay|google pay|tamara|instal|cash|دفع/i,
    answer: (c) =>
      `You pay securely in the app by card, Apple Pay or Google Pay (no extra fees), or in ${4} interest-free instalments with Tamara (a ${c.tamaraFeePercent}% Tamara fee applies). Bookings are confirmed as soon as payment goes through.`,
  },
  {
    topic: "cancel",
    match: /cancel|refund|reschedul|change.*(time|date)|postpone|إلغاء/i,
    answer: () =>
      "You can reschedule or cancel from the booking in the app until your team sets off. Paid bookings are refunded automatically to your original payment method (5–10 working days).",
  },
  {
    topic: "time",
    match: /time|hour|open|when|today|tomorrow|available|slot|موعد|وقت/i,
    answer: () => "We work 7 days a week with start times from 8:00 AM to 6:00 PM. You can book for today too, from 1 hour ahead, right in the app.",
  },
  {
    topic: "book",
    match: /book|order|reserve|schedule|حجز/i,
    answer: () => "Tap a service on the Home screen, choose your property, pick a date and time, add your address and pay. It takes about a minute.",
  },
  {
    topic: "greeting",
    match: /^\s*(hi|hello|hey|salam|salaam|good (morning|afternoon|evening)|مرحبا|السلام)\b/i,
    answer: () => "Hello and welcome to Xtreme-Cleaning Partner! Ask me about prices, booking, payment or our areas, or type your question for our team.",
  },
];

export const HANDOFF = (c: BotContext) =>
  `Thanks for your message! Our team will reply here shortly (8 AM to 8 PM, 7 days a week). For anything urgent, WhatsApp us on ${c.whatsappDisplay}.`;

/** The instant answer for a customer's message, or null when only the office can help. */
export function botAnswer(text: string, ctx: BotContext): { topic: string; body: string } | null {
  if (/agent|human|person|staff|call me|manager|complain|موظف/i.test(text)) return null;
  const rule = RULES.find((r) => r.match.test(text));
  return rule ? { topic: rule.topic, body: rule.answer(ctx) } : null;
}
