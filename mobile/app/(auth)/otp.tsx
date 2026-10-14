import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Button, ErrorText, Input, Screen, Text } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function Otp() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { verifyCode, requestCode } = useAuth();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(30);

  useEffect(() => {
    const t = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  async function submit(value = code) {
    setBusy(true);
    setError(null);
    try {
      await verifyCode(phone, value, name.trim() || undefined);
      // The root layout switches to the app once the session is stored.
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't work");
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text variant="title">Enter the code</Text>
      <Text variant="muted">Sent to {phone}</Text>
      <Input
        label="6-digit code"
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
      />
      <Input label="Your name (new customers)" value={name} onChangeText={setName} textContentType="name" autoComplete="name" />
      <ErrorText error={error} />
      <Button title="Continue" onPress={() => submit()} loading={busy} disabled={code.length !== 6} />
      <Button
        title={wait ? `Resend code in ${wait}s` : "Resend code"}
        variant="ghost"
        disabled={wait > 0}
        onPress={async () => {
          try {
            const r = await requestCode(phone);
            setWait(r.resendIn);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not resend");
          }
        }}
      />
      <Button title="Change number" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
