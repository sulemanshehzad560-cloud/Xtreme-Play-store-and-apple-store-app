import { useState } from "react";
import { router } from "expo-router";
import { Button, ErrorText, Input, Notice, Screen, Text } from "@/components/ui";
import { DEMO } from "@/lib/demo";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Adds or changes the account's verified mobile number (required before booking). */
export default function AddPhone() {
  const { requestCode, refreshUser } = useAuth();
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function step() {
    setBusy(true);
    setError(null);
    try {
      if (!sentTo) {
        setSentTo((await requestCode(phone)).phone);
      } else {
        await api("/me/phone", { body: { phone: sentTo, code } });
        await refreshUser();
        router.back();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={["left", "right"]}>
      <Text variant="heading">{sentTo ? `Enter the code sent to ${sentTo}` : "Add your mobile number"}</Text>
      <Text variant="muted">Our team uses it to reach you on the day of the service.</Text>
      {sentTo ? (
        <Input label="6-digit code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" autoFocus />
      ) : (
        <Input label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="050 123 4567" autoFocus />
      )}
      <ErrorText error={error} />
      {DEMO ? <Notice>Demo build: any number and any 6-digit code work.</Notice> : null}
      <Button title={sentTo ? "Verify" : "Send code"} onPress={step} loading={busy} disabled={sentTo ? code.length !== 6 : phone.length < 9} />
    </Screen>
  );
}
