import { useEffect, useState } from "react";
import { LineIcon } from "@/components/LineIcon";
import { hasOnboarded } from "@/lib/onboarding";
import { Alert, Platform, Pressable, Text as RNText, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppleIcon, FacebookIcon, GoogleIcon } from "@/components/BrandIcons";
import { Button, Text } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colors, fonts, radius, space } from "@/lib/theme";

const PERKS = [
  ["🛡️", "Vetted, trained & insured teams"],
  ["📍", "Track your team live on the map"],
  ["💳", "Card, Apple Pay, Google Pay or Tamara"],
];

export default function Welcome() {
  const auth = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    hasOnboarded().then((done) => {
      if (!done) router.replace("/(auth)/onboarding");
    });
  }, []);

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
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <SafeAreaView edges={["top"]} style={{ paddingHorizontal: space(6), paddingTop: space(6), paddingBottom: space(10), gap: space(5) }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
          <Image source={require("../../assets/logo.png")} style={{ width: 52, height: 52, borderRadius: 14 }} accessibilityLabel="Xtreme logo" />
          <View>
            <RNText style={{ color: colors.goldBright, fontFamily: fonts.extrabold, fontSize: 20 }}>
              Xtreme<RNText style={{ color: "#fff" }}>-Home Partner</RNText>
            </RNText>
            <RNText style={{ color: "#A79E8D", fontFamily: fonts.medium, fontSize: 12 }}>by Xtreme Facilities Management</RNText>
          </View>
        </View>
        <RNText style={{ color: "#fff", fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 38, letterSpacing: -0.5 }}>
          Home services you can trust, <RNText style={{ color: colors.goldBright }}>booked in a minute.</RNText>
        </RNText>
        <View style={{ gap: space(2.5) }}>
          {PERKS.map(([icon, text]) => (
            <View key={text} style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "#2A251D", alignItems: "center", justifyContent: "center" }}>
                <RNText style={{ fontSize: 14 }}>{icon}</RNText>
              </View>
              <RNText style={{ color: "#E9E3D6", fontFamily: fonts.medium, fontSize: 15 }}>{text}</RNText>
            </View>
          ))}
        </View>
      </SafeAreaView>

      <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: colors.bg, borderTopLeftRadius: radius.xl + 4, borderTopRightRadius: radius.xl + 4, padding: space(6), gap: space(3) }}>
        <Text variant="heading">Get started</Text>
        <Text variant="muted" style={{ marginTop: -space(2), marginBottom: space(1) }}>
          Sign in or create your account
        </Text>
        <Button title="Continue with mobile number" onPress={() => router.push("/(auth)/phone")} icon={<RNText style={{ fontSize: 16 }}>📱</RNText>} />
        {Platform.OS === "ios" ? (
          <Button title="Continue with Apple" variant="secondary" loading={busy === "apple"} onPress={run("apple", auth.signInWithApple)} icon={<AppleIcon color={colors.text} />} />
        ) : null}
        <Button title="Continue with Google" variant="secondary" loading={busy === "google"} onPress={run("google", auth.signInWithGoogle)} icon={<GoogleIcon />} />
        <Button title="Continue with Facebook" variant="secondary" loading={busy === "facebook"} onPress={run("facebook", auth.signInWithFacebook)} icon={<FacebookIcon />} />
        <Pressable onPress={() => router.push("/(auth)/staff-login")} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(2), paddingVertical: space(2) }}>
          <LineIcon name="key" size={18} color={colors.gold} />
          <RNText style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.muted }}>
            Xtreme staff? <RNText style={{ color: colors.gold, fontFamily: fonts.bold }}>Staff sign in</RNText>
          </RNText>
        </Pressable>
        <Text variant="small" style={{ textAlign: "center", marginTop: "auto" }}>
          By continuing you agree to our Terms of Service and Privacy Policy.
        </Text>
      </SafeAreaView>
    </View>
  );
}
