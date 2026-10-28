import { useState } from "react";
import { Alert, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, InlineLoader, Row, Screen, StatusPill, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { STAFF_LABEL, when } from "@/lib/format";
import { ServiceIcon } from "@/components/art/ServiceIcon";
import { BrandMark } from "@/components/BrandMark";
import { startSharingLocation, stopSharingLocation } from "@/lib/staff-location";
import { colors, fonts, radius, space } from "@/lib/theme";
import type { Booking, StaffStatus } from "@/lib/types";
import { useApi } from "@/lib/useApi";

interface Me {
  displayName: string;
  status: StaffStatus;
  teamName: string | null;
}

export default function StaffHome() {
  const { signOut } = useAuth();
  const me = useApi<Me>("/staff/me");
  const jobs = useApi<Booking[]>("/staff/me/jobs?scope=active");
  const [busy, setBusy] = useState(false);

  async function setDuty(status: "available" | "on_break" | "off_duty") {
    setBusy(true);
    try {
      // Demo builds also run the real permission flow, so testers and store reviewers see it.
      if (status === "available") {
        const ok = await startSharingLocation();
        if (!ok) {
          Alert.alert("Location needed", "Allow location 'Always' so customers can see you arriving. You can change this in Settings.");
          return;
        }
      }
      const next = await api<Me>("/staff/me/status", { method: "PUT", body: { status } });
      if (status === "off_duty") await stopSharingLocation();
      me.setData(next);
    } catch (e) {
      Alert.alert("Could not update", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  // Signing out ends the shift: off duty and no more location sharing.
  async function signOutStaff() {
    try {
      await api("/staff/me/status", { method: "PUT", body: { status: "off_duty" } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/finish job/i.test(msg)) return void Alert.alert("Job in progress", `${msg}, then sign out.`);
    }
    await stopSharingLocation().catch(() => undefined);
    await signOut();
  }

  const status = me.data?.status ?? "off_duty";
  const all = jobs.data ?? [];
  const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
  const today = all.filter((j) => isToday(j.scheduledAt));
  const live = all.filter((j) => ["en_route", "arrived", "in_progress"].includes(j.status));
  const next = [...all].filter((j) => !["completed", "cancelled"].includes(j.status)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
  const onDuty = status !== "off_duty";
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ backgroundColor: colors.ink, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl }}>
        <SafeAreaView edges={["top"]} style={{ padding: space(4), gap: space(4) }}>
          <BrandMark size={26} sub="Team app" />
          <Row style={{ justifyContent: "space-between" }}>
            <View>
              <RNText style={{ color: "#A79E8D", fontFamily: fonts.medium, fontSize: 13 }}>{me.data?.teamName ? `${me.data.teamName} · ` : ""}Good {greeting()}</RNText>
              <RNText style={{ color: "#fff", fontFamily: fonts.extrabold, fontSize: 24 }}>{me.data?.displayName ?? "…"}</RNText>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: onDuty ? "#173A27" : "#2A251D", borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: onDuty ? "#3DDC84" : "#8A8172" }} />
              <RNText style={{ color: "#fff", fontFamily: fonts.semibold, fontSize: 12 }}>{STAFF_LABEL[status]}</RNText>
            </View>
          </Row>
          {status === "off_duty" ? (
            <View style={{ gap: space(2) }}>
              {today.length ? (
                <RNText style={{ color: colors.goldBright, fontFamily: fonts.semibold, fontSize: 13 }}>
                  ⚠️ You have {today.length === 1 ? "a job" : `${today.length} jobs`} today. Go on duty before you set off so your customer can follow you on the map.
                </RNText>
              ) : null}
              <Button title="Go on duty" variant="gold" onPress={() => setDuty("available")} loading={busy} />
            </View>
          ) : (
            <Row style={{ gap: space(2) }}>
              {status === "on_break" ? (
                <Button title="Back to work" variant="gold" onPress={() => setDuty("available")} loading={busy} style={{ flex: 1 }} />
              ) : (
                <Button title="Take a break" variant="gold" onPress={() => setDuty("on_break")} loading={busy} style={{ flex: 1 }} />
              )}
              <Button title="Go off duty" variant="secondary" onPress={() => setDuty("off_duty")} style={{ flex: 1 }} />
            </Row>
          )}
          <Row style={{ gap: space(2) }}>
            <Stat value={String(today.length)} label="Today" />
            <Stat value={String(live.length)} label="Live now" />
            <Stat value={next ? when(next.scheduledAt).split(", ").pop() ?? "—" : "—"} label="Next start" />
          </Row>
          <RNText style={{ color: "#A79E8D", fontFamily: fonts.medium, fontSize: 12 }}>🔒 Your location is shared only while you're on duty, and only with your customer and the office.</RNText>
        </SafeAreaView>
      </View>

      <Screen edges={["left", "right"]}>
        <Row style={{ justifyContent: "space-between" }}>
          <Text variant="heading">Your jobs</Text>
          <Text variant="small">{all.length} assigned</Text>
        </Row>
        {jobs.loading ? <InlineLoader label="Fetching your jobs…" /> : null}
        {!jobs.loading && jobs.data?.length === 0 ? (
          <Card style={{ alignItems: "center", paddingVertical: space(6) }}>
            <RNText style={{ fontSize: 36 }}>☕</RNText>
            <Text variant="muted">No jobs assigned yet.</Text>
          </Card>
        ) : null}
        {jobs.data?.map((j) => (
          <Card key={j.id} onPress={() => router.push(`/job/${j.id}`)} tone={live.includes(j) ? "gold" : "plain"}>
            <Row style={{ alignItems: "flex-start" }}>
              <View style={{ width: 58, alignItems: "center", paddingVertical: space(1), borderRadius: radius.md, backgroundColor: colors.ink }}>
                <RNText style={{ color: colors.goldBright, fontFamily: fonts.extrabold, fontSize: 15 }}>{new Date(j.scheduledAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" })}</RNText>
                <RNText style={{ color: "#A79E8D", fontFamily: fonts.medium, fontSize: 11 }}>{isToday(j.scheduledAt) ? "Today" : new Date(j.scheduledAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" })}</RNText>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Row style={{ gap: space(2) }}>
                  <ServiceIcon name={j.service.key} size={22} tile={false} />
                  <Text style={{ fontFamily: fonts.bold, flex: 1 }}>{j.service.name}</Text>
                </Row>
                <Text variant="small">
                  {j.reference} · {[j.address.building, j.address.area].filter(Boolean).join(", ")}
                </Text>
                {j.priceAed == null ? <Text style={{ fontSize: 12, color: colors.gold, fontFamily: fonts.semibold }}>Quote on site</Text> : null}
              </View>
              <StatusPill status={j.status} />
            </Row>
          </Card>
        ))}
        <Button title="Sign out (goes off duty)" variant="ghost" onPress={() => void signOutStaff()} />
      </Screen>
    </View>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#1F1B13", borderRadius: radius.md, paddingVertical: space(2), paddingHorizontal: space(3) }}>
      <RNText style={{ color: "#fff", fontFamily: fonts.extrabold, fontSize: 18 }}>{value}</RNText>
      <RNText style={{ color: "#A79E8D", fontFamily: fonts.medium, fontSize: 11 }}>{label}</RNText>
    </View>
  );
}
