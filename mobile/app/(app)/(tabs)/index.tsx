import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import * as Location from "expo-location";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SERVICE_ICON } from "@/lib/serviceIcons";
import { Card, InlineLoader, Pulse, Row, Screen, SectionLabel, StatusPill, Text, Wordmark } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { aed, when } from "@/lib/format";
import { colors, fonts, glow, gradients, radius, space } from "@/lib/theme";
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
          <Text variant="muted">Welcome back{first ? `, ${first}` : ""}</Text>
          <Wordmark size={14} />
        </View>
        <Image source={require("../../../assets/logo.png")} style={{ width: 48, height: 48, borderRadius: 12 }} />
      </Row>

      <Pressable onPress={() => router.push("/service/deep")} accessibilityRole="button" accessibilityLabel="Book a deep clean">
        <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          {/* diagonal light streaks */}
          <LinearGradient
            colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.35)", "rgba(255,255,255,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ position: "absolute", top: -40, bottom: -40, width: 70, right: 70, transform: [{ rotate: "20deg" }] }}
          />
          <RNText style={{ fontFamily: fonts.displayMedium, fontSize: 10, letterSpacing: 2.5, color: colors.onGold, opacity: 0.7 }}>FEATURED · DEEP CLEAN</RNText>
          <RNText style={{ fontFamily: fonts.displayBlack, color: colors.onGold, fontSize: 23, lineHeight: 30 }}>A spotless home,{"\n"}one tap away.</RNText>
          <RNText style={{ fontFamily: fonts.bodySemi, color: colors.onGold, opacity: 0.8 }}>From AED 300 · vetted teams · live tracking</RNText>
          <View style={styles.heroCta}>
            <RNText style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: 1.5, color: colors.gold }}>BOOK NOW  →</RNText>
          </View>
          <RNText style={{ position: "absolute", right: space(4), top: space(4), fontSize: 50 }}>🧽</RNText>
        </LinearGradient>
      </Pressable>

      {teams ? (
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <Text variant="gold">Teams right now</Text>
            <Row style={{ gap: 6 }}>
              <Pulse color={colors.ok} />
              <Text style={{ fontFamily: fonts.displayMedium, fontSize: 9, letterSpacing: 1.6, color: colors.ok }}>LIVE</Text>
            </Row>
          </Row>
          <Row style={{ justifyContent: "space-between" }}>
            <Stat label="On duty" value={teams.onDuty} color={colors.goldHi} />
            <View style={styles.statDivider} />
            <Stat label="Available" value={teams.available} color={colors.ok} />
            <View style={styles.statDivider} />
            <Stat label="Deployed" value={teams.deployed} color={colors.cyan} />
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

      <SectionLabel>Our services</SectionLabel>
      {services.loading ? <InlineLoader label="Loading services…" /> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: space(3) }}>
        {services.data?.services.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => router.push(`/service/${s.key}`)}
            accessibilityRole="button"
            accessibilityLabel={s.name}
            style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.97 }], borderColor: colors.gold, shadowColor: colors.gold, shadowOpacity: 0.5, shadowRadius: 12 }]}
          >
            <View style={styles.tileIcon}>
              <RNText style={{ fontSize: 26 }}>{SERVICE_ICON[s.key] ?? "✨"}</RNText>
            </View>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 19 }} numberOfLines={2}>
              {s.name}
            </Text>
            <Text style={{ fontFamily: fonts.displayMedium, fontSize: 10, letterSpacing: 1, color: s.startingFromAed != null ? colors.gold : colors.cyan }}>
              {s.startingFromAed != null ? `FROM ${aed(s.startingFromAed).toUpperCase()}` : "FREE SURVEY"}
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
  hero: {
    borderRadius: radius.lg,
    padding: space(5),
    gap: space(2),
    overflow: "hidden",
    shadowColor: colors.gold,
    shadowOpacity: 0.45,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  heroCta: { alignSelf: "flex-start", backgroundColor: colors.bg, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, marginTop: space(1) },
  statDivider: { width: 1, alignSelf: "stretch", backgroundColor: colors.hairline },
  tile: {
    width: "48%",
    backgroundColor: colors.glass,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space(4),
    gap: space(2),
    minHeight: 156,
  },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(90,216,234,0.08)",
    borderWidth: 1,
    borderColor: "rgba(90,216,234,0.5)",
    shadowColor: colors.cyan,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    alignItems: "center",
    justifyContent: "center",
  },
});

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1, gap: 2 }}>
      <Text style={[{ fontFamily: fonts.displayBlack, fontSize: 30, lineHeight: 38, color }, glow(color, 14)]}>{String(value).padStart(2, "0")}</Text>
      <Text style={{ fontFamily: fonts.displayMedium, fontSize: 9, letterSpacing: 1.6, color: colors.muted }}>{label.toUpperCase()}</Text>
    </View>
  );
}
