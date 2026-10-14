import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { router } from "expo-router";
import * as Location from "expo-location";
import { Image } from "expo-image";
import { Card, Row, Screen, StatusPill, Text } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { aed, when } from "@/lib/format";
import { colors, space } from "@/lib/theme";
import type { Booking, Company, Service } from "@/lib/types";
import { useApi } from "@/lib/useApi";

interface Availability {
  onDuty: number;
  available: number;
  deployed: number;
  nearbyAvailable?: number;
  nearestEtaMinutes?: number | null;
}

export default function Home() {
  const { user } = useAuth();
  const services = useApi<{ services: Service[] }>("/catalog/services");
  const active = useApi<Booking[]>("/bookings?scope=active&limit=3");
  const company = useApi<Company>("/company");
  const [teams, setTeams] = useState<Availability | null>(null);

  useEffect(() => {
    (async () => {
      let q = "";
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.granted) {
        const pos = await Location.getLastKnownPositionAsync();
        if (pos) q = `?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`;
      }
      setTeams(await api<Availability>(`/staff/availability${q}`).catch(() => null));
    })();
  }, []);

  const first = user?.fullName?.split(" ")[0];
  return (
    <Screen>
      <Row style={{ justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Text variant="muted">Welcome{first ? `, ${first}` : ""}</Text>
          <Text variant="title">What can we do for you?</Text>
        </View>
        <Image source={require("../../../assets/logo.png")} style={{ width: 48, height: 48, borderRadius: 12 }} />
      </Row>

      {teams ? (
        <Card>
          <Text variant="gold">Teams right now</Text>
          <Row style={{ justifyContent: "space-between" }}>
            <Stat label="On duty" value={teams.onDuty} />
            <Stat label="Available" value={teams.available} />
            <Stat label="Deployed" value={teams.deployed} />
          </Row>
          {teams.nearestEtaMinutes != null ? (
            <Text variant="small">Nearest available team is about {teams.nearestEtaMinutes} min away.</Text>
          ) : null}
        </Card>
      ) : null}

      {active.data?.map((b) => (
        <Card key={b.id} onPress={() => router.push(`/booking/${b.id}`)}>
          <Row style={{ justifyContent: "space-between" }}>
            <Text variant="heading">{b.service.name}</Text>
            <StatusPill status={b.status} />
          </Row>
          <Text variant="muted">
            {when(b.scheduledAt)} · {b.reference}
          </Text>
          {b.trackable ? <Text variant="gold">Track your team live →</Text> : null}
        </Card>
      ))}

      <Text variant="heading">Services</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(3) }}>
        {services.data?.services.map((s) => (
          <Card key={s.key} style={{ width: "100%" }} onPress={() => router.push(`/service/${s.key}`)}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={{ fontWeight: "700", flex: 1 }}>{s.name}</Text>
              <Text variant="gold">{s.startingFromAed != null ? `from ${aed(s.startingFromAed)}` : "Free survey"}</Text>
            </Row>
            <Text variant="small">{s.highlights.slice(0, 2).join(" · ")}</Text>
          </Card>
        ))}
      </View>

      {company.data ? (
        <Card>
          <Text variant="gold">Need help?</Text>
          <Text onPress={() => Linking.openURL(company.data!.whatsapp)}>WhatsApp {company.data.phoneDisplay}</Text>
          <Text onPress={() => Linking.openURL(`tel:${company.data!.phone}`)} variant="muted">
            Call us · {company.data.email}
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ fontSize: 26, fontWeight: "800", color: colors.goldHi }}>{value}</Text>
      <Text variant="small">{label}</Text>
    </View>
  );
}
