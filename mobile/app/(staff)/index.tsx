import { useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { Button, Card, InlineLoader, Row, Screen, StatusPill, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { STAFF_LABEL, when } from "@/lib/format";
import { startSharingLocation, stopSharingLocation } from "@/lib/staff-location";
import { colors } from "@/lib/theme";
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
  return (
    <Screen>
      <Text variant="muted">Xtreme team</Text>
      <Text variant="title">{me.data?.displayName ?? "…"}</Text>
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Text variant="gold">Status</Text>
          <Text style={{ color: status === "off_duty" ? colors.faint : colors.ok, fontWeight: "700" }}>{STAFF_LABEL[status]}</Text>
        </Row>
        {status === "off_duty" ? (
          <Button title="Go on duty" onPress={() => setDuty("available")} loading={busy} />
        ) : (
          <Row>
            {status === "on_break" ? (
              <Button title="Back to work" onPress={() => setDuty("available")} loading={busy} />
            ) : (
              <Button title="Take a break" variant="secondary" onPress={() => setDuty("on_break")} loading={busy} />
            )}
            <Button title="Go off duty" variant="ghost" onPress={() => setDuty("off_duty")} />
          </Row>
        )}
        <Text variant="small">Your location is shared only while you are on duty.</Text>
      </Card>

      <Text variant="heading">My jobs</Text>
      {jobs.loading ? <InlineLoader label="Fetching your jobs…" /> : null}
      {jobs.data?.length === 0 ? <Text variant="muted">No jobs assigned yet.</Text> : null}
      {jobs.data?.map((j) => (
        <Card key={j.id} onPress={() => router.push(`/job/${j.id}`)}>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={{ fontWeight: "700", flex: 1 }}>{j.service.name}</Text>
            <StatusPill status={j.status} />
          </Row>
          <Text variant="muted">
            {when(j.scheduledAt)} · {j.address.area}
          </Text>
        </Card>
      ))}
      <Button title="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
