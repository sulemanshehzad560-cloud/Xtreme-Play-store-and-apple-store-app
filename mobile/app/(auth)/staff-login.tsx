import { useState } from "react";
import { Image, Pressable, Text as RNText, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorText, Text } from "@/components/ui";
import { LineIcon } from "@/components/LineIcon";
import { useAuth } from "@/lib/auth";
import { colors, fonts, radius, space } from "@/lib/theme";

/** Sign-in for Xtreme staff with the Staff ID and password set by the office. */
export default function StaffLogin() {
  const { signInStaff } = useAuth();
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signInStaff(staffId.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in");
      setBusy(false);
    }
  }

  const field = { flexDirection: "row" as const, alignItems: "center" as const, gap: space(3), backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space(4), height: 56 };
  const input = { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.text };

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <SafeAreaView edges={["top"]} style={{ paddingHorizontal: space(6), paddingTop: space(2), paddingBottom: space(8), gap: space(5) }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#2A251D", alignItems: "center", justifyContent: "center" }}>
          <RNText style={{ color: "#fff", fontSize: 22, marginTop: -2 }}>‹</RNText>
        </Pressable>
        <Image source={require("../../assets/logo-mark.png")} style={{ width: 92, height: 70 }} resizeMode="contain" />
        <View style={{ gap: space(1) }}>
          <RNText style={{ color: colors.goldBright, fontFamily: fonts.bold, fontSize: 14, letterSpacing: 1.5 }}>XTREME STAFF</RNText>
          <RNText style={{ color: "#fff", fontFamily: fonts.extrabold, fontSize: 30, letterSpacing: -0.5 }}>Staff sign in</RNText>
          <RNText style={{ color: "#BDB4A3", fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 }}>Use the Staff ID and password from the Xtreme office. You'll get new order alerts and your jobs here.</RNText>
        </View>
      </SafeAreaView>

      <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: colors.bg, borderTopLeftRadius: radius.xl + 4, borderTopRightRadius: radius.xl + 4, padding: space(6), gap: space(4) }}>
        <View style={{ gap: space(2) }}>
          <Text variant="label">STAFF ID</Text>
          <View style={field}>
            <LineIcon name="key" size={20} color={colors.gold} />
            <TextInput value={staffId} onChangeText={setStaffId} placeholder="e.g. XT-014" placeholderTextColor={colors.faint} autoCapitalize="characters" autoCorrect={false} textContentType="username" autoComplete="username" style={input} returnKeyType="next" />
          </View>
        </View>
        <View style={{ gap: space(2) }}>
          <Text variant="label">PASSWORD</Text>
          <View style={field}>
            <LineIcon name="shield" size={20} color={colors.gold} />
            <TextInput value={password} onChangeText={setPassword} placeholder="Your password" placeholderTextColor={colors.faint} secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} textContentType="password" autoComplete="password" style={input} returnKeyType="go" onSubmitEditing={submit} />
            <RNText onPress={() => setShow(!show)} style={{ color: colors.gold, fontFamily: fonts.bold, fontSize: 13 }}>
              {show ? "Hide" : "Show"}
            </RNText>
          </View>
        </View>
        <ErrorText error={error} />
        <Button title="Sign in" onPress={submit} loading={busy} disabled={!staffId.trim() || !password} />
        <Text variant="small" style={{ textAlign: "center" }}>
          Forgot your password? Ask the Xtreme office to reset it.
        </Text>
      </SafeAreaView>
    </View>
  );
}
