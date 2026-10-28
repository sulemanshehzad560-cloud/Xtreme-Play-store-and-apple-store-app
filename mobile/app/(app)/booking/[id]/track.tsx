import { useEffect, useState } from "react";
import { Linking, Pressable, Text as RNText, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LiveMap } from "@/components/LiveMap";
import { Avatar, Button, InlineLoader, Row, StatusPill, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { STAFF_LABEL } from "@/lib/format";
import { useBookingEvents } from "@/lib/realtime";
import { colors, fonts, radius, shadow, space } from "@/lib/theme";
import type { BookingStatus, Company, Tracking } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { LineIcon, iconColor, iconSoft } from "@/components/LineIcon";

const HEADLINE: Partial<Record<BookingStatus, string>> = {
  assigned: "Your team is getting ready",
  arrived: "Your team has arrived",
  in_progress: "Cleaning in progress",
  completed: "All done!",
};

export default function Track() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [t, setT] = useState<Tracking | null>(null);
  const company = useApi<Company>("/company");

  useEffect(() => {
    api<Tracking>(`/bookings/${id}/tracking`).then(setT).catch(() => undefined);
  }, [id]);

  useBookingEvents(id, {
    snapshot: (s: Tracking) => setT(s),
    "staff:location": (p: { lat: number; lng: number; heading: number | null; at: string; etaMinutes: number | null }) =>
      setT((cur) => (cur ? { ...cur, location: { lat: p.lat, lng: p.lng, heading: p.heading, at: p.at, stale: false }, etaMinutes: p.etaMinutes ?? cur.etaMinutes } : cur)),
    "booking:status": () => api<Tracking>(`/bookings/${id}/tracking`).then(setT).catch(() => undefined),
  });

  if (!t) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center" }}>
        <InlineLoader label="Finding your team…" />
      </View>
    );
  }
  const lead = t.team.find((m) => m.isLead) ?? t.team[0];
  const headline = t.status === "en_route" ? (t.etaMinutes != null ? `Arriving in ${t.etaMinutes} min` : "Your team is on the way") : (HEADLINE[t.status] ?? "Your booking");

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LiveMap destination={t.destination} van={t.location} heading={t.location?.heading} />

      <SafeAreaView edges={["top"]} style={{ position: "absolute", left: space(4), top: 0 }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", marginTop: space(2), ...shadow.raised }}>
          <RNText style={{ fontSize: 26, color: colors.text, marginTop: -3 }}>‹</RNText>
        </Pressable>
      </SafeAreaView>

      <SafeAreaView edges={["bottom"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space(5), gap: space(3), ...shadow.raised }}>
        <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: -space(2) }} />
        <Row style={{ justifyContent: "space-between" }}>
          <Text variant="title" style={{ fontSize: 22, flex: 1 }}>
            {headline}
          </Text>
          <StatusPill status={t.status} />
        </Row>
        {t.status === "en_route" ? <EtaBar minutes={t.etaMinutes} /> : null}
        {lead ? (
          <Row>
            <Avatar name={lead.displayName} size={50} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.bold }}>{lead.displayName}</Text>
              <Text variant="small">
                {STAFF_LABEL[lead.status]}
                {t.team.length > 1 ? ` · +${t.team.length - 1} more` : ""}
              </Text>
            </View>
            {company.data ? (
              <Row style={{ gap: space(2) }}>
                <RoundAction glyph="call" label="Call" onPress={() => Linking.openURL(`tel:${company.data!.phone}`)} />
                <RoundAction glyph="chat" label="WhatsApp" onPress={() => Linking.openURL(company.data!.whatsapp)} />
              </Row>
            ) : null}
          </Row>
        ) : (
          <Text variant="muted">We'll show your team here as soon as they're assigned.</Text>
        )}
        {!t.live && t.status !== "completed" ? <Text variant="small">Live location appears once your team sets off.</Text> : null}
        {t.location?.stale ? <Text variant="small" style={{ color: colors.warning }}>Waiting for an updated location…</Text> : null}
        <Button title="View booking details" variant="secondary" size="sm" onPress={() => router.push(`/booking/${id}`)} />
      </SafeAreaView>
    </View>
  );
}

function EtaBar({ minutes }: { minutes: number | null }) {
  const pct = minutes == null ? 0.1 : Math.max(0.08, Math.min(0.95, 1 - minutes / 15));
  return (
    <View style={{ gap: space(1.5) }}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.divider, overflow: "hidden" }}>
        <View style={{ width: `${pct * 100}%`, height: 6, borderRadius: 3, backgroundColor: colors.gold }} />
      </View>
      <Row style={{ justifyContent: "space-between" }}>
        <Text variant="small">Left the depot</Text>
        <Text variant="small">Your door</Text>
      </Row>
    </View>
  );
}

function RoundAction({ glyph, label, onPress }: { glyph: "call" | "chat"; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: iconSoft(glyph), alignItems: "center", justifyContent: "center" }}>
      <LineIcon name={glyph} size={22} color={iconColor(glyph)} />
    </Pressable>
  );
}
