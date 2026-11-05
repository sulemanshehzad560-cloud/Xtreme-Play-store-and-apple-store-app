import { useEffect, useState } from "react";
import { Modal, Pressable, Text as RNText, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LineIcon } from "./LineIcon";
import { calls, type CallState } from "@/lib/voip";
import { isRTL, t } from "@/lib/i18n";
import { colors, fonts, space } from "@/lib/theme";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

function statusText(s: CallState, now: number) {
  switch (s.phase) {
    case "outgoing":
      return s.peerName ? t("Ringing…") : t("Calling…");
    case "incoming":
      return t("Incoming call");
    case "connecting":
      return t("Connecting…");
    case "active":
      return s.startedAt ? mmss(now - s.startedAt) : t("Connected");
    case "reconnecting":
      return t("Weak connection, reconnecting…");
    case "ended":
      if (s.error) return t(s.error);
      return s.endReason === "declined" ? t("Call declined") : s.endReason === "missed" ? t("No answer") : s.endReason === "failed" ? t("Call failed") : t("Call ended");
    default:
      return "";
  }
}

function RoundButton({ icon, label, onPress, color, active }: { icon: "call" | "mic" | "speaker" | "close"; label: string; onPress: () => void; color: string; active?: boolean }) {
  return (
    <View style={{ alignItems: "center", gap: space(2), width: 88 }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => ({ width: 68, height: 68, borderRadius: 34, backgroundColor: active ? "#fff" : color, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
      >
        {icon === "close" ? (
          <RNText style={{ color: "#fff", fontSize: 30, fontFamily: fonts.bold, transform: [{ rotate: "135deg" }] }}>✆</RNText>
        ) : icon === "mic" ? (
          <RNText style={{ fontSize: 26 }}>{active ? "🔇" : "🎙️"}</RNText>
        ) : icon === "speaker" ? (
          <RNText style={{ fontSize: 26 }}>🔊</RNText>
        ) : (
          <LineIcon name="call" size={30} color="#fff" />
        )}
      </Pressable>
      <RNText style={{ color: "#D9D2C4", fontFamily: fonts.semibold, fontSize: 12.5 }}>{label}</RNText>
    </View>
  );
}

/** Full-screen in-app call: incoming, ringing, connected and ended states. */
export function CallOverlay() {
  const [s, setS] = useState<CallState>(calls.state);
  const [now, setNow] = useState(Date.now());
  useEffect(() => calls.subscribe(setS), []);
  useEffect(() => {
    if (s.phase !== "active") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [s.phase]);

  if (s.phase === "idle") return null;
  const initials = (s.peerName.split("·")[0] || "X").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => (s.phase === "incoming" ? calls.decline() : undefined)}>
      <View style={{ flex: 1, backgroundColor: colors.ink, direction: isRTL() ? "rtl" : "ltr" }}>
        <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "space-between", paddingVertical: space(10) }}>
          <View style={{ alignItems: "center", gap: space(3), marginTop: space(8) }}>
            <RNText style={{ color: colors.goldBright, fontFamily: fonts.bold, fontSize: 12.5, letterSpacing: 1.4 }}>{t("XTREME IN-APP CALL")}</RNText>
            <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: "#2A251D", borderWidth: 2, borderColor: colors.goldBright, alignItems: "center", justifyContent: "center", marginTop: space(4) }}>
              <RNText style={{ color: colors.goldBright, fontFamily: fonts.extrabold, fontSize: 38 }}>{initials}</RNText>
            </View>
            <RNText style={{ color: "#fff", fontFamily: fonts.extrabold, fontSize: 26, textAlign: "center", paddingHorizontal: space(6) }}>{s.peerName || t("Connecting…")}</RNText>
            {s.reference ? <RNText style={{ color: "#A79E8D", fontFamily: fonts.medium, fontSize: 14 }}>{t("Booking {0}", { 0: s.reference })}</RNText> : null}
            <RNText style={{ color: s.phase === "ended" ? "#F2A3A3" : "#E9E3D6", fontFamily: fonts.semibold, fontSize: 17, marginTop: space(2), textAlign: "center", paddingHorizontal: space(8) }}>
              {statusText(s, now)}
            </RNText>
          </View>

          <View style={{ alignItems: "center", gap: space(6) }}>
            {s.recorded ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#2A251D", borderRadius: 999, paddingHorizontal: space(3), paddingVertical: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#E5484D" }} />
                <RNText style={{ color: "#E9E3D6", fontFamily: fonts.semibold, fontSize: 12 }}>{t("This call is recorded for quality and safety")}</RNText>
              </View>
            ) : null}
            <RNText style={{ color: "#8C8475", fontFamily: fonts.medium, fontSize: 12.5 }}>{t("Free call over the internet · numbers stay private")}</RNText>
            {s.phase === "incoming" ? (
              <View style={{ flexDirection: "row", gap: space(12) }}>
                <RoundButton icon="close" label={t("Decline")} color="#E5484D" onPress={() => void calls.decline()} />
                <RoundButton icon="call" label={t("Answer")} color="#1E9E5A" onPress={() => void calls.accept()} />
              </View>
            ) : s.phase === "ended" ? null : (
              <View style={{ flexDirection: "row", gap: space(2) }}>
                <RoundButton icon="mic" label={s.muted ? t("Unmute") : t("Mute")} color="#2A251D" active={s.muted} onPress={() => calls.toggleMute()} />
                <RoundButton icon="close" label={t("End")} color="#E5484D" onPress={() => void calls.hangUp()} />
                <RoundButton icon="speaker" label={t("Speaker")} color="#2A251D" active={s.speaker} onPress={() => calls.toggleSpeaker()} />
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
