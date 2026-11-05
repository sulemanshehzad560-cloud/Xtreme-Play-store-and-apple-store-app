import { useLocalSearchParams } from "expo-router";
import { JobChat } from "@/components/JobChat";
import { t } from "@/lib/i18n";
import type { Booking } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const CALLABLE = ["assigned", "en_route", "arrived", "in_progress"];

/** Staff / supplier ↔ customer chat for a job (numbers stay private). */
export default function StaffChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useApi<Booking>(`/bookings/${id}`);
  const first = job.data?.customer?.fullName?.split(" ")[0];
  return <JobChat bookingId={id} title={first ? t("Chat with {0}", { 0: first }) : t("Chat with the customer")} canCall={!!job.data && CALLABLE.includes(job.data.status)} />;
}
