import { useCallback, useEffect, useMemo, useState } from "react";
import { Dimensions, Image, Linking, Pressable, RefreshControl, ScrollView, Text as RNText, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { FadeIn, SkeletonCard } from "@/components/art/Motion";
import { LivingRoomScene, PayInFourScene } from "@/components/art/Scenes";
import { ServiceIcon } from "@/components/art/ServiceIcon";
import { BrandMark } from "@/components/BrandMark";
import { LineIcon } from "@/components/LineIcon";
import { Card, Row, SectionHeader, StatusPill, Text } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { aed, when } from "@/lib/format";
import { ratingLabel } from "@/lib/rating";
import { MOST_BOOKED, SERVICE_SHORT } from "@/lib/serviceIcons";
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
const SLIDE = W - space(8);

const PROMOS = [
  { title: "Monthly & yearly plans", body: "Regular visits by the same team. Pay once, book visits any time.", cta: "See plans", service: "plans", bg: colors.ink, fg: "#fff", ctaBg: colors.goldBright, ctaFg: colors.ink, Art: LivingRoomScene },
  { title: "Home cleaning from AED 90", body: "2–3 trained cleaners. All cleaning materials FREE.", cta: "Book a clean", service: "regular", bg: colors.ink, fg: "#fff", ctaBg: colors.goldBright, ctaFg: colors.ink, Art: LivingRoomScene },
  { title: "Deep cleaning, priced on site", body: "Appliances inside and out, every corner. Free site visit and quote.", cta: "Book a visit", service: "deep", bg: colors.ink, fg: "#fff", ctaBg: colors.goldBright, ctaFg: colors.ink, Art: LivingRoomScene },
  { title: "Pay in 4 with Tamara", body: "Split your booking into 4 payments.", cta: "Book now", service: "regular", bg: "#F3E3BC", fg: colors.ink, ctaBg: colors.ink, ctaFg: "#fff", Art: PayInFourScene },
  { title: "Fresh sofas & carpets", body: "Deep extraction lifts dust, stains and odours.", cta: "Book sofa cleaning", service: "sofa", bg: "#EFE6D6", fg: colors.ink, ctaBg: colors.ink, ctaFg: "#fff", Art: LivingRoomScene },
];

export default function Home() {
  const { user } = useAuth();
  const services = useApi<{ services: Service[] }>("/catalog/services");
  const active = useApi<Booking[]>("/bookings?scope=active&limit=3");
  const addresses = useApi<Address[]>("/me/addresses");
  const company = useApi<Company>("/company");
  const inbox = useApi<{ read: boolean }[]>("/me/notifications?limit=50");
  const chatUnread = useApi<{ unread: number }>("/me/support/unread");
  const [teams, setTeams] = useState<Availability | null>(null);
  const [query, setQuery] = useState("");
  const [slide, setSlide] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadTeams = useCallback(async () => {
    let q = "";
    const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
    if (perm?.granted) {
      const pos = await Location.getLastKnownPositionAsync().catch(() => null);
      if (pos) q = `?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`;
    }
    setTeams(await api<Availability>(`/staff/availability${q}`).catch(() => null));
  }, []);

  useEffect(() => {
    void loadTeams();
  }, []);

  // Keep the live booking card current (status changes, "Track" appearing).
  const hasActive = Boolean(active.data?.length);
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => void active.reload(), 15_000);
    return () => clearInterval(t);
  }, [hasActive]);

  // Rotate the offers every few seconds.
  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % PROMOS.length), 5000);
    return () => clearInterval(t);
  }, []);
  const [carousel, setCarousel] = useState<ScrollView | null>(null);
  useEffect(() => {
    carousel?.scrollTo({ x: slide * (SLIDE + space(3)), animated: true });
  }, [slide]);

  async function refresh() {
    setRefreshing(true);
    await Promise.all([services.reload(), active.reload(), addresses.reload(), inbox.reload(), chatUnread.reload(), loadTeams()]);
    setRefreshing(false);
  }

  const all = services.data?.services ?? [];
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((s) => `${s.name} ${SERVICE_SHORT[s.key] ?? ""}`.toLowerCase().includes(q)) : [];
  }, [query, all]);
  const area = addresses.data?.find((a) => a.isDefault)?.area ?? addresses.data?.[0]?.area;
  const unread = inbox.data?.filter((n) => !n.read).length ?? 0;
  const first = user?.fullName?.split(" ")[0];
  const open = (key: string) => router.push(key === "plans" ? "/plans" : `/service/${key}`);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: space(10) }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.goldBright} colors={[colors.gold]} />}
      >
        {/* Brand header: location, live team count, notifications, greeting */}
        <View style={{ backgroundColor: colors.ink, borderBottomLeftRadius: radius.xl + 4, borderBottomRightRadius: radius.xl + 4, paddingBottom: space(9), overflow: "hidden" }}>
          <View style={{ position: "absolute", right: -40, top: -30, width: 180, height: 180, borderRadius: 90, backgroundColor: "#2A231A" }} />
          <Image source={require("../../../assets/logo-mark.png")} style={{ position: "absolute", right: -30, bottom: -10, width: 210, height: 160, opacity: 0.08 }} resizeMode="contain" />
          <SafeAreaView edges={["top"]} style={{ paddingHorizontal: space(4), paddingTop: space(2), gap: space(4) }}>
            <Row style={{ justifyContent: "space-between" }}>
              <BrandMark size={30} sub="by Xtreme Facilities Management" />
              <Pressable onPress={() => router.push("/notifications")} accessibilityRole="button" accessibilityLabel={`Notifications, ${unread} unread`} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#2A251D", alignItems: "center", justifyContent: "center" }}>
                <LineIcon name="bell" size={21} color="#F6F0E3" />
                {unread ? (
                  <View style={{ position: "absolute", top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: colors.ink }}>
                    <RNText style={{ color: "#fff", fontFamily: fonts.bold, fontSize: 10 }}>{unread > 9 ? "9+" : unread}</RNText>
                  </View>
                ) : null}
              </Pressable>
            </Row>
            <Pressable onPress={() => router.push("/addresses")} style={{ flexDirection: "row", alignItems: "center", gap: space(2), alignSelf: "flex-start", backgroundColor: "#211D17", borderRadius: radius.pill, paddingLeft: space(2), paddingRight: space(4), paddingVertical: space(1.5), borderWidth: 1, borderColor: "#3A3328" }} accessibilityRole="button" accessibilityLabel="Service location">
              <LineIcon name="pin" size={18} color={colors.goldBright} />
              <RNText style={{ color: "#A79E8D", fontFamily: fonts.medium, fontSize: 12 }}>Service location</RNText>
              <RNText style={{ color: "#fff", fontFamily: fonts.bold, fontSize: 13, flexShrink: 1 }} numberOfLines={1}>
                {area ?? "Set your address"} ▾
              </RNText>
            </Pressable>
            <View style={{ gap: 2 }}>
              <RNText style={{ color: colors.goldBright, fontFamily: fonts.semibold, fontSize: 15 }}>Hi{first ? ` ${first}` : " there"} 👋</RNText>
              <RNText style={{ color: "#fff", fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 33, letterSpacing: -0.4 }}>What can we help you with today?</RNText>
            </View>
            {teams ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", backgroundColor: "#24201A", borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#3DDC84" }} />
                <RNText style={{ color: "#E9E3D6", fontFamily: fonts.semibold, fontSize: 12 }}>
                  {teams.available} teams available now{teams.nearestEtaMinutes != null ? ` · nearest ~${teams.nearestEtaMinutes} min` : ""}
                </RNText>
              </View>
            ) : null}
          </SafeAreaView>
        </View>

        <View style={{ paddingHorizontal: space(4), marginTop: -space(7), gap: space(5) }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(2), backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: space(4), height: 56, ...shadow.raised }}>
            <RNText style={{ fontSize: 16, color: colors.faint }}>🔍</RNText>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search services (e.g. sofa, carpet, kitchen)"
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
                <Pressable key={s.key} onPress={() => open(s.key)} style={{ flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(2.5) }}>
                  <ServiceIcon name={s.key} size={40} />
                  <Text style={{ flex: 1, fontFamily: fonts.semibold }}>{s.name}</Text>
                  <Text variant="small">{s.startingFromAed ? `from ${aed(s.startingFromAed)}` : "On quote"}</Text>
                </Pressable>
              ))}
            </Card>
          ) : null}

          {/* What every booking includes */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space(4) }} contentContainerStyle={{ gap: space(2), paddingHorizontal: space(4) }}>
            {[
              ["🧴", "Cleaning materials", "FREE", true],
              ["⭐", "Best value", "in the area", false],
              ["⚡", "Book for", "today", false],
              ["🛡️", "Vetted &", "insured teams", false],
            ].map(([icon, a, b, hot]) => (
              <View
                key={String(a)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space(2),
                  backgroundColor: hot ? colors.successSoft : colors.surface,
                  borderWidth: 1,
                  borderColor: hot ? "#BFE5CC" : colors.border,
                  borderRadius: radius.lg,
                  paddingHorizontal: space(3),
                  paddingVertical: space(2.5),
                }}
              >
                <RNText style={{ fontSize: 20 }}>{icon}</RNText>
                <View>
                  <RNText style={{ fontFamily: fonts.medium, fontSize: 11.5, color: hot ? colors.success : colors.muted }}>{a}</RNText>
                  <RNText style={{ fontFamily: fonts.extrabold, fontSize: 14, color: hot ? colors.success : colors.text }}>{b}</RNText>
                </View>
              </View>
            ))}
          </ScrollView>

          {active.data?.map((b) => (
            <FadeIn key={b.id}>
              <Card onPress={() => router.push(b.trackable ? `/booking/${b.id}/track` : `/booking/${b.id}`)} tone="gold">
                <Row style={{ justifyContent: "space-between" }}>
                  <Text variant="label">YOUR UPCOMING BOOKING</Text>
                  <StatusPill status={b.status} awaitingPayment={b.awaitingPayment} />
                </Row>
                <Row>
                  <ServiceIcon name={b.service.key} size={48} />
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
            </FadeIn>
          ))}

          {/* Offers carousel with illustrations */}
          <View>
            <ScrollView
              ref={setCarousel}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              snapToInterval={SLIDE + space(3)}
              decelerationRate="fast"
              onMomentumScrollEnd={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / (SLIDE + space(3))))}
              contentContainerStyle={{ gap: space(3) }}
            >
              {PROMOS.map(({ Art, ...p }) => (
                <Pressable key={p.title} onPress={() => open(p.service)} style={{ width: SLIDE, height: 176, backgroundColor: p.bg, borderRadius: radius.xl, padding: space(5), overflow: "hidden" }}>
                  {/* Outline art needs a light backdrop on the dark banner. */}
                  {p.bg === colors.ink ? <View style={{ position: "absolute", right: -30, bottom: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: "#F3E3BC" }} /> : null}
                  <View style={{ position: "absolute", right: -8, bottom: -6 }}>
                    <Art width={150} height={128} />
                  </View>
                  <View style={{ width: "58%", gap: space(1.5) }}>
                    <RNText style={{ color: p.fg, fontFamily: fonts.extrabold, fontSize: 19, lineHeight: 24 }}>{p.title}</RNText>
                    <RNText style={{ color: p.fg, opacity: 0.75, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17 }}>{p.body}</RNText>
                  </View>
                  <View style={{ position: "absolute", left: space(5), bottom: space(5), backgroundColor: p.ctaBg, borderRadius: radius.pill, paddingHorizontal: space(4), paddingVertical: space(2) }}>
                    <RNText style={{ color: p.ctaFg, fontFamily: fonts.bold, fontSize: 13 }}>{p.cta} →</RNText>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <Row style={{ justifyContent: "center", gap: 6, marginTop: space(3) }}>
              {PROMOS.map((_, i) => (
                <View key={i} style={{ width: i === slide ? 20 : 6, height: 6, borderRadius: 3, backgroundColor: i === slide ? colors.ink : colors.border }} />
              ))}
            </Row>
          </View>

          <SectionHeader title="All services" />
          {services.loading ? <SkeletonCard /> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: space(4) }}>
            {all.map((s, i) => (
              <FadeIn key={s.key} delay={i * 25} style={{ width: "25%" }}>
                <Pressable onPress={() => open(s.key)} style={({ pressed }) => ({ alignItems: "center", gap: space(1.5), transform: [{ scale: pressed ? 0.94 : 1 }] })} accessibilityRole="button" accessibilityLabel={s.name}>
                  <View style={{ width: 66, height: 66, borderRadius: radius.lg + 2, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", ...shadow.card }}>
                    <ServiceIcon name={s.key} size={50} tile={false} />
                  </View>
                  <RNText style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.text, textAlign: "center" }} numberOfLines={2}>
                    {SERVICE_SHORT[s.key] ?? s.name}
                  </RNText>
                </Pressable>
              </FadeIn>
            ))}
          </View>

          <SectionHeader title="Most booked" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3), paddingRight: space(4) }} style={{ marginHorizontal: -space(4), paddingLeft: space(4) }}>
            {MOST_BOOKED.map((k) => all.find((s) => s.key === k))
              .filter((s): s is Service => Boolean(s))
              .map((s) => (
                <Pressable key={s.key} onPress={() => open(s.key)} style={{ width: 170, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.card }}>
                  <View style={{ height: 104, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" }}>
                    <View style={{ position: "absolute", width: 90, height: 90, borderRadius: 45, backgroundColor: "#F6E3B5", opacity: 0.6 }} />
                    <ServiceIcon name={s.key} size={72} tile={false} />
                    {s.rating ? (
                      <View style={{ position: "absolute", top: space(2), left: space(2), backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: space(2), paddingVertical: 2 }}>
                        <RNText style={{ fontFamily: fonts.bold, fontSize: 11, color: colors.text }}>
                          <RNText style={{ color: colors.star }}>★</RNText> {s.rating.toFixed(1)}
                        </RNText>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ padding: space(3), gap: 4 }}>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Text variant="small">{ratingLabel(s)} · materials free</Text>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.gold }}>{s.startingFromAed ? `From ${aed(s.startingFromAed)}` : "Free site visit & quote"}</Text>
                  </View>
                </Pressable>
              ))}
          </ScrollView>

          <Card>
            <Text variant="heading">Why customers choose Xtreme</Text>
            {[
              ["deep", "Vetted & trained professionals", "Background-checked, uniformed and insured teams."],
              ["regular", "Satisfaction guarantee", "Not happy? We'll come back and make it right."],
              ["sofa", "Secure payments", "Card, Apple Pay, Google Pay or Tamara. No gateway fees or hidden charges."],
            ].map(([icon, t, d]) => (
              <Row key={t} style={{ alignItems: "flex-start", marginTop: space(1) }}>
                <ServiceIcon name={icon!} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 15 }}>{t}</Text>
                  <Text variant="small">{d}</Text>
                </View>
              </Row>
            ))}
          </Card>

          <Card tone="ink" onPress={() => router.push("/chat")}>
            <Row>
              <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.goldBright, alignItems: "center", justifyContent: "center" }}>
                <RNText style={{ fontSize: 22 }}>💬</RNText>
                {chatUnread.data?.unread ? (
                  <View style={{ position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.ink }}>
                    <RNText style={{ color: "#fff", fontFamily: fonts.bold, fontSize: 10 }}>{chatUnread.data.unread}</RNText>
                  </View>
                ) : null}
              </View>
              <View style={{ flex: 1 }}>
                <RNText style={{ color: "#fff", fontFamily: fonts.bold, fontSize: 16 }}>Need help? Chat with us</RNText>
                <RNText style={{ color: "#BDB4A3", fontFamily: fonts.medium, fontSize: 13 }}>Instant answers · our team replies 7 days a week</RNText>
              </View>
              <RNText style={{ color: colors.goldBright, fontSize: 24 }}>›</RNText>
            </Row>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
