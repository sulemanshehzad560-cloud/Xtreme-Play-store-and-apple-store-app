import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import * as Location from "expo-location";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SERVICE_ICON } from "@/lib/serviceIcons";
import { Card, InlineLoader, Row, Screen, StatusPill, Text } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { aed, when } from "@/lib/format";
import { colors, radius, space } from "@/lib/theme";
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
          <Text variant="muted">Welcome{first ? `, ${first}` : ""} 👋</Text>
          <Text style={{ color: colors.gold, fontWeight: "900", letterSpacing: 2 }}>XTREME-HOME PARTNER</Text>
        </View>
        <Image source={require("../../../assets/logo.png")} style={{ width: 48, height: 48, borderRadius: 12 }} />
      </Row>

      <Pressable onPress={() => router.push("/service/deep")} accessibilityRole="button" accessibilityLabel="Book a deep clean">
        <LinearGradient
          colors={[colors.goldHi, colors.gold, colors.goldLo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: radius.lg, padding: space(5), gap: space(2) }}
        >
          <RNText style={{ color: colors.onGold, fontSize: 24, fontWeight: "900" }}>A spotless home,{"\n"}one tap away.</RNText>
          <RNText style={{ color: colors.onGold, opacity: 0.8 }}>Deep cleaning from AED 300 · vetted teams · live tracking</RNText>
          <View style={{ alignSelf: "flex-start", backgroundColor: colors.bg, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, marginTop: space(1) }}>
            <RNText style={{ color: colors.gold, fontWeight: "800" }}>Book a deep clean →</RNText>
          </View>
          <RNText style={{ position: "absolute", right: space(4), top: space(3), fontSize: 54 }}>🧽</RNText>
        </LinearGradient>
      </Pressable>

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

      <Text variant="heading">Our services</Text>
      {services.loading ? <InlineLoader label="Loading services…" /> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: space(3) }}>
        {services.data?.services.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => router.push(`/service/${s.key}`)}
            accessibilityRole="button"
            accessibilityLabel={s.name}
            style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.97 }], borderColor: colors.gold }]}
          >
            <View style={styles.tileIcon}>
              <RNText style={{ fontSize: 26 }}>{SERVICE_ICON[s.key] ?? "✨"}</RNText>
            </View>
            <Text style={{ fontWeight: "700", fontSize: 15 }} numberOfLines={2}>
              {s.name}
            </Text>
            <Text variant="small" style={{ color: s.startingFromAed != null ? colors.gold : colors.muted }}>
              {s.startingFromAed != null ? `from ${aed(s.startingFromAed)}` : "Free survey"}
            </Text>
          </Pressable>
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

const styles = StyleSheet.create({
  tile: {
    width: "48%",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(4),
    gap: space(2),
    minHeight: 150,
  },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(226,193,112,0.12)",
    borderWidth: 1,
    borderColor: colors.goldLo,
    alignItems: "center",
    justifyContent: "center",
  },
});

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ fontSize: 26, fontWeight: "800", color: colors.goldHi }}>{value}</Text>
      <Text variant="small">{label}</Text>
    </View>
  );
}
