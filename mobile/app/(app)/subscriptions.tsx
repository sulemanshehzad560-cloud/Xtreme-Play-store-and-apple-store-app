import { useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { router } from "expo-router";
import { ServiceIcon } from "@/components/art/ServiceIcon";
import { SlotPicker, abuDhabiTime, firstOpenDay, nextDays } from "@/components/SlotPicker";
import { Button, Card, Divider, ErrorText, InlineLoader, Row, Screen, StatusPill, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { aed, when } from "@/lib/format";
import { colors, fonts, radius, space } from "@/lib/theme";
import type { Booking, Subscription } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const STATUS: Record<Subscription["status"], { label: string; color: string; bg: string }> = {
  pending_payment: { label: "Awaiting payment", color: colors.warning, bg: colors.warningSoft },
  active: { label: "Active", color: colors.success, bg: colors.successSoft },
  expired: { label: "Ended", color: colors.muted, bg: colors.divider },
  cancelled: { label: "Cancelled", color: colors.danger, bg: colors.dangerSoft },
};
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default function MySubscriptions() {
  const subs = useApi<Subscription[]>("/me/subscriptions");

  return (
    <Screen edges={["left", "right"]}>
      {!subs.data ? <InlineLoader label="Loading your plans…" /> : null}
      {subs.data?.length === 0 ? (
        <Card tone="gold">
          <Text variant="heading">No plan yet</Text>
          <Text variant="small">Regular cleaning on a monthly or yearly plan, with the same trusted team.</Text>
          <Button title="See cleaning plans" onPress={() => router.push("/plans")} />
        </Card>
      ) : null}
      {subs.data?.map((s) => <SubscriptionCard key={s.id} sub={s} onChange={subs.reload} />)}
      {subs.data?.length ? <Button title="Browse all plans" variant="secondary" onPress={() => router.push("/plans")} /> : null}
    </Screen>
  );
}

function SubscriptionCard({ sub, onChange }: { sub: Subscription; onChange: () => void }) {
  const days = useMemo(() => nextDays(21), []);
  const [mode, setMode] = useState<"none" | "visit" | "renew">("none");
  const [d, setD] = useState(() => firstOpenDay(days));
  const [hour, setHour] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const st = STATUS[sub.status];
  const used = sub.visitsPerPeriod ? sub.visitsUsed / sub.visitsPerPeriod : 0;

  async function confirm() {
    if (hour == null) return setError("Pick a time");
    setBusy(true);
    setError(null);
    try {
      if (mode === "visit") {
        const b = await api<Booking>(`/subscriptions/${sub.id}/visits`, { body: { scheduledAt: abuDhabiTime(d, hour) } });
        setMode("none");
        onChange();
        router.push(`/booking/${b.id}?new=1`);
      } else {
        const r = await api<{ paymentBookingId: string }>(`/subscriptions/${sub.id}/renew`, { body: { firstVisitAt: abuDhabiTime(d, hour) } });
        setMode("none");
        router.push(`/booking/${r.paymentBookingId}/pay`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    Alert.alert("Cancel this plan?", "It has not been paid yet, so nothing is charged.", [
      { text: "Keep" },
      {
        text: "Cancel plan",
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
          <Text variant="heading">{sub.planName}</Text>
          <Text variant="small">
            {sub.reference} · {aed(sub.priceAed)} {sub.interval === "monthly" ? "a month" : "a year"}
          </Text>
        </View>
        <View style={{ backgroundColor: st.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Text style={{ color: st.color, fontFamily: fonts.bold, fontSize: 12 }}>{st.label}</Text>
        </View>
      </Row>

      {sub.status === "active" ? (
        <>
          <Row style={{ justifyContent: "space-between" }}>
            <Text variant="small">
              Visits used: <Text style={{ fontFamily: fonts.bold }}>{sub.visitsUsed}</Text> of {sub.visitsPerPeriod}
            </Text>
            <Text variant="small">Until {day(sub.currentPeriodEnd)}</Text>
          </Row>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.divider, overflow: "hidden" }}>
            <View style={{ width: `${Math.min(100, used * 100)}%`, height: "100%", backgroundColor: colors.goldBright }} />
          </View>
        </>
      ) : null}
      {sub.status === "expired" ? <Text variant="small">Your plan ended on {day(sub.currentPeriodEnd)}. Renew to keep your regular visits.</Text> : null}
      <Text variant="small">
        📍 {[sub.address.unit, sub.address.building, sub.address.area].filter(Boolean).join(", ")}
      </Text>

      {sub.paymentBookingId ? <Button title="Pay to activate" variant="gold" onPress={() => router.push(`/booking/${sub.paymentBookingId}/pay`)} /> : null}
      {mode === "none" ? (
        <Row style={{ gap: space(2) }}>
          {sub.canBookVisit ? <Button title="Book a visit" style={{ flex: 1 }} onPress={() => setMode("visit")} /> : null}
          {sub.canRenew && sub.status !== "pending_payment" ? <Button title={sub.status === "active" ? "Pay next period" : "Renew"} variant="secondary" style={{ flex: 1 }} onPress={() => setMode("renew")} /> : null}
          {sub.canCancel ? <Button title="Cancel" variant="secondary" style={{ flex: 1 }} onPress={cancel} /> : null}
        </Row>
      ) : (
        <View style={{ gap: space(3) }}>
          <Divider />
          <Text style={{ fontFamily: fonts.bold }}>{mode === "visit" ? "Book an included visit" : `Renew: first visit of the next ${sub.interval === "monthly" ? "month" : "year"}`}</Text>
          <SlotPicker days={days} day={d} onDay={setD} hour={hour} onHour={setHour} />
          <ErrorText error={error} />
          <Row style={{ gap: space(2) }}>
            <Button title="Back" variant="secondary" style={{ flex: 1 }} onPress={() => setMode("none")} />
            <Button title={mode === "visit" ? "Book visit" : `Renew · ${aed(sub.priceAed)}`} style={{ flex: 1.4 }} loading={busy} onPress={confirm} />
          </Row>
        </View>
      )}

      {sub.visits.length ? (
        <>
          <Divider />
          <Text variant="label">VISITS</Text>
          {sub.visits.slice(0, 5).map((v) => (
            <Row key={v.id} style={{ justifyContent: "space-between" }}>
              <Text style={{ fontSize: 14, flex: 1 }} onPress={() => router.push(`/booking/${v.id}`)}>
                {when(v.scheduledAt)}{v.included ? "" : " · first visit (paid)"}
              </Text>
              <StatusPill status={v.status} />
            </Row>
          ))}
        </>
      ) : null}
    </Card>
  );
}
