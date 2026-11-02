import type { BookingStatus, StaffStatus } from "./types";
import { dateLocale, lang, t, translated } from "./i18n";

const TZ = "Asia/Dubai";

export const when = (iso: string) =>
  new Intl.DateTimeFormat(dateLocale(), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));

export const aed = (n: number | null) =>
  n == null
    ? t("Price on quote")
    : t("AED {0}", { 0: n.toLocaleString("en-US", Number.isInteger(n) ? undefined : { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });

/** True while the app is in Arabic (right-to-left). */
export const rtl = () => lang() === "ar";

export const STATUS_LABEL: Record<BookingStatus, string> = translated({
  requested: "Requested",
  confirmed: "Confirmed",
  assigned: "Team assigned",
  en_route: "On the way",
  arrived: "Arrived",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
});

export const STAFF_LABEL: Record<StaffStatus, string> = translated({
  off_duty: "Off duty",
  available: "Available",
  en_route: "On the way to a job",
  on_job: "On a job",
  on_break: "On a break",
});

export const SIZE_LABEL: Record<string, string> = translated({
  studio: "Studio",
  "1bhk": "1 BHK",
  "2bhk": "2 BHK",
  "3bhk": "3 BHK",
  "4bhk": "4 BHK",
  "5bhk": "5 BHK",
  "6bhk": "6 BHK",
  small: "Small office",
  medium: "Medium office",
  large: "Large office",
});
