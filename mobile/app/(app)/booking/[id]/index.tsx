import { useState } from "react";
import { Alert, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Card, Chip, InlineLoader, Row, Screen, StatusPill, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { aed, STAFF_LABEL, STATUS_LABEL, SIZE_LABEL, when } from "@/lib/format";
import { useBookingEvents } from "@/lib/realtime";
import { colors, space } from "@/lib/theme";
import type { Booking } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const PAYMENT_LABEL: Record<Booking["paymentStatus"], string> = {
  unpaid: "Not paid yet",
  pending: "Payment in progress",
  paid: "Paid",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
};

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: b, reload } = useApi<Booking>(`/bookings/${id}`);
  const [rating, setRating] = useState(0);
  useBookingEvents(id, { "booking:status": () => void reload() });

  if (!b) return <Screen><InlineLoader label="Fetching your booking…" /></Screen>;

  const cancel = () =>
    Alert.alert("Cancel this booking?", b.paymentStatus === "paid" ? "Your payment will be refunded to the same card or Tamara plan." : undefined, [
      { text: "Keep it", style: "cancel" },
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
    <Screen>
      <Row style={{ justifyContent: "space-between" }}>
        <Text variant="title" style={{ flex: 1 }}>
          {b.service.name}
        </Text>
        <StatusPill status={b.status} />
      </Row>
      <Text variant="muted">
        {b.reference} · {when(b.scheduledAt)}
      </Text>

      {b.trackable ? <Button title="Track your team live" onPress={() => router.push(`/booking/${b.id}/track`)} /> : null}

      <Card>
        <Text variant="gold">Details</Text>
        <Text>
          {b.property.type[0]!.toUpperCase() + b.property.type.slice(1)} · {SIZE_LABEL[b.property.size] ?? b.property.size}
        </Text>
        <Text variant="muted">{[b.address.unit, b.address.building, b.address.area].filter(Boolean).join(", ")}</Text>
        {b.notes ? <Text variant="small">“{b.notes}”</Text> : null}
      </Card>

      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Text variant="gold">Payment</Text>
          <Text>{aed(b.priceAed)}</Text>
        </Row>
        <Text variant="muted">{PAYMENT_LABEL[b.paymentStatus]}</Text>
        {b.canPay ? <Button title="Pay now" onPress={() => router.push(`/booking/${b.id}/pay`)} /> : null}
      </Card>

      {b.team.length ? (
        <Card>
          <Text variant="gold">Your team</Text>
          {b.team.map((m) => (
            <Row key={m.id} style={{ justifyContent: "space-between" }}>
              <Text>
                {m.displayName}
                {m.isLead ? " (lead)" : ""}
              </Text>
              <Text variant="small">{STAFF_LABEL[m.status]}</Text>
            </Row>
          ))}
        </Card>
      ) : null}

      {b.timeline?.length ? (
        <Card>
          <Text variant="gold">Timeline</Text>
          {b.timeline
            .filter((e) => e.to)
            .map((e, i) => (
              <Row key={i} style={{ justifyContent: "space-between" }}>
                <Text>{STATUS_LABEL[e.to!]}</Text>
                <Text variant="small">{when(e.at)}</Text>
              </Row>
            ))}
        </Card>
      ) : null}

      {b.status === "completed" && !b.review ? (
        <Card>
          <Text variant="gold">How did we do?</Text>
          <Row>
            {[1, 2, 3, 4, 5].map((n) => (
              <Chip key={n} label={"★".repeat(n)} selected={rating === n} onPress={() => setRating(n)} />
            ))}
          </Row>
          <Button
            title="Send rating"
            disabled={!rating}
            onPress={async () => {
              await api(`/bookings/${b.id}/review`, { body: { rating } });
              await reload();
            }}
          />
        </Card>
      ) : null}

      <View style={{ gap: space(2) }}>
        {b.canCancel ? <Button title="Cancel booking" variant="danger" onPress={cancel} /> : null}
        {b.status === "cancelled" ? <Text style={{ color: colors.err }}>This booking was cancelled.</Text> : null}
      </View>
    </Screen>
  );
}
