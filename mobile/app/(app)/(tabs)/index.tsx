import { useEffect, useMemo, useState } from "react";
import { Dimensions, Linking, Pressable, ScrollView, Text as RNText, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { Card, InlineLoader, Row, SectionHeader, StatusPill, Text } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { aed, when } from "@/lib/format";
import { MOST_BOOKED, SERVICE_ICON, SERVICE_RATING, SERVICE_SHORT } from "@/lib/serviceIcons";
import { colors, fonts, radius, shadow, space } from "@/lib/theme";
import type { Booking, Company, Service } from "@/lib/types";
import { useApi } from "@/lib/useApi";

interface Availability {
  onDuty: number;
  available: number;
  nearestEtaMinutes?: number | null;
}
interface Address {
  label: string;
  area: string;
  isDefault: boolean;
}

const W = Dimensions.get("window").width;

const PROMOS = [
  { title: "Deep clean from AED 300", body: "Kitchen, bathrooms, inside cupboards. Every corner.", cta: "Book deep clean", service: "deep", bg: colors.ink, fg: "#fff", accent: colors.goldBright, art: "🧽" },
  { title: "Pay in 4 with Tamara", body: "Split any booking into 4 interest-free payments.", cta: "Learn more", service: "regular", bg: "#F3E3BC", fg: colors.ink, accent: colors.ink, art: "💳" },
  { title: "AC duct cleaning", body: "Breathe cleaner air before summer. Free survey.", cta: "Get a quote", service: "ac", bg: "#E3EEF6", fg: colors.ink, accent: "#1F5F8B", art: "❄️" },
];

export default function Home() {
  const { user } = useAuth();
  const services = useApi<{ services: Service[] }>("/catalog/services");
  const active = useApi<Booking[]>("/bookings?scope=active&limit=3");
  const addresses = useApi<Address[]>("/me/addresses");
  const company = useApi<Company>("/company");
  const [teams, setTeams] = useState<Availability | null>(null);
  const [query, setQuery] = useState("");
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    (async () => {
      let q = "";
      const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
      if (perm?.granted) {
        const pos = await Location.getLastKnownPositionAsync().catch(() => null);
        if (pos) q = `?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`;
      }
      setTeams(await api<Availability>(`/staff/availability${q}`).catch(() => null));
    })();
  }, []);

  // Keep the live booking card current (status changes, "Track" appearing).
  const hasActive = Boolean(active.data?.length);
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => void active.reload(), 15_000);
    return () => clearInterval(t);
  }, [hasActive]);

  const all = services.data?.services ?? [];
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((s) => `${s.name} ${SERVICE_SHORT[s.key] ?? ""}`.toLowerCase().includes(q)) : [];
  }, [query, all]);
  const area = addresses.data?.find((a) => a.isDefault)?.area ?? addresses.data?.[0]?.area;
  const first = user?.fullName?.split(" ")[0];
  const open = (key: string) => router.push(`/service/${key}`);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space(10) }} keyboardShouldPersistTaps="handled">
        {/* Brand header with location, greeting and search */}
        <View style={{ backgroundColor: colors.ink, borderBottomLeftRadius: radius.xl + 4, borderBottomRightRadius: radius.xl + 4, paddingBottom: space(8) }}>
          <SafeAreaView edges={["top"]} style={{ paddingHorizontal: space(4), paddingTop: space(2), gap: space(4) }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Pressable onPress={() => router.push("/(app)/(tabs)/account")} style={{ flexDirection: "row", alignItems: "center", gap: space(2) }} accessibilityRole="button" accessibilityLabel="Service location">
                <RNText style={{ fontSize: 18 }}>📍</RNText>
                <View>
                  <RNText style={{ color: "#A79E8D", fontFamily: fonts.medium, fontSize: 12 }}>Service location</RNText>
                  <RNText style={{ color: "#fff", fontFamily: fonts.bold, fontSize: 15 }}>{area ?? "Abu Dhabi"} ▾</RNText>
                </View>
              </Pressable>
              {teams ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#24201A", borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#3DDC84" }} />
                  <RNText style={{ color: "#E9E3D6", fontFamily: fonts.semibold, fontSize: 12 }}>{teams.available} pros available</RNText>
                </View>
              ) : null}
            </Row>
            <View style={{ gap: 2 }}>
              <RNText style={{ color: colors.goldBright, fontFamily: fonts.semibold, fontSize: 15 }}>Hi{first ? ` ${first}` : " there"} 👋</RNText>
              <RNText style={{ color: "#fff", fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 33, letterSpacing: -0.4 }}>What can we help you with today?</RNText>
            </View>
          </SafeAreaView>
        </View>

        <View style={{ paddingHorizontal: space(4), marginTop: -space(7), gap: space(5) }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(2), backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: space(4), height: 54, ...shadow.raised }}>
            <RNText style={{ fontSize: 16, color: colors.faint }}>🔍</RNText>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search for a service (e.g. sofa, AC)"
              placeholderTextColor={colors.faint}
              style={{ flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.text }}
              returnKeyType="search"
            />
            {query ? (
              <Text onPress={() => setQuery("")} style={{ color: colors.faint, fontSize: 18 }}>
                ✕
              </Text>
            ) : null}
          </View>

          {query ? (
            <Card style={{ gap: 0, paddingVertical: space(1) }}>
              {results.length === 0 ? <Text variant="muted" style={{ padding: space(3) }}>No services match “{query}”.</Text> : null}
              {results.map((s) => (
                <Pressable key={s.key} onPress={() => open(s.key)} style={{ flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(3) }}>
                  <RNText style={{ fontSize: 22 }}>{SERVICE_ICON[s.key]}</RNText>
                  <Text style={{ flex: 1, fontFamily: fonts.semibold }}>{s.name}</Text>
                  <Text variant="small">{s.startingFromAed ? `from ${aed(s.startingFromAed)}` : "Free survey"}</Text>
                </Pressable>
              ))}
            </Card>
          ) : null}

          {/* Live booking first: it's what returning customers open the app for. */}
          {active.data?.map((b) => (
            <Card key={b.id} onPress={() => router.push(b.trackable ? `/booking/${b.id}/track` : `/booking/${b.id}`)} tone="gold">
              <Row style={{ justifyContent: "space-between" }}>
                <Text variant="label">YOUR UPCOMING BOOKING</Text>
                <StatusPill status={b.status} />
              </Row>
              <Row>
                <RNText style={{ fontSize: 28 }}>{SERVICE_ICON[b.service.key] ?? "✨"}</RNText>
                <View style={{ flex: 1 }}>
                  <Text variant="subheading">{b.service.name}</Text>
                  <Text variant="small">
                    {when(b.scheduledAt)} · {b.reference}
                  </Text>
                </View>
              </Row>
              {b.trackable ? (
                <View style={{ backgroundColor: colors.ink, borderRadius: radius.md, paddingVertical: space(3), alignItems: "center" }}>
                  <RNText style={{ color: colors.goldBright, fontFamily: fonts.bold }}>📍 Track your team live</RNText>
                </View>
              ) : null}
            </Card>
          ))}

          {/* Offers carousel */}
          <View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              snapToInterval={W - space(8) + space(3)}
              decelerationRate="fast"
              onMomentumScrollEnd={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / (W - space(8) + space(3))))}
              contentContainerStyle={{ gap: space(3) }}
            >
              {PROMOS.map((p) => (
                <Pressable key={p.title} onPress={() => open(p.service)} style={{ width: W - space(8), backgroundColor: p.bg, borderRadius: radius.xl, padding: space(5), gap: space(2), overflow: "hidden" }}>
                  <RNText style={{ position: "absolute", right: -6, bottom: -14, fontSize: 96, opacity: 0.9 }}>{p.art}</RNText>
                  <RNText style={{ color: p.fg, fontFamily: fonts.extrabold, fontSize: 20, width: "70%" }}>{p.title}</RNText>
                  <RNText style={{ color: p.fg, opacity: 0.75, fontFamily: fonts.medium, fontSize: 13, width: "62%" }}>{p.body}</RNText>
                  <View style={{ alignSelf: "flex-start", backgroundColor: p.accent, borderRadius: radius.pill, paddingHorizontal: space(4), paddingVertical: space(2), marginTop: space(2) }}>
                    <RNText style={{ color: p.bg === colors.ink ? colors.ink : "#fff", fontFamily: fonts.bold, fontSize: 13 }}>{p.cta} →</RNText>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <Row style={{ justifyContent: "center", gap: 6, marginTop: space(3) }}>
              {PROMOS.map((_, i) => (
                <View key={i} style={{ width: i === slide ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === slide ? colors.ink : colors.border }} />
              ))}
            </Row>
          </View>

          <SectionHeader title="All services" />
          {services.loading ? <InlineLoader label="Loading services…" /> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: space(4) }}>
            {all.map((s) => (
              <Pressable key={s.key} onPress={() => open(s.key)} style={{ width: "25%", alignItems: "center", gap: space(1.5) }} accessibilityRole="button" accessibilityLabel={s.name}>
                <View style={{ width: 62, height: 62, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", ...shadow.card }}>
                  <RNText style={{ fontSize: 28 }}>{SERVICE_ICON[s.key] ?? "✨"}</RNText>
                </View>
                <RNText style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.text, textAlign: "center" }} numberOfLines={2}>
                  {SERVICE_SHORT[s.key] ?? s.name}
                </RNText>
              </Pressable>
            ))}
          </View>

          <SectionHeader title="Most booked" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3), paddingRight: space(4) }} style={{ marginHorizontal: -space(4), paddingLeft: space(4) }}>
            {MOST_BOOKED.map((k) => all.find((s) => s.key === k))
              .filter((s): s is Service => Boolean(s))
              .map((s) => (
                <Pressable key={s.key} onPress={() => open(s.key)} style={{ width: 168, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.card }}>
                  <View style={{ height: 96, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" }}>
                    <RNText style={{ fontSize: 46 }}>{SERVICE_ICON[s.key]}</RNText>
                  </View>
                  <View style={{ padding: space(3), gap: 4 }}>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Text variant="small">
                      <Text variant="small" style={{ color: colors.star }}>★</Text> {SERVICE_RATING[s.key] ?? 4.8} · {Math.round(s.durationMinutes / 60)} hrs
                    </Text>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 14 }}>{s.startingFromAed ? `From ${aed(s.startingFromAed)}` : "Free survey"}</Text>
                  </View>
                </Pressable>
              ))}
          </ScrollView>

          {/* Why Xtreme */}
          <Card>
            <Text variant="heading">Why customers choose Xtreme</Text>
            {[
              ["🛡️", "Vetted & trained professionals", "Background-checked, uniformed and insured teams."],
              ["⭐", "Satisfaction guarantee", "Not happy? We'll come back and make it right."],
              ["🔒", "Secure payments", "Card, Apple Pay, Google Pay, Tamara or cash on the day."],
            ].map(([i, t, d]) => (
              <Row key={t} style={{ alignItems: "flex-start", marginTop: space(1) }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" }}>
                  <RNText style={{ fontSize: 17 }}>{i}</RNText>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 15 }}>{t}</Text>
                  <Text variant="small">{d}</Text>
                </View>
              </Row>
            ))}
          </Card>

          {company.data ? (
            <Card tone="ink" onPress={() => Linking.openURL(company.data!.whatsapp)}>
              <Row>
                <RNText style={{ fontSize: 30 }}>💬</RNText>
                <View style={{ flex: 1 }}>
                  <RNText style={{ color: "#fff", fontFamily: fonts.bold, fontSize: 16 }}>Need help? Chat with us</RNText>
                  <RNText style={{ color: "#BDB4A3", fontFamily: fonts.medium, fontSize: 13 }}>WhatsApp {company.data.phoneDisplay} · 7 days a week</RNText>
                </View>
                <RNText style={{ color: colors.goldBright, fontSize: 24 }}>›</RNText>
              </Row>
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
