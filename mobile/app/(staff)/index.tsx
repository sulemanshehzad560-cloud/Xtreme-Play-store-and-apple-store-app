import { useState } from "react";
import { Alert, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, InlineLoader, Row, Screen, StatusPill, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { STAFF_LABEL, when } from "@/lib/format";
import { ServiceIcon } from "@/components/art/ServiceIcon";
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

  const status = me.data?.status ?? "off_duty";
  const onDuty = status !== "off_duty";
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ backgroundColor: colors.ink, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl }}>
        <SafeAreaView edges={["top"]} style={{ padding: space(4), gap: space(3) }}>
          <Row style={{ justifyContent: "space-between" }}>
            <View>
              <RNText style={{ color: "#A79E8D", fontFamily: fonts.medium, fontSize: 13 }}>Xtreme team · {me.data?.teamName ?? ""}</RNText>
              <RNText style={{ color: "#fff", fontFamily: fonts.extrabold, fontSize: 24 }}>{me.data?.displayName ?? "…"}</RNText>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: onDuty ? "#173A27" : "#2A251D", borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: onDuty ? "#3DDC84" : "#8A8172" }} />
              <RNText style={{ color: "#fff", fontFamily: fonts.semibold, fontSize: 12 }}>{STAFF_LABEL[status]}</RNText>
            </View>
          </Row>
          {status === "off_duty" ? (
            <Button title="Go on duty" variant="gold" onPress={() => setDuty("available")} loading={busy} />
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
          <RNText style={{ color: "#A79E8D", fontFamily: fonts.medium, fontSize: 12 }}>Your location is shared only while you're on duty.</RNText>
        </SafeAreaView>
      </View>

      <Screen edges={["left", "right"]}>
        <Text variant="heading">Today's jobs</Text>
        {jobs.loading ? <InlineLoader label="Fetching your jobs…" /> : null}
        {!jobs.loading && jobs.data?.length === 0 ? (
          <Card style={{ alignItems: "center", paddingVertical: space(6) }}>
            <RNText style={{ fontSize: 36 }}>☕</RNText>
            <Text variant="muted">No jobs assigned yet.</Text>
          </Card>
        ) : null}
        {jobs.data?.map((j) => (
          <Card key={j.id} onPress={() => router.push(`/job/${j.id}`)}>
            <Row style={{ alignItems: "flex-start" }}>
              <ServiceIcon name={j.service.key} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.bold }}>{j.service.name}</Text>
                <Text variant="small">
                  {when(j.scheduledAt)} · {j.address.area}
                </Text>
              </View>
              <StatusPill status={j.status} />
            </Row>
          </Card>
        ))}
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </Screen>
    </View>
  );
}
