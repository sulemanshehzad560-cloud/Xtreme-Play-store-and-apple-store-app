import { useCallback, useEffect, useMemo, useState } from "react";
import { Dimensions, Image, Linking, Pressable, RefreshControl, ScrollView, Text as RNText, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { FadeIn, SkeletonCard } from "@/components/art/Motion";
import { PayInFourScene } from "@/components/art/Scenes";
import { PromoBanner, type Promo } from "@/components/PromoBanner";
import { ServiceBanner, ServiceIcon } from "@/components/art/ServiceIcon";
import { BrandMark } from "@/components/BrandMark";
import { FreeMaterials, PlanPromo } from "@/components/Promo";
import { LineIcon, iconColor, type LineIconName } from "@/components/LineIcon";
import { Card, Row, SectionHeader, StatusPill, Text } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { aed, when } from "@/lib/format";
import { ratingLabel } from "@/lib/rating";
import { MOST_BOOKED, SERVICE_SHORT } from "@/lib/serviceIcons";
import { colors, fonts, radius, shadow, space } from "@/lib/theme";
import type { Booking, Company, Service } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { t } from "@/lib/i18n";

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

// Home offers. Prices and savings come from the dashboard's price list.
const promos = (homeFrom: number | null, weeklySave: number): Promo[] => [
  {
    key: "regular",
    tag: t("MATERIALS FREE"),
    title: homeFrom ? t("Home cleaning from AED {0}", { 0: homeFrom }) : t("Home cleaning by trained teams"),
    body: t("Vetted, uniformed cleaners. Book for today, pay in the app."),
    cta: t("Book a clean"),
    service: "regular",
    photo: require("../../../assets/promos/team-apartment.jpg"),
    colors: ["#14110B", "#14110B"],
    accent: "#E2C170",
  },
  {
    key: "plans",
    tag: weeklySave > 0 ? t("SAVE {0}% WEEKLY", { 0: weeklySave }) : t("SAME TEAM EVERY VISIT"),
    title: t("Your home cleaned every week, for less"),
    body: t("Monthly or yearly plans. Plan all your visits on a calendar."),
    cta: t("See plans"),
    service: "plans",
    photo: require("../../../assets/promos/bed-making.jpg"),
    colors: ["#14213D", "#14213D"],
    accent: "#8FC1FF",
  },
  {
    key: "glass",
    tag: t("STREAK-FREE"),
    title: t("Sparkling windows & glass"),
    body: t("Balcony doors, glass walls and windows, inside and out."),
    cta: t("Book glass cleaning"),
    service: "glass",
    photo: require("../../../assets/promos/glass-cleaning.jpg"),
    align: "right",
    colors: ["#0B2A4A", "#0B2A4A"],
    accent: "#7BE3D1",
  },
  {
    key: "deep",
    tag: t("FREE SITE VISIT"),
    title: t("Deep cleaning, every corner"),
    body: t("Homes and offices, move-in ready. Priced on a free visit."),
    cta: t("Book a visit"),
    service: "deep",
    photo: require("../../../assets/promos/office-clean.jpg"),
    colors: ["#0B3B37", "#0B3B37"],
    accent: "#7BE3D1",
  },
  {
    key: "sofa",
    tag: t("STAINS & ODOURS OUT"),
    title: t("Fresh sofas, carpets & mattresses"),
    body: t("Deep extraction lifts dust and allergens. Dry in hours."),
    cta: t("Book sofa cleaning"),
    service: "sofa",
    art: "carpet",
    colors: ["#3A1730", "#7A2E5B"],
    accent: "#F7A8D0",
  },
  {
    key: "tamara",
    tag: t("PAY IN 4"),
    title: t("Split any booking into 4 with Tamara"),
    body: t("Interest-free instalments. Choose Tamara at checkout."),
    cta: t("Book now"),
    service: "regular",
    art: <PayInFourScene width={140} height={120} />,
    colors: ["#FFE9EF", "#F8C9D7"],
    light: true,
    accent: "#F3A6BE",
  },
];

export default function Home() {
  const { user } = useAuth();
  const services = useApi<{ services: Service[]; frequencyDiscountPercent?: { weekly: number; biweekly: number }; referral?: { friendAed: number; rewardAed: number } }>("/catalog/services");
  const stats = useApi<{ rating: number | null; reviewCount: number; completedJobs: number }>("/catalog/stats");
  const referral = services.data?.referral;
  const homeFrom = services.data?.services.find((s) => s.key === "regular")?.startingFromAed ?? null;
  const weeklySave = services.data?.frequencyDiscountPercent?.weekly ?? 0;
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
    const t = setInterval(() => setSlide((s) => (s + 1) % promos(homeFrom, weeklySave).length), 5000);
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
    return q ? all.filter((s) => `${t(s.name)} ${SERVICE_SHORT[s.key] ?? ""}`.toLowerCase().includes(q)) : [];
  }, [query, all]);
  const rawArea = addresses.data?.find((a) => a.isDefault)?.area ?? addresses.data?.[0]?.area;
  const area = rawArea ? t(rawArea) : rawArea;
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
              <BrandMark size={30} sub={t("by Xtreme Facilities Management")} />
              <Pressable onPress={() => router.push("/notifications")} accessibilityRole="button" accessibilityLabel={t("Notifications, {0} unread", { 0: unread })} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#2A251D", alignItems: "center", justifyContent: "center" }}>
                <LineIcon name="bell" size={21} color="#F6F0E3" />
                {unread ? (
                  <View style={{ position: "absolute", top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: colors.ink }}>
                    <RNText style={{ color: "#fff", fontFamily: fonts.bold, fontSize: 10 }}>{unread > 9 ? "9+" : unread}</RNText>
                  </View>
                ) : null}
              </Pressable>
            </Row>
            <Pressable onPress={() => router.push("/addresses")} style={{ flexDirection: "row", alignItems: "center", gap: space(2), alignSelf: "flex-start", backgroundColor: "#211D17", borderRadius: radius.pill, paddingLeft: space(2), paddingRight: space(4), paddingVertical: space(1.5), borderWidth: 1, borderColor: "#3A3328" }} accessibilityRole="button" accessibilityLabel={t("Service location")}>
              <LineIcon name="pin" size={18} color={colors.goldBright} />
              <RNText style={{ color: "#A79E8D", fontFamily: fonts.medium, fontSize: 12 }}>{t("Service location")}</RNText>
              <RNText style={{ color: "#fff", fontFamily: fonts.bold, fontSize: 13, flexShrink: 1 }} numberOfLines={1}>
                {area ?? t("Set your address")} ▾
              </RNText>
            </Pressable>
            <View style={{ gap: 2 }}>
              <RNText style={{ color: colors.goldBright, fontFamily: fonts.semibold, fontSize: 15 }}>{first ? t("Hi {0},", { 0: first }) : t("Hi there,")}</RNText>
              <RNText style={{ color: "#fff", fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 33, letterSpacing: -0.4 }}>{t("What can we help you with today?")}</RNText>
              {/* Social proof, shown once there are enough real reviews to be meaningful. */}
              {stats.data?.rating && stats.data.reviewCount >= 5 ? (
                <RNText style={{ color: "#E9E3D6", fontFamily: fonts.semibold, fontSize: 13, marginTop: 2 }}>
                  <RNText style={{ color: colors.star }}>★ </RNText>
                  {stats.data.rating.toFixed(1)}{" "}{t("from")}{" "}{stats.data.reviewCount.toLocaleString("en")}{" "}{t("reviews")}
                  {stats.data.completedJobs >= 50 ? t(" · {0}+ homes cleaned", { 0: (Math.floor(stats.data.completedJobs / 50) * 50).toLocaleString("en") }) : ""}
                </RNText>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space(2) }}>
              {/* Every booking includes cleaning materials at no cost. */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.goldBright, borderRadius: radius.pill, paddingLeft: space(2.5), paddingRight: space(3.5), paddingVertical: space(1.5) }}>
                <LineIcon name="bottle" size={16} color="#16130E" />
                <RNText style={{ color: "#16130E", fontFamily: fonts.extrabold, fontSize: 13 }}>{t("Cleaning materials FREE")}</RNText>
              </View>
              {teams && teams.available > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#24201A", borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#3DDC84" }} />
                  <RNText style={{ color: "#E9E3D6", fontFamily: fonts.semibold, fontSize: 12 }}>
                    {teams.available}{" "}{t("teams available")}{teams.nearestEtaMinutes != null ? t(" · ~{0} min", { 0: teams.nearestEtaMinutes }) : ""}
                  </RNText>
                </View>
              ) : null}
            </View>
          </SafeAreaView>
        </View>

        <View style={{ paddingHorizontal: space(4), marginTop: -space(7), gap: space(5) }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(2), backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: space(4), height: 56, ...shadow.raised }}>
            <LineIcon name="search" size={20} color={colors.faint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("Search services (e.g. sofa, carpet, kitchen)")}
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
              {results.length === 0 ? <Text variant="muted" style={{ padding: space(3) }}>{t("No services match “")}{query}”.</Text> : null}
              {results.map((s) => (
                <Pressable key={s.key} onPress={() => open(s.key)} style={{ flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(2.5) }}>
                  <ServiceIcon name={s.key} size={40} />
                  <Text style={{ flex: 1, fontFamily: fonts.semibold }}>{t(s.name)}</Text>
                  <Text variant="small">{s.startingFromAed ? t("from {0}", { 0: aed(s.startingFromAed) }) : t("On quote")}</Text>
                </Pressable>
              ))}
            </Card>
          ) : null}

          {/* What every booking includes */}
          <View style={{ flexDirection: "row", gap: space(2) }}>
            {[
              ["star", t("Best value"), t("in the area"), true],
              ["bolt", t("Book for"), t("today"), false],
              ["shield", t("Vetted &"), t("insured"), false],
            ].map(([icon, a, b, hot]) => (
              <View
                key={String(a)}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space(1.5),
                  backgroundColor: hot ? colors.successSoft : colors.surface,
                  borderWidth: 1,
                  borderColor: hot ? colors.successLine : colors.border,
                  borderRadius: radius.lg,
                  paddingHorizontal: space(2.5),
                  paddingVertical: space(2.5),
                }}
              >
                <LineIcon name={icon as LineIconName} size={20} color={iconColor(icon as LineIconName)} />
                <View>
                  <RNText style={{ fontFamily: fonts.medium, fontSize: 11.5, color: hot ? colors.success : colors.muted }}>{a}</RNText>
                  <RNText style={{ fontFamily: fonts.extrabold, fontSize: 14, color: hot ? colors.success : colors.text }}>{b}</RNText>
                </View>
              </View>
            ))}
          </View>

          {active.data?.map((b) => (
            <FadeIn key={b.id}>
              <Card onPress={() => router.push(b.trackable ? `/booking/${b.id}/track` : `/booking/${b.id}`)} tone="gold">
                <Row style={{ justifyContent: "space-between" }}>
                  <Text variant="label">{t("UPCOMING")}</Text>
                  <StatusPill status={b.status} awaitingPayment={b.awaitingPayment} />
                </Row>
                <Row>
                  <ServiceIcon name={b.service.key} size={48} />
                  <View style={{ flex: 1 }}>
                    <Text variant="subheading">{t(b.service.name)}</Text>
                    <Text variant="small">
                      {when(b.scheduledAt)} · {b.reference}
                    </Text>
                  </View>
                </Row>
                {b.trackable ? (
                  <View style={{ backgroundColor: colors.ink, borderRadius: radius.md, paddingVertical: space(3), alignItems: "center" }}>
                    <Row style={{ gap: space(2) }}>
                      <LineIcon name="map" size={18} color={colors.goldBright} />
                      <RNText style={{ color: colors.goldBright, fontFamily: fonts.bold }}>{t("Track your team live")}</RNText>
                    </Row>
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
              {promos(homeFrom, weeklySave).map((p) => (
                <PromoBanner key={p.key} promo={p} width={SLIDE} onPress={() => open(p.service)} />
              ))}
            </ScrollView>
            <Row style={{ justifyContent: "center", gap: 6, marginTop: space(3) }}>
              {promos(homeFrom, weeklySave).map((_, i) => (
                <View key={i} style={{ width: i === slide ? 20 : 6, height: 6, borderRadius: 3, backgroundColor: i === slide ? colors.ink : colors.border }} />
              ))}
            </Row>
          </View>

          <PlanPromo />

          <SectionHeader title={t("All services")} />
          {services.loading ? <SkeletonCard /> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: space(4) }}>
            {all.map((s, i) => (
              <FadeIn key={s.key} delay={i * 25} style={{ width: "25%" }}>
                <Pressable onPress={() => open(s.key)} style={({ pressed }) => ({ alignItems: "center", gap: space(1.5), transform: [{ scale: pressed ? 0.94 : 1 }] })} accessibilityRole="button" accessibilityLabel={t(s.name)}>
                  <View style={{ width: 66, height: 66, borderRadius: radius.lg + 2, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", ...shadow.card }}>
                    <ServiceIcon name={s.key} size={50} tile={false} />
                  </View>
                  <RNText style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.text, textAlign: "center" }} numberOfLines={2}>
                    {t(SERVICE_SHORT[s.key] ?? s.name)}
                  </RNText>
                </Pressable>
              </FadeIn>
            ))}
          </View>

          <SectionHeader title={t("Most booked")} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3), paddingRight: space(4) }} style={{ marginHorizontal: -space(4), paddingLeft: space(4) }}>
            {MOST_BOOKED.map((k) => all.find((s) => s.key === k))
              .filter((s): s is Service => Boolean(s))
              .map((s) => (
                <Pressable key={s.key} onPress={() => open(s.key)} style={{ width: 170, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.card }}>
                  <View style={{ height: 104 }}>
                    <ServiceBanner name={s.key} height={104} />
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
                      {t(s.name)}
                    </Text>
                    <Text variant="small">{ratingLabel(s)}{" "}{t("· materials free")}</Text>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.gold }}>{s.startingFromAed ? t("From {0}", { 0: aed(s.startingFromAed) }) : t("Free site visit & quote")}</Text>
                  </View>
                </Pressable>
              ))}
          </ScrollView>

          <FreeMaterials />

          {referral && referral.friendAed > 0 && referral.rewardAed > 0 ? (
            <Pressable onPress={() => router.push("/invite")} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space(3), backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.goldLine, borderRadius: radius.lg, padding: space(4), opacity: pressed ? 0.85 : 1 })}>
              <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.goldBright, alignItems: "center", justifyContent: "center" }}>
                <LineIcon name="tag" size={22} color="#16130E" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.extrabold, fontSize: 15 }}>
                  {t("Give AED {0}, get AED {1}", { 0: referral.friendAed, 1: referral.rewardAed })}
                </Text>
                <Text variant="small">{t("Invite friends. They save on their first clean, you get credit.")}</Text>
              </View>
              <RNText style={{ color: colors.gold, fontSize: 22 }}>›</RNText>
            </Pressable>
          ) : null}

          <WhyXtreme />

          <Card tone="ink" onPress={() => router.push("/chat")}>
            <Row>
              <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.goldBright, alignItems: "center", justifyContent: "center" }}>
                <LineIcon name="chat" size={24} color="#16130E" />
                {chatUnread.data?.unread ? (
                  <View style={{ position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.ink }}>
                    <RNText style={{ color: "#fff", fontFamily: fonts.bold, fontSize: 10 }}>{chatUnread.data.unread}</RNText>
                  </View>
                ) : null}
              </View>
              <View style={{ flex: 1 }}>
                <RNText style={{ color: "#fff", fontFamily: fonts.bold, fontSize: 16 }}>{t("Need help? Chat with us")}</RNText>
                <RNText style={{ color: "#BDB4A3", fontFamily: fonts.medium, fontSize: 13 }}>{t("Instant answers · our team replies 7 days a week")}</RNText>
              </View>
              <RNText style={{ color: colors.goldBright, fontSize: 24 }}>›</RNText>
            </Row>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

type Tone = { bg: string; fg: string; sub: string; blob: string };

/** "Why customers choose Xtreme" as a grid of bold, colourful blocks. */
function WhyXtreme() {
  const tones: Record<string, Tone> = {
    ink: { bg: colors.ink, fg: "#fff", sub: "#CFC8BA", blob: "#3A3227" },
    gold: { bg: colors.goldBright, fg: "#16130E", sub: "#4A3D22", blob: "#EDD293" },
    green: { bg: colors.successSoft, fg: colors.success, sub: colors.successText, blob: colors.successLine },
    blue: { bg: colors.infoSoft, fg: colors.info, sub: colors.muted, blob: colors.surface },
  };
  const blocks: [LineIconName, string, string, Tone][] = [
    ["shield", t("Vetted pros"), t("Background-checked, uniformed and insured teams"), tones.ink],
    ["check", t("Satisfaction guarantee"), t("Not happy? We come back and make it right"), tones.gold],
    ["bottle", t("Materials free"), t("All materials and equipment included, every time"), tones.green],
    ["lock", t("Secure payments"), t("Card, Apple Pay, Google Pay or Tamara, encrypted and secure"), tones.blue],
  ];
  const tileW = (W - space(4) * 2 - space(3)) / 2;
  return (
    <View style={{ gap: space(3) }}>
      <View style={{ gap: 2 }}>
        <RNText style={{ color: colors.gold, fontFamily: fonts.extrabold, fontSize: 12, letterSpacing: 1.2 }}>{t("WHY XTREME")}</RNText>
        <Text variant="title">{t("Why customers choose us")}</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(3) }}>
        {blocks.map(([icon, title, body, t], i) => (
          <FadeIn key={title} delay={i * 90} style={{ width: tileW }}>
            <View style={{ minHeight: 168, borderRadius: radius.xl, padding: space(4), backgroundColor: t.bg, overflow: "hidden", gap: space(2), ...shadow.card }}>
              <View style={{ position: "absolute", right: -26, top: -26, width: 92, height: 92, borderRadius: 46, backgroundColor: t.blob, opacity: 0.7 }} />
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}>
                <LineIcon name={icon} size={26} color={t.fg} />
              </View>
              <RNText style={{ color: t.fg, fontFamily: fonts.extrabold, fontSize: 16, lineHeight: 20 }}>{title}</RNText>
              <RNText style={{ color: t.sub, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17 }}>{body}</RNText>
            </View>
          </FadeIn>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
        {(
          [
            ["bolt", t("Book for today")],
            ["calendar", t("Weekly or bi-weekly")],
            ["home", t("Free site visits")],
            ["chat", t("Help 7 days a week")],
          ] as [LineIconName, string][]
        ).map(([icon, c]) => (
          <View key={c} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface, borderColor: colors.goldLine, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) }}>
            <LineIcon name={icon} size={15} color={iconColor(icon)} />
            <RNText style={{ color: colors.text, fontFamily: fonts.semibold, fontSize: 12.5 }}>{c}</RNText>
          </View>
        ))}
      </View>
    </View>
  );
}
