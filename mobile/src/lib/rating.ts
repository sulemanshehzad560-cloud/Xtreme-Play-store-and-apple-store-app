import type { Service } from "./types";

/** "★ 4.8 (187)" when reviewed, otherwise "New". */
export function ratingLabel(s: Pick<Service, "rating" | "reviewCount">) {
  return s.rating != null && s.reviewCount > 0 ? `★ ${s.rating.toFixed(1)} (${s.reviewCount})` : "New";
}
