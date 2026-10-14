import { useEffect, useRef, useState } from "react";
import { Pressable, Text as RNText, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button, ErrorText, Notice, Screen, StickyFooter, Text } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { DEMO } from "@/lib/demo";
import { colors, fonts, radius, space } from "@/lib/theme";

export default function Otp() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
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

  async function submit(value = code) {
    setBusy(true);
    setError(null);
    try {
      await verifyCode(phone, value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't work");
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <StickyFooter>
          <Button title="Verify & continue" onPress={() => submit()} loading={busy} disabled={code.length !== 6} style={{ flex: 1 }} />
        </StickyFooter>
      }
    >
      <Text onPress={() => router.back()} style={{ fontSize: 26 }} accessibilityLabel="Back">
        ‹
      </Text>
      <Text variant="title">Enter the code</Text>
      <Text variant="muted">
        Sent to <Text style={{ fontFamily: fonts.bold }}>{phone}</Text> ·{" "}
        <Text onPress={() => router.back()} style={{ color: colors.gold, fontFamily: fonts.bold }}>
          Change
        </Text>
      </Text>

      {/* Six boxes backed by one hidden input, so SMS autofill and paste work. */}
      <Pressable onPress={() => input.current?.focus()} style={{ flexDirection: "row", justifyContent: "space-between" }}>
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
      <Text variant="small">
        {wait ? (
          `Resend code in 0:${String(wait).padStart(2, "0")}`
        ) : (
          <Text
            variant="small"
            style={{ color: colors.gold, fontFamily: fonts.bold }}
            onPress={async () => {
              try {
                setWait((await requestCode(phone)).resendIn);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not resend");
              }
            }}
          >
            Resend code
          </Text>
        )}
      </Text>
      <ErrorText error={error} />
      {DEMO ? <Notice>Demo build: enter any 6 digits.</Notice> : null}
    </Screen>
  );
}
