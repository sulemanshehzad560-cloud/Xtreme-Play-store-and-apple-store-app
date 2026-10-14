import { useState } from "react";
import { Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { Button, ErrorText, Input, Notice, Screen, StickyFooter, Text } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { DEMO } from "@/lib/demo";
import { colors, fonts, space } from "@/lib/theme";

export default function Phone() {
  const { requestCode } = useAuth();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await requestCode(phone);
      router.push({ pathname: "/(auth)/otp", params: { phone: res.phone } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <StickyFooter>
          <Button title="Send code" onPress={submit} loading={busy} disabled={phone.replace(/\D/g, "").length < 9} style={{ flex: 1 }} />
        </StickyFooter>
      }
    >
      <Text onPress={() => router.back()} style={{ fontSize: 26 }} accessibilityLabel="Back">
        ‹
      </Text>
      <Text variant="title">What's your mobile number?</Text>
      <Text variant="muted">We'll text you a 6-digit code to verify it.</Text>
      <Input
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        placeholder="50 123 4567"
        autoFocus
        prefix={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingRight: space(3), borderRightWidth: 1, borderRightColor: colors.border }}>
            <RNText style={{ fontSize: 18 }}>🇦🇪</RNText>
            <RNText style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.text }}>+971</RNText>
          </View>
        }
      />
      <ErrorText error={error} />
      {DEMO ? <Notice>Demo build: any number works. Use 050 000 0002 to see the staff app.</Notice> : null}
    </Screen>
  );
}
