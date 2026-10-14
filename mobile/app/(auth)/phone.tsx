import { useState } from "react";
import { router } from "expo-router";
import { Button, ErrorText, Input, Screen, Text } from "@/components/ui";
import { useAuth } from "@/lib/auth";

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
    <Screen>
      <Text variant="title">Your mobile number</Text>
      <Text variant="muted">We'll text you a 6-digit code. UAE numbers can be entered as 05X XXX XXXX.</Text>
      <Input
        label="Mobile number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        placeholder="050 123 4567"
        autoFocus
      />
      <ErrorText error={error} />
      <Button title="Send code" onPress={submit} loading={busy} disabled={phone.replace(/\D/g, "").length < 9} />
      <Button title="Back" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
