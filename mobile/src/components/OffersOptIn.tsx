import { useEffect, useState } from "react";
import { Pressable, Text as RNText, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { registerPush } from "@/lib/push";
import { colors, fonts, radius, space } from "@/lib/theme";

const DISMISSED = "offers-optin-dismissed";

/** Turns phone alerts for offers on or off (customers must opt in to marketing notifications). */
export async function setOffersOptIn(on: boolean) {
  await api("/me", { method: "PATCH", body: { marketingOptIn: on } });
  if (on) await registerPush().catch(() => undefined);
}

/**
 * Home-screen card asking customers whether they want seasonal offers on their phone.
 * Shown until they turn offers on or tap "Not now".
 */
export function OffersOptInCard() {
  const { user, refreshUser } = useAuth();
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(DISMISSED)
      .then((v) => setHidden(v === "1"))
      .catch(() => setHidden(false));
  }, []);

  if (hidden || !user || user.marketingOptIn) return null;

  async function turnOn() {
    setBusy(true);
    try {
      await setOffersOptIn(true);
      await refreshUser();
    } finally {
      setBusy(false);
    }
  }
  function notNow() {
    setHidden(true);
    SecureStore.setItemAsync(DISMISSED, "1").catch(() => undefined);
  }

  return (
    <View style={{ backgroundColor: colors.ink, borderRadius: radius.lg, padding: space(4), gap: space(3) }}>
      <View style={{ flexDirection: "row", gap: space(3), alignItems: "center" }}>
        <RNText style={{ fontSize: 30 }}>🎁</RNText>
        <View style={{ flex: 1, gap: 2 }}>
          <RNText style={{ color: "#fff", fontFamily: fonts.extrabold, fontSize: 16 }}>{t("Never miss a deal")}</RNText>
          <RNText style={{ color: "#D9D2C4", fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 19 }}>
            {t("Get Eid, National Day and seasonal offers as a notification on your phone. Turn them off any time in Account.")}
          </RNText>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: space(2) }}>
        <Pressable onPress={busy ? undefined : turnOn} accessibilityRole="button" style={{ flex: 1, backgroundColor: colors.goldBright, borderRadius: radius.md, paddingVertical: space(2.5), alignItems: "center" }}>
          <RNText style={{ color: "#16130E", fontFamily: fonts.bold, fontSize: 14 }}>{busy ? "…" : t("Turn on offers")}</RNText>
        </Pressable>
        <Pressable onPress={notNow} accessibilityRole="button" style={{ paddingHorizontal: space(4), paddingVertical: space(2.5), alignItems: "center", justifyContent: "center" }}>
          <RNText style={{ color: "#A79E8D", fontFamily: fonts.semibold, fontSize: 14 }}>{t("Not now")}</RNText>
        </Pressable>
      </View>
    </View>
  );
}
