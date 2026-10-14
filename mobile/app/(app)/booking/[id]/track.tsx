import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { Card, InlineLoader, Row, StatusPill, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { STAFF_LABEL } from "@/lib/format";
import { useBookingEvents } from "@/lib/realtime";
import { colors, space } from "@/lib/theme";
import type { BookingStatus, Tracking } from "@/lib/types";

export default function Track() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [t, setT] = useState<Tracking | null>(null);
  const map = useRef<MapView>(null);

  useEffect(() => {
    api<Tracking>(`/bookings/${id}/tracking`).then(setT).catch(() => undefined);
  }, [id]);

  useBookingEvents(id, {
    snapshot: (s: Tracking) => setT(s),
    "staff:location": (p: { lat: number; lng: number; heading: number | null; at: string; etaMinutes: number | null }) =>
      setT((cur) => (cur ? { ...cur, location: { lat: p.lat, lng: p.lng, heading: p.heading, at: p.at, stale: false }, etaMinutes: p.etaMinutes ?? cur.etaMinutes } : cur)),
    "booking:status": (s: { status: BookingStatus }) =>
      api<Tracking>(`/bookings/${id}/tracking`).then(setT).catch(() => setT((cur) => (cur ? { ...cur, status: s.status } : cur))),
  });

  // Keep both the team and the home in view.
  useEffect(() => {
    if (!t?.location) return;
    map.current?.fitToCoordinates(
      [
        { latitude: t.location.lat, longitude: t.location.lng },
        { latitude: t.destination.lat, longitude: t.destination.lng },
      ],
      { edgePadding: { top: 80, bottom: 260, left: 60, right: 60 }, animated: true },
    );
  }, [t?.location?.lat, t?.location?.lng]);

  if (!t) return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center" }}><InlineLoader label="Finding your team…" /></View>;
  const lead = t.team.find((m) => m.isLead) ?? t.team[0];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <MapView
        ref={map}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        initialRegion={{ latitude: t.destination.lat, longitude: t.destination.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
      >
        <Marker coordinate={{ latitude: t.destination.lat, longitude: t.destination.lng }} title="Your address" pinColor={colors.gold} />
        {t.location ? (
          <Marker
            coordinate={{ latitude: t.location.lat, longitude: t.location.lng }}
            title={lead?.displayName ?? "Your team"}
            rotation={t.location.heading ?? 0}
            flat
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <Text style={{ fontSize: 30 }}>🚐</Text>
          </Marker>
        ) : null}
      </MapView>

      <View style={{ position: "absolute", left: space(4), right: space(4), bottom: space(8) }}>
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <Text variant="heading">{t.etaMinutes != null ? `About ${t.etaMinutes} min away` : "Your team"}</Text>
            <StatusPill status={t.status} />
          </Row>
          {lead ? (
            <Text variant="muted">
              {lead.displayName}
              {t.team.length > 1 ? ` + ${t.team.length - 1} more` : ""} · {STAFF_LABEL[lead.status]}
            </Text>
          ) : (
            <Text variant="muted">We'll show your team here once they're assigned.</Text>
          )}
          {!t.live ? <Text variant="small">Live location appears when your team sets off.</Text> : null}
          {t.location?.stale ? <Text variant="small" style={{ color: colors.warn }}>Waiting for a fresh location…</Text> : null}
        </Card>
      </View>
    </View>
  );
}
