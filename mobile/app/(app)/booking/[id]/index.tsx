import { useState } from "react";
import { Alert, Linking, Pressable, Text as RNText, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Avatar, Button, Card, Divider, InlineLoader, Notice, Row, Screen, StatusPill, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { aed, SIZE_LABEL, STAFF_LABEL, when } from "@/lib/format";
import { useBookingEvents } from "@/lib/realtime";
import { SERVICE_ICON } from "@/lib/serviceIcons";
import { colors, fonts, radius, space } from "@/lib/theme";
import type { Booking, BookingStatus, Company } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const FLOW: [BookingStatus, string][] = [
  ["requested", "Booking received"],
  ["confirmed", "Confirmed"],
  ["assigned", "Team assigned"],
  ["en_route", "On the way"],
  ["arrived", "Arrived"],
  ["in_progress", "Cleaning in progress"],
  ["completed", "Completed"],
];

const PAYMENT_LABEL: Record<Booking["paymentStatus"], string> = {
  unpaid: "Not paid yet",
  pending: "Payment in progress",
  paid: "Paid",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
};

export default function BookingDetail() {
  const { id, new: isNew } = useLocalSearchParams<{ id: string; new?: string }>();
  const { data: b, reload } = useApi<Booking>(`/bookings/${id}`);
  const company = useApi<Company>("/company");
  const [rating, setRating] = useState(0);
  useBookingEvents(id, { "booking:status": () => void reload() });

  if (!b) {
    return (
      <Screen edges={["left", "right"]}>
        <InlineLoader label="Fetching your booking…" />
      </Screen>
    );
  }

  const reached = FLOW.findIndex(([s]) => s === b.status);
  const lead = b.team.find((m) => m.isLead) ?? b.team[0];

  const cancel = () =>
    Alert.alert("Cancel this booking?", b.paymentStatus === "paid" ? "You'll get a full refund to your original payment method." : "You can book again any time.", [
      { text: "Keep booking", style: "cancel" },
      {
        text: "Cancel booking",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/bookings/${b.id}/cancel`, { body: {} });
            await reload();
          } catch (e) {
            Alert.alert("Could not cancel", e instanceof Error ? e.message : "");
          }
        },
      },
    ]);

  return (
    <Screen edges={["left", "right"]}>
      {isNew ? <Notice>🎉 Booking confirmed! We'll notify you at every step.</Notice> : null}

      <Card>
        <Row style={{ alignItems: "flex-start" }}>
          <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" }}>
            <RNText style={{ fontSize: 28 }}>{SERVICE_ICON[b.service.key] ?? "✨"}</RNText>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="heading">{b.service.name}</Text>
            <Text variant="small">
              {when(b.scheduledAt)} · {b.reference}
            </Text>
            <StatusPill status={b.status} />
          </View>
        </Row>
        {b.trackable ? <Button title="📍  Track your team live" onPress={() => router.push(`/booking/${b.id}/track`)} /> : null}
      </Card>

      {b.status !== "cancelled" ? (
        <Card>
          <Text variant="heading">Status</Text>
          {FLOW.map(([s, label], i) => {
            const done = i <= reached;
            const current = i === reached;
            return (
              <Row key={s} style={{ alignItems: "flex-start", gap: space(3) }}>
                <View style={{ alignItems: "center", width: 22 }}>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: done ? (current ? colors.gold : colors.ink) : colors.surface,
                      borderWidth: 2,
                      borderColor: done ? (current ? colors.gold : colors.ink) : colors.border,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {done && !current ? <RNText style={{ color: "#fff", fontSize: 11, fontFamily: fonts.bold }}>✓</RNText> : null}
                  </View>
                  {i < FLOW.length - 1 ? <View style={{ width: 2, height: 18, backgroundColor: i < reached ? colors.ink : colors.border }} /> : null}
                </View>
                <Text style={{ fontFamily: current ? fonts.bold : fonts.medium, color: done ? colors.text : colors.faint, fontSize: 15 }}>{label}</Text>
              </Row>
            );
          })}
        </Card>
      ) : (
        <Notice>This booking was cancelled{b.paymentStatus === "refunded" ? " and your payment was refunded" : ""}.</Notice>
      )}

      {lead ? (
        <Card>
          <Text variant="heading">Your professional</Text>
          <Row>
            <Avatar name={lead.displayName} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.bold }}>{lead.displayName}</Text>
              <Text variant="small">
                {lead.teamName ? `${lead.teamName} · ` : ""}
                {STAFF_LABEL[lead.status]}
                {b.team.length > 1 ? ` · +${b.team.length - 1} team member` : ""}
              </Text>
            </View>
          </Row>
          {company.data ? (
            <Row style={{ gap: space(2) }}>
              <Button title="📞 Call" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${company.data!.phone}`)} />
              <Button title="💬 WhatsApp" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => Linking.openURL(company.data!.whatsapp)} />
            </Row>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Text variant="heading">Details</Text>
        <Detail label="Property" value={`${b.property.type[0]!.toUpperCase()}${b.property.type.slice(1)} · ${SIZE_LABEL[b.property.size] ?? b.property.size}`} />
        <Detail label="Address" value={[b.address.unit, b.address.building, b.address.area].filter(Boolean).join(", ")} />
        {b.notes ? <Detail label="Notes" value={b.notes} /> : null}
        <Divider />
        <Row style={{ justifyContent: "space-between" }}>
          <View>
            <Text variant="small">Payment</Text>
            <Text style={{ fontFamily: fonts.semibold, color: b.paymentStatus === "paid" ? colors.success : colors.text }}>{PAYMENT_LABEL[b.paymentStatus]}</Text>
          </View>
          <Text variant="price">{aed(b.priceAed)}</Text>
        </Row>
        {b.canPay ? <Button title={`Pay ${b.priceAed != null ? aed(b.priceAed) : ""} now`} variant="gold" onPress={() => router.push(`/booking/${b.id}/pay`)} /> : null}
      </Card>

      {b.status === "completed" && !b.review ? (
        <Card tone="gold">
          <Text variant="heading">How was your service?</Text>
          <Row style={{ justifyContent: "center", gap: space(2) }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} accessibilityLabel={`${n} stars`}>
                <RNText style={{ fontSize: 38, color: n <= rating ? colors.star : colors.border }}>★</RNText>
              </Pressable>
            ))}
          </Row>
          <Button
            title="Submit rating"
            disabled={!rating}
            onPress={async () => {
              await api(`/bookings/${b.id}/review`, { body: { rating } });
              await reload();
            }}
          />
        </Card>
      ) : null}
      {b.review ? <Text variant="small" style={{ textAlign: "center" }}>You rated this service {"★".repeat(b.review.rating)}</Text> : null}

      {b.status === "completed" || b.status === "cancelled" ? <Button title="Book again" onPress={() => router.push(`/service/${b.service.key}`)} /> : null}
      {b.canCancel ? <Button title="Cancel booking" variant="danger" onPress={cancel} /> : null}
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="small">{label}</Text>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 15 }}>{value}</Text>
    </View>
  );
}
