import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { FadeIn, SkeletonCard } from "@/components/art/Motion";
import { BellScene } from "@/components/art/Scenes";
import { Text } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, fonts, radius, space } from "@/lib/theme";
import { useApi } from "@/lib/useApi";

interface Notification {
  id: string;
  title: string;
  body: string;
  data: { bookingId?: string } | null;
  read: boolean;
  createdAt: string;
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const iconFor = (title: string) =>
  /pay|refund/i.test(title) ? "💳" : /way|arriv|track/i.test(title) ? "🚐" : /complet|thank/i.test(title) ? "✨" : /cancel/i.test(title) ? "✖️" : "📋";

export default function Notifications() {
  const { data, loading, reload } = useApi<Notification[]>("/me/notifications?limit=100");
  const [refreshing, setRefreshing] = useState(false);

  // Opening the inbox marks everything as read (the list keeps its highlight for this visit).
  useEffect(() => {
    if (data?.some((n) => !n.read)) void api("/me/notifications/read", { body: { ids: "all" } }).catch(() => undefined);
  }, [data !== null]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space(4), gap: space(3), paddingBottom: space(10) }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await reload();
            setRefreshing(false);
          }}
        />
      }
    >
      {loading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : null}
      {!loading && !data?.length ? (
        <View style={{ alignItems: "center", paddingTop: space(16), gap: space(3) }}>
          <BellScene size={130} />
          <Text variant="heading">You're all caught up</Text>
          <Text variant="muted" style={{ textAlign: "center" }}>
            Booking updates, payments and offers will appear here.
          </Text>
        </View>
      ) : null}
      {data?.map((n, i) => (
        <FadeIn key={n.id} delay={i * 30}>
          <Pressable
            onPress={() => n.data?.bookingId && router.push(`/booking/${n.data.bookingId}`)}
            style={{
              flexDirection: "row",
              gap: space(3),
              backgroundColor: n.read ? colors.surface : colors.surfaceAlt,
              borderRadius: radius.lg,
              padding: space(4),
              borderWidth: 1,
              borderColor: n.read ? colors.border : colors.goldLine,
            }}
          >
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" }}>
              <RNText style={{ fontSize: 18 }}>{iconFor(n.title)}</RNText>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 15 }}>{n.title}</Text>
              <Text variant="small" style={{ color: colors.text }}>
                {n.body}
              </Text>
              <Text variant="small">{ago(n.createdAt)}</Text>
            </View>
            {!n.read ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.gold, marginTop: 6 }} /> : null}
          </Pressable>
        </FadeIn>
      ))}
    </ScrollView>
  );
}
