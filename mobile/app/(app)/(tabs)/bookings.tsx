import { useState } from "react";
import { router } from "expo-router";
import { Card, Chip, InlineLoader, Row, Screen, StatusPill, Text } from "@/components/ui";
import { aed, when } from "@/lib/format";
import type { Booking } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function Bookings() {
  const [scope, setScope] = useState<"active" | "past">("active");
  const { data, loading } = useApi<Booking[]>(`/bookings?scope=${scope}&limit=50`);
  return (
    <Screen>
      <Text variant="title">My bookings</Text>
      <Row>
        <Chip label="Upcoming" selected={scope === "active"} onPress={() => setScope("active")} />
        <Chip label="Past" selected={scope === "past"} onPress={() => setScope("past")} />
      </Row>
      {loading ? <InlineLoader label="Fetching your bookings…" /> : null}
      {!loading && data?.length === 0 ? <Text variant="muted">Nothing here yet.</Text> : null}
      {data?.map((b) => (
        <Card key={b.id} onPress={() => router.push(`/booking/${b.id}`)}>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={{ fontWeight: "700", flex: 1 }}>{b.service.name}</Text>
            <StatusPill status={b.status} />
          </Row>
          <Text variant="muted">{when(b.scheduledAt)}</Text>
          <Text variant="small">
            {b.reference} · {aed(b.priceAed)} · {b.paymentStatus === "paid" ? "Paid" : b.paymentStatus === "refunded" ? "Refunded" : "Unpaid"}
          </Text>
        </Card>
      ))}
    </Screen>
  );
}
