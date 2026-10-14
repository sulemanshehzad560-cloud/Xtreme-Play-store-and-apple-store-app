import { useState } from "react";
import { Alert, Platform, View } from "react-native";
import { LogoOrb } from "@/components/LogoOrb";
import { router } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import { Button, Pulse, Screen, Text, Wordmark } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colors, fonts, space } from "@/lib/theme";

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
      <View style={{ alignItems: "center", marginTop: space(6), gap: space(4) }}>
        <LogoOrb size={196} />
        <Wordmark size={19} />
        <Text variant="title" style={{ textAlign: "center", fontSize: 24, lineHeight: 32 }}>
          Your home, spotless.{"\n"}At your fingertips.
        </Text>
        <Text variant="muted" style={{ textAlign: "center", paddingHorizontal: space(2) }}>
          Book cleaning and facilities services across Abu Dhabi, pay your way, and watch your team arrive live.
        </Text>
        <View style={{ flexDirection: "row", gap: space(2), flexWrap: "wrap", justifyContent: "center" }}>
          {["VETTED TEAMS", "LIVE TRACKING", "PAY IN 4"].map((t) => (
            <View key={t} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.glass, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Pulse color={colors.cyan} size={5} />
              <Text style={{ fontFamily: fonts.displayMedium, fontSize: 9, letterSpacing: 1.4, color: colors.goldHi }}>{t}</Text>
            </View>
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
            style={{ height: 54 }}
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
