import { useState } from "react";
import { Alert, Linking, Platform, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Button, Card, Divider, InlineLoader, Row, Screen, StatusPill, StickyFooter, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { aed, SIZE_LABEL, when } from "@/lib/format";
import { fonts } from "@/lib/theme";
import type { Booking, BookingStatus } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const NEXT: Partial<Record<BookingStatus, { to: BookingStatus; label: string }>> = {
  assigned: { to: "en_route", label: "Start driving" },
  en_route: { to: "arrived", label: "I've arrived" },
  arrived: { to: "in_progress", label: "Start the job" },
  in_progress: { to: "completed", label: "Mark as completed" },
};

export default function Job() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, setData } = useApi<Booking>(`/bookings/${id}`);
  const [busy, setBusy] = useState(false);
  if (!job) {
    return (
      <Screen edges={["left", "right"]}>
        <InlineLoader label="Loading the job…" />
      </Screen>
    );
  }

  const next = NEXT[job.status];
  const { lat, lng } = job.address;
  const navigate = () =>
    Linking.openURL(Platform.OS === "ios" ? `maps://?daddr=${lat},${lng}` : `google.navigation:q=${lat},${lng}`).catch(() =>
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`),
    );

  async function advance() {
    if (!next) return;
    setBusy(true);
    try {
      setData(await api<Booking>(`/staff/jobs/${job!.id}/status`, { body: { status: next.to } }));
    } catch (e) {
      Alert.alert("Could not update", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      edges={["left", "right"]}
      footer={
        next ? (
          <StickyFooter>
            <Button title={next.label} onPress={advance} loading={busy} style={{ flex: 1 }} />
          </StickyFooter>
        ) : undefined
      }
    >
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Text variant="heading" style={{ flex: 1 }}>
            {job.service.name}
          </Text>
          <StatusPill status={job.status} />
        </Row>
        <Text variant="small">
          {job.reference} · {when(job.scheduledAt)}
        </Text>
      </Card>
      <Card>
        <Text variant="label">CUSTOMER</Text>
        <Text style={{ fontFamily: fonts.bold }}>{job.customer?.fullName ?? "Customer"}</Text>
        {job.customer?.phone ? <Button title={`📞  Call ${job.customer.phone}`} variant="secondary" size="sm" onPress={() => Linking.openURL(`tel:${job.customer!.phone}`)} /> : null}
      </Card>
      <Card>
        <Text variant="label">ADDRESS</Text>
        <Text style={{ fontFamily: fonts.semibold }}>{[job.address.unit, job.address.building, job.address.area].filter(Boolean).join(", ")}</Text>
        <Text variant="small">
          {job.property.type} · {SIZE_LABEL[job.property.size] ?? job.property.size}
        </Text>
        {job.notes ? <Text variant="small">Notes: {job.notes}</Text> : null}
        <Button title="🧭  Navigate" variant="secondary" size="sm" onPress={navigate} />
      </Card>
      <Card>
        <Text variant="label">PAYMENT</Text>
        <Divider />
        <Text style={{ fontFamily: fonts.semibold }}>{job.paymentStatus === "paid" ? "✅ Paid in the app" : `Collect on site: ${aed(job.priceAed)}`}</Text>
      </Card>
      <View />
    </Screen>
  );
}
