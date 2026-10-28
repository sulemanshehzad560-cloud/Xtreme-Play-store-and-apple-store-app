import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text as RNText, View } from "react-native";
import { Avatar } from "./ui";
import { pickAndUploadAvatar, removeAvatar } from "@/lib/avatar";
import { useAuth } from "@/lib/auth";
import { colors, fonts } from "../lib/theme";

/** The customer's photo with a camera badge; tap to take, choose or remove a photo. */
export function ProfilePhoto({ size = 72, light = false }: { size?: number; light?: boolean }) {
  const { user, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      if (await fn()) await refreshUser();
    } catch (e) {
      Alert.alert("Could not update your photo", e instanceof Error ? e.message : "Please try again");
    } finally {
      setBusy(false);
    }
  }

  function choose() {
    const options = ["Take photo", "Choose from library", ...(user?.avatarUrl ? ["Remove photo"] : []), "Cancel"];
    const act = (i: number) => {
      if (options[i] === "Take photo") void run(() => pickAndUploadAvatar("camera"));
      if (options[i] === "Choose from library") void run(() => pickAndUploadAvatar("library"));
      if (options[i] === "Remove photo") void run(removeAvatar);
    };
    Alert.alert("Profile photo", undefined, options.map((text, i) => ({ text, style: text === "Cancel" ? "cancel" : text === "Remove photo" ? "destructive" : "default", onPress: () => act(i) })));
  }

  return (
    <Pressable onPress={busy ? undefined : choose} accessibilityRole="button" accessibilityLabel={user?.avatarUrl ? "Change profile photo" : "Add profile photo"} style={{ width: size, height: size }}>
      <Avatar name={user?.fullName} uri={user?.avatarUrl} size={size} />
      {busy ? (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: size / 2, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.goldBright} />
        </View>
      ) : null}
      <View
        style={{
          position: "absolute",
          right: -2,
          bottom: -2,
          width: size * 0.36,
          height: size * 0.36,
          minWidth: 24,
          minHeight: 24,
          borderRadius: 999,
          backgroundColor: colors.goldBright,
          borderWidth: 2,
          borderColor: light ? colors.surface : colors.ink,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <RNText style={{ fontSize: Math.max(11, size * 0.17), fontFamily: fonts.bold }}>📷</RNText>
      </View>
    </Pressable>
  );
}
