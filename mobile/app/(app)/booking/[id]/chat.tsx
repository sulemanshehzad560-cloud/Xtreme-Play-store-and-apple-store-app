import { useLocalSearchParams } from "expo-router";
import { JobChat } from "@/components/JobChat";
import { t } from "@/lib/i18n";
import type { Booking } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const CALLABLE = ["assigned", "en_route", "arrived", "in_progress"];

/** Customer ↔ team chat for a booking (numbers stay private). */
export default function BookingChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const b = useApi<Booking>(`/bookings/${id}`);
  const lead = b.data?.team.find((m) => m.isLead) ?? b.data?.team[0];
  return <JobChat bookingId={id} title={lead ? t("Chat with {0}", { 0: lead.displayName }) : t("Chat with your team")} canCall={!!b.data && CALLABLE.includes(b.data.status)} />;
}
