import { useEffect, useRef, useState } from "react";
import { Pressable, Text as RNText, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button, ErrorText, Notice, Screen, StickyFooter, Text } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { DEMO } from "@/lib/demo";
import { colors, fonts, radius, space } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function Otp() {
  const params = useLocalSearchParams<{ phone: string; channel?: "whatsapp" | "sms" }>();
  const phone = params.phone;
  const [channel, setChannel] = useState<"whatsapp" | "sms">(params.channel ?? "sms");
  const { verifyCode, requestCode } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(30);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    const t = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  async function resend(via: "whatsapp" | "sms") {
    setError(null);
    try {
      const res = await requestCode(phone, via);
      setChannel(res.channel ?? via);
      setWait(res.resendIn);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not resend"));
    }
  }

  async function submit(value = code) {
    setBusy(true);
    setError(null);
    try {
      await verifyCode(phone, value);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("That code didn't work"));
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <StickyFooter>
          <Button title={t("Verify & continue")} onPress={() => submit()} loading={busy} disabled={code.length !== 6} style={{ flex: 1 }} />
        </StickyFooter>
      }
    >
      <Text onPress={() => router.back()} style={{ fontSize: 26 }} accessibilityLabel={t("Back")}>
        ‹
      </Text>
      <Text variant="title">{t("Enter the code")}</Text>
      <Text variant="muted">
        {channel === "whatsapp" ? t("Sent on WhatsApp to") : t("Sent by SMS to")}{" "}<Text style={{ fontFamily: fonts.bold }}>{phone}</Text> ·{" "}
        <Text onPress={() => router.back()} style={{ color: colors.gold, fontFamily: fonts.bold }}>
          {t("Change")}
        </Text>
      </Text>

      {/* Six boxes backed by one hidden input, so SMS autofill and paste work. */}
      <Pressable onPress={() => input.current?.focus()} style={{ flexDirection: "row", justifyContent: "space-between", direction: "ltr" }}>
        {Array.from({ length: 6 }, (_, i) => (
          <View
            key={i}
            style={{
              width: 48,
              height: 58,
              borderRadius: radius.md,
              borderWidth: 1.5,
              borderColor: i === code.length ? colors.gold : colors.border,
              backgroundColor: colors.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <RNText style={{ fontFamily: fonts.bold, fontSize: 24, color: colors.text }}>{code[i] ?? ""}</RNText>
          </View>
        ))}
      </Pressable>
      <TextInput
        ref={input}
        value={code}
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, "").slice(0, 6);
          setCode(digits);
          if (digits.length === 6) void submit(digits);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus
        maxLength={6}
        style={{ position: "absolute", opacity: 0, height: 1, width: 1 }}
      />
      {channel === "whatsapp" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space(2), backgroundColor: "#E7F8EE", borderRadius: radius.md, padding: space(3) }}>
          <RNText style={{ fontSize: 20 }}>💬</RNText>
          <Text variant="small" style={{ flex: 1, color: "#13703F" }}>
            {t("Open WhatsApp to see your code from Xtreme. Tap \"Copy code\" and come back here.")}
          </Text>
        </View>
      ) : null}
      <Text variant="small">
        {wait ? (
          t("Resend code in 0:{0}", { 0: String(wait).padStart(2, "0") })
        ) : (
          <Text
            variant="small"
            style={{ color: colors.gold, fontFamily: fonts.bold }}
            onPress={() => resend(channel)}
          >
            {t("Resend code")}
          </Text>
        )}
      </Text>
      {channel === "whatsapp" && !wait ? (
        <Text variant="small" style={{ color: colors.gold, fontFamily: fonts.bold }} onPress={() => resend("sms")}>
          {t("Didn't get it on WhatsApp? Send by SMS instead")}
        </Text>
      ) : null}
      <ErrorText error={error} />
      {DEMO ? <Notice>{t("Demo build: enter any 6 digits.")}</Notice> : null}
    </Screen>
  );
}
