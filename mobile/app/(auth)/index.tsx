import { useState } from "react";
import { Alert, Platform, View } from "react-native";
import { Image } from "expo-image";
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
      <View style={{ alignItems: "center", marginTop: space(10), gap: space(4) }}>
        <Image source={require("../../assets/logo.png")} style={{ width: 168, height: 168, borderRadius: 32 }} accessibilityLabel="Xtreme logo" />
        <Text variant="title" style={{ textAlign: "center" }}>
          Xtreme at your fingertips
        </Text>
        <Text variant="muted" style={{ textAlign: "center" }}>
          Book cleaning and facilities services across Abu Dhabi, and watch your team arrive live.
        </Text>
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
