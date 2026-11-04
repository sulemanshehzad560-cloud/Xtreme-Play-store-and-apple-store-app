import { useEffect, useState } from "react";
import { LineIcon, iconColor, type LineIconName } from "@/components/LineIcon";
import { hasOnboarded } from "@/lib/onboarding";
import { Alert, Platform, Pressable, Text as RNText, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppleIcon, FacebookIcon, GoogleIcon } from "@/components/BrandIcons";
import { Button, Text } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colors, fonts, radius, space } from "@/lib/theme";
import { t } from "@/lib/i18n";

const PERKS: [LineIconName, string][] = [
  ["shield", "Vetted, trained & insured teams"],
  ["map", "Track your team live on the map"],
  ["card", "Card, Apple Pay, Google Pay or Tamara"],
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
      const msg = e instanceof Error ? e.message : t("Please try again");
      if (!/cancel/i.test(msg)) Alert.alert(t("Sign-in failed"), msg);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <SafeAreaView edges={["top"]} style={{ paddingHorizontal: space(6), paddingTop: space(6), paddingBottom: space(10), gap: space(5) }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
          <Image source={require("../../assets/logo.png")} style={{ width: 52, height: 52, borderRadius: 14 }} accessibilityLabel={t("Xtreme logo")} />
          <View>
            <RNText style={{ color: colors.goldBright, fontFamily: fonts.extrabold, fontSize: 20 }}>
              {t("Xtreme")}<RNText style={{ color: "#fff" }}>{t("-Cleaning Partner")}</RNText>
            </RNText>
            <RNText style={{ color: "#A79E8D", fontFamily: fonts.medium, fontSize: 12 }}>{t("by Xtreme Facilities Management")}</RNText>
          </View>
        </View>
        <RNText style={{ color: "#fff", fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 38, letterSpacing: -0.5 }}>
          {t("Cleaning services you can trust,")}{" "}<RNText style={{ color: colors.goldBright }}>{t("booked in a minute.")}</RNText>
        </RNText>
        <View style={{ gap: space(2.5) }}>
          {PERKS.map(([icon, text]) => (
            <View key={text} style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "#2A251D", alignItems: "center", justifyContent: "center" }}>
                <LineIcon name={icon} size={16} color={iconColor(icon)} />
              </View>
              <RNText style={{ color: "#E9E3D6", fontFamily: fonts.medium, fontSize: 15 }}>{t(text)}</RNText>
            </View>
          ))}
        </View>
      </SafeAreaView>

      <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: colors.bg, borderTopLeftRadius: radius.xl + 4, borderTopRightRadius: radius.xl + 4, padding: space(6), gap: space(3) }}>
        <Text variant="heading">{t("Get started")}</Text>
        <Text variant="muted" style={{ marginTop: -space(2), marginBottom: space(1) }}>
          {t("Sign in or create your account")}
        </Text>
        <Button title={t("Continue with mobile number")} onPress={() => router.push("/(auth)/phone")} icon={<LineIcon name="phone" size={18} color="#fff" />} />
        {Platform.OS === "ios" ? (
          <Button title={t("Continue with Apple")} variant="secondary" loading={busy === "apple"} onPress={run("apple", auth.signInWithApple)} icon={<AppleIcon color={colors.text} />} />
        ) : null}
        <Button title={t("Continue with Google")} variant="secondary" loading={busy === "google"} onPress={run("google", auth.signInWithGoogle)} icon={<GoogleIcon />} />
        <Button title={t("Continue with Facebook")} variant="secondary" loading={busy === "facebook"} onPress={run("facebook", auth.signInWithFacebook)} icon={<FacebookIcon />} />
        <Pressable onPress={() => router.push("/(auth)/staff-login")} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(2), paddingVertical: space(2) }}>
          <LineIcon name="key" size={18} color={colors.gold} />
          <RNText style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.muted }}>
            {t("Xtreme staff?")}{" "}<RNText style={{ color: colors.gold, fontFamily: fonts.bold }}>{t("Staff sign in")}</RNText>
          </RNText>
        </Pressable>
        <Text variant="small" style={{ textAlign: "center", marginTop: "auto" }}>
          {t("By continuing, you agree to our Terms of Service and Privacy Policy.")}
        </Text>
      </SafeAreaView>
    </View>
  );
}
