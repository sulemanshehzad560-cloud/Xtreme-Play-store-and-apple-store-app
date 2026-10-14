import { useState } from "react";
import { Pressable, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { Button, Card, InlineLoader, Row, Screen, StatusPill, Text } from "@/components/ui";
import { aed, when } from "@/lib/format";
import { SERVICE_ICON } from "@/lib/serviceIcons";
import { colors, fonts, radius, space } from "@/lib/theme";
import type { Booking } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function Bookings() {
  const [scope, setScope] = useState<"active" | "past">("active");
  const { data, loading } = useApi<Booking[]>(`/bookings?scope=${scope}&limit=50`);
  return (
    <Screen>
      <Text variant="title">My bookings</Text>
      <View style={{ flexDirection: "row", backgroundColor: colors.divider, borderRadius: radius.md, padding: 4 }}>
        {(["active", "past"] as const).map((s) => (
          <Pressable
            key={s}
            onPress={() => setScope(s)}
            accessibilityRole="tab"
            accessibilityState={{ selected: scope === s }}
            style={{ flex: 1, paddingVertical: space(2.5), borderRadius: radius.sm, backgroundColor: scope === s ? colors.surface : "transparent", alignItems: "center" }}
          >
            <RNText style={{ fontFamily: scope === s ? fonts.bold : fonts.semibold, color: scope === s ? colors.text : colors.muted }}>{s === "active" ? "Upcoming" : "Past"}</RNText>
          </Pressable>
        ))}
      </View>

      {loading ? <InlineLoader label="Fetching your bookings…" /> : null}
      {!loading && data?.length === 0 ? (
        <Card style={{ alignItems: "center", paddingVertical: space(8) }}>
          <RNText style={{ fontSize: 44 }}>🗓️</RNText>
          <Text variant="heading">{scope === "active" ? "No upcoming bookings" : "No past bookings yet"}</Text>
          <Text variant="muted" style={{ textAlign: "center" }}>
            Book a service in a few taps and track your team live.
          </Text>
          <Button title="Book a service" size="sm" onPress={() => router.push("/(app)/(tabs)")} />
        </Card>
      ) : null}

      {data?.map((b) => (
        <Card key={b.id} onPress={() => router.push(`/booking/${b.id}`)}>
          <Row style={{ alignItems: "flex-start" }}>
            <View style={{ width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" }}>
              <RNText style={{ fontSize: 24 }}>{SERVICE_ICON[b.service.key] ?? "✨"}</RNText>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: fonts.bold }}>{b.service.name}</Text>
              <Text variant="small">{when(b.scheduledAt)}</Text>
              <Text variant="small">{b.reference}</Text>
            </View>
            <StatusPill status={b.status} />
          </Row>
          <Row style={{ justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: space(3), marginTop: space(1) }}>
            <Text style={{ fontFamily: fonts.bold }}>
              {aed(b.priceAed)}
              <Text variant="small"> · {b.paymentStatus === "paid" ? "Paid" : b.paymentStatus === "refunded" ? "Refunded" : b.priceAed == null ? "Survey" : "Unpaid"}</Text>
            </Text>
            {b.trackable ? (
              <Button title="Track" size="sm" onPress={() => router.push(`/booking/${b.id}/track`)} />
            ) : scope === "past" ? (
              <Button title="Book again" size="sm" variant="secondary" onPress={() => router.push(`/service/${b.service.key}`)} />
            ) : null}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
