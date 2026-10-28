import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text as RNText, View } from "react-native";
import { BrandMark } from "@/components/BrandMark";
import { BirthdayPicker } from "@/components/BirthdayPicker";
import { ProfilePhoto } from "@/components/ProfilePhoto";
import { FreeMaterials } from "@/components/Promo";
import { Button, ErrorText, Input, Screen, StickyFooter, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, fonts, radius, space } from "@/lib/theme";

/** Shown once after signing in by phone, when the account has no name yet. */
export default function ProfileSetup() {
  const { user, refreshUser, signOut } = useAuth();
  const [name, setName] = useState(user?.fullName ?? "");
  const [dob, setDob] = useState<string | null>(user?.dateOfBirth ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = name.trim().length >= 2 && Boolean(dob);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api("/me", { method: "PATCH", body: { fullName: name.trim(), dateOfBirth: dob } });
      await refreshUser();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <Screen
        footer={
          <StickyFooter>
            <Button title="Continue" onPress={save} loading={busy} disabled={!ready} style={{ flex: 1 }} />
          </StickyFooter>
        }
      >
        <View style={{ backgroundColor: colors.ink, borderRadius: radius.xl, padding: space(5), gap: space(4), alignItems: "center" }}>
          <BrandMark size={26} sub="by Xtreme Facilities Management" />
          <ProfilePhoto size={96} />
          <View style={{ alignItems: "center", gap: 4 }}>
            <RNText style={{ color: "#fff", fontFamily: fonts.extrabold, fontSize: 22, textAlign: "center" }}>Welcome! Let's set up your profile</RNText>
            <RNText style={{ color: "#BDB4A3", fontFamily: fonts.medium, fontSize: 13.5, textAlign: "center" }}>
              Add a photo if you like, so your team knows who to look for.
            </RNText>
          </View>
        </View>

        <Input label="Full name" value={name} onChangeText={setName} placeholder="e.g. Sara Al Mansoori" textContentType="name" autoComplete="name" autoCapitalize="words" maxLength={80} />
        <BirthdayPicker value={dob} onChange={setDob} />
        <Text variant="small">We use your date of birth only to keep your account secure and to send you birthday offers.</Text>
        <ErrorText error={error} />
        <FreeMaterials compact />
        <Text onPress={signOut} style={{ textAlign: "center", color: colors.muted, fontFamily: fonts.semibold, marginTop: space(2) }}>
          Use a different number
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}
