import { useState } from "react";
import { Alert, Platform, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import { Button, Screen, Text } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colors, space } from "@/lib/theme";

export default function Welcome() {
  const auth = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  const run = (key: string, fn: () => Promise<unknown>) => async () => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Please try again";
      if (!/cancel/i.test(msg)) Alert.alert("Sign-in failed", msg);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <LinearGradient
        colors={["rgba(226,193,112,0.22)", "rgba(3,4,5,0)"]}
        style={{ position: "absolute", top: -space(4), left: -space(4), right: -space(4), height: 420 }}
      />
      <View style={{ alignItems: "center", marginTop: space(8), gap: space(4) }}>
        <View style={{ shadowColor: colors.gold, shadowOpacity: 0.45, shadowRadius: 30, shadowOffset: { width: 0, height: 0 }, elevation: 12 }}>
          <Image source={require("../../assets/logo.png")} style={{ width: 150, height: 150, borderRadius: 34 }} accessibilityLabel="Xtreme logo" />
        </View>
        <Text style={{ color: colors.gold, fontSize: 24, fontWeight: "900", letterSpacing: 3, textAlign: "center" }}>
          XTREME<Text style={{ fontSize: 24, fontWeight: "900" }}>-</Text>HOME PARTNER
        </Text>
        <Text variant="title" style={{ textAlign: "center", fontSize: 26 }}>
          Your home, spotless.{"\n"}Right at your fingertips.
        </Text>
        <Text variant="muted" style={{ textAlign: "center" }}>
          Book cleaning and facilities services across Abu Dhabi, pay your way, and watch your team arrive live.
        </Text>
        <View style={{ flexDirection: "row", gap: space(2), flexWrap: "wrap", justifyContent: "center" }}>
          {["✓ Vetted teams", "✓ Live tracking", "✓ Pay in 4 with Tamara"].map((t) => (
            <Text key={t} variant="small" style={{ color: colors.goldHi, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              {t}
            </Text>
          ))}
        </View>
      </View>

      <View style={{ gap: space(3), marginTop: space(8) }}>
        <Button title="Continue with mobile number" onPress={() => router.push("/(auth)/phone")} />
        {Platform.OS === "ios" ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={14}
            style={{ height: 52 }}
            onPress={run("apple", auth.signInWithApple)}
          />
        ) : null}
        <Button title="Continue with Google" variant="secondary" loading={busy === "google"} onPress={run("google", auth.signInWithGoogle)} />
        <Button title="Continue with Facebook" variant="secondary" loading={busy === "facebook"} onPress={run("facebook", auth.signInWithFacebook)} />
      </View>

      <Text variant="small" style={{ textAlign: "center", marginTop: space(4), color: colors.faint }}>
        By continuing you agree to Xtreme's terms of service and privacy policy.
      </Text>
    </Screen>
  );
}
