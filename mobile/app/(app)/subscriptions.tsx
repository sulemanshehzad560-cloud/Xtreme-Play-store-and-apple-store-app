import { useState } from "react";
import { Alert, View } from "react-native";
import { router } from "expo-router";
import { ServiceIcon } from "@/components/art/ServiceIcon";
import { abuDhabiTime } from "@/components/SlotPicker";
import { MonthCalendar, fromKey, isoDayKey } from "@/components/MonthCalendar";
import { Button, Card, Divider, ErrorText, InlineLoader, Row, Screen, StatusPill, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { aed, when } from "@/lib/format";
import { colors, fonts, radius, space } from "@/lib/theme";
import type { Booking, Subscription } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { dateLocale, t } from "@/lib/i18n";

const STATUS: Record<Subscription["status"], { label: string; color: string; bg: string }> = {
  pending_payment: { label: "Awaiting payment", color: colors.warning, bg: colors.warningSoft },
  active: { label: "Active", color: colors.success, bg: colors.successSoft },
  expired: { label: "Ended", color: colors.muted, bg: colors.divider },
  cancelled: { label: "Cancelled", color: colors.danger, bg: colors.dangerSoft },
};
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(dateLocale(), { day: "numeric", month: "short", year: "numeric" }) : "—");

export default function MySubscriptions() {
  const subs = useApi<Subscription[]>("/me/subscriptions");

  return (
    <Screen edges={["left", "right"]}>
      {!subs.data ? <InlineLoader label={t("Loading your plans…")} /> : null}
      {subs.data?.length === 0 ? (
        <Card tone="gold">
          <Text variant="heading">{t("No plan yet")}</Text>
          <Text variant="small">{t("Regular cleaning on a monthly or yearly plan, with the same trusted team.")}</Text>
          <Button title={t("See cleaning plans")} onPress={() => router.push("/plans")} />
        </Card>
      ) : null}
      {subs.data?.map((s) => <SubscriptionCard key={s.id} sub={s} onChange={subs.reload} />)}
      {subs.data?.length ? <Button title={t("Browse all plans")} variant="secondary" onPress={() => router.push("/plans")} /> : null}
    </Screen>
  );
}

function SubscriptionCard({ sub, onChange }: { sub: Subscription; onChange: () => void }) {
  const [mode, setMode] = useState<"none" | "visit" | "renew">("none");
  const [picked, setPicked] = useState<string[]>([]);
  const [hour, setHour] = useState<number | null>(null);
  const booked = Object.fromEntries(sub.visits.filter((v) => v.status !== "cancelled").map((v) => [isoDayKey(v.scheduledAt), v.status]));
  const perMonth = sub.visitsPerMonth ?? Math.max(1, Math.round(sub.visitsPerPeriod / (sub.interval === "monthly" ? 1 : 12)));
  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : new Date(Date.now() + 30 * 86_400_000);
  const upcoming = [...sub.visits].filter((v) => v.status !== "cancelled").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const st = STATUS[sub.status];
  const used = sub.visitsPerPeriod ? sub.visitsUsed / sub.visitsPerPeriod : 0;

  async function confirm() {
    if (!picked.length) return setError(t("Tap the days you want"));
    if (hour == null) return setError(t("Pick a start time"));
    const times = [...picked].sort().map((k) => abuDhabiTime(fromKey(k), hour));
    setBusy(true);
    setError(null);
    try {
      if (mode === "visit") {
        const booked = await api<Booking[]>(`/subscriptions/${sub.id}/schedule`, { body: { visits: times } });
        setMode("none");
        setPicked([]);
        onChange();
        Alert.alert(booked.length > 1 ? t("{0} visits booked", { 0: booked.length }) : t("Visit booked"), t("You'll find them in your calendar and in Bookings."));
      } else {
        const r = await api<{ paymentBookingId: string }>(`/subscriptions/${sub.id}/renew`, { body: { firstVisitAt: times[0], moreVisits: times.slice(1) } });
        setMode("none");
        setPicked([]);
        router.push(`/booking/${r.paymentBookingId}/pay`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    Alert.alert(t("Cancel this plan?"), t("It has not been paid yet, so nothing is charged."), [
      { text: t("Keep") },
      {
        text: t("Cancel plan"),
        style: "destructive",
        onPress: () => api(`/subscriptions/${sub.id}/cancel`, { body: {} }).then(onChange, (e: Error) => Alert.alert("Could not cancel", e.message)),
      },
    ]);
  }

  return (
    <Card>
      <Row style={{ alignItems: "flex-start", gap: space(3) }}>
        <View style={{ width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" }}>
          <ServiceIcon name={sub.service.key} size={40} tile={false} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading">{t(sub.planName)}</Text>
          <Text variant="small">
            {sub.reference} · {aed(sub.priceAed)} {sub.interval === "monthly" ? t("a month") : t("a year")}
          </Text>
        </View>
        <View style={{ backgroundColor: st.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Text style={{ color: st.color, fontFamily: fonts.bold, fontSize: 12 }}>{t(st.label)}</Text>
        </View>
      </Row>

      {sub.status === "active" ? (
        <>
          <Row style={{ justifyContent: "space-between" }}>
            <Text variant="small">
              {t("Visits used:")}{" "}<Text style={{ fontFamily: fonts.bold }}>{sub.visitsUsed}</Text>{" "}{t("of")}{" "}{sub.visitsPerPeriod}
            </Text>
            <Text variant="small">{t("Until")}{" "}{day(sub.currentPeriodEnd)}</Text>
          </Row>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.divider, overflow: "hidden" }}>
            <View style={{ width: `${Math.min(100, used * 100)}%`, height: "100%", backgroundColor: colors.goldBright }} />
          </View>
        </>
      ) : null}
      {sub.status === "expired" ? <Text variant="small">{t("Your plan ended on")}{" "}{day(sub.currentPeriodEnd)}{t(". Renew to keep your regular visits.")}</Text> : null}
      <Text variant="small">
        {[sub.address.unit, sub.address.building, sub.address.area && t(sub.address.area)].filter(Boolean).join(", ")}
      </Text>

      {sub.paymentBookingId ? <Button title={t("Pay to activate")} variant="gold" onPress={() => router.push(`/booking/${sub.paymentBookingId}/pay`)} /> : null}
      {mode === "none" ? (
        <Row style={{ gap: space(2) }}>
          {sub.canBookVisit ? <Button title={sub.visitsLeft > 1 ? t("Plan visits") : t("Book a visit")} style={{ flex: 1 }} onPress={() => setMode("visit")} /> : null}
          {sub.canRenew && sub.status !== "pending_payment" ? <Button title={sub.status === "active" ? t("Pay next period") : t("Renew")} variant="secondary" style={{ flex: 1 }} onPress={() => setMode("renew")} /> : null}
          {sub.canCancel ? <Button title={t("Cancel")} variant="secondary" style={{ flex: 1 }} onPress={cancel} /> : null}
        </Row>
      ) : (
        <View style={{ gap: space(3) }}>
          <Divider />
          <Text style={{ fontFamily: fonts.bold }}>
            {mode === "visit" ? t("Pick your visits ({0} left until {1})", { 0: sub.visitsLeft, 1: day(sub.currentPeriodEnd) }) : t("Plan your next {0}: the first visit is paid now", { 0: sub.interval === "monthly" ? "month" : "period" })}
          </Text>
          <MonthCalendar
            selected={picked}
            onChange={setPicked}
            max={mode === "visit" ? sub.visitsLeft : perMonth}
            until={mode === "visit" ? periodEnd : new Date(Date.now() + 30 * 86_400_000)}
            hour={hour}
            onHour={setHour}
            booked={booked}
            firstLabel={mode === "renew" ? t("PAID") : undefined}
          />
          <ErrorText error={error} />
          <Row style={{ gap: space(2) }}>
            <Button title={t("Back")} variant="secondary" style={{ flex: 1 }} onPress={() => setMode("none")} />
            <Button
              title={mode === "visit" ? t("Book {0} visit{1}", { 0: picked.length || "", 1: picked.length === 1 ? "" : "s" }).replace("  ", " ") : t("Renew · {0}", { 0: aed(sub.priceAed) })}
              style={{ flex: 1.4 }}
              loading={busy}
              disabled={!picked.length || hour == null}
              onPress={confirm}
            />
          </Row>
        </View>
      )}

      {sub.plannedVisits?.length ? (
        <Text variant="small">
          {sub.plannedVisits.length}{" "}{t("more visit")}{sub.plannedVisits.length > 1 ? "s" : ""}{" "}{t("planned (")}
          {sub.plannedVisits.map((iso) => new Date(iso).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" })).join(", ")}{t("); booked as soon as you pay.")}
        </Text>
      ) : null}
      {upcoming.length ? (
        <>
          <Divider />
          <Text variant="label">{t("YOUR VISITS")}</Text>
          {upcoming.map((v) => (
            <Row key={v.id} style={{ justifyContent: "space-between" }}>
              <Text style={{ fontSize: 14, flex: 1 }} onPress={() => router.push(`/booking/${v.id}`)}>
                {when(v.scheduledAt)}
                {v.included ? "" : t(" · paid visit")}
              </Text>
              <StatusPill status={v.status} />
            </Row>
          ))}
        </>
      ) : null}
    </Card>
  );
}
