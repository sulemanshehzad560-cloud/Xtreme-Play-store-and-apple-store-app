import type { BookingStatus, StaffStatus } from "./types";

const TZ = "Asia/Dubai";

export const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));

export const aed = (n: number | null) => (n == null ? "Price after survey" : `AED ${n.toLocaleString("en-US")}`);

export const STATUS_LABEL: Record<BookingStatus, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  assigned: "Team assigned",
  en_route: "On the way",
  arrived: "Arrived",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const STAFF_LABEL: Record<StaffStatus, string> = {
  off_duty: "Off duty",
  available: "Available",
  en_route: "On the way to a job",
  on_job: "On a job",
  on_break: "On a break",
};

export const SIZE_LABEL: Record<string, string> = {
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
};
