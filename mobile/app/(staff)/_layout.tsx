import { Stack } from "expo-router";
import { colors, fonts } from "@/lib/theme";

export default function StaffLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text, fontFamily: fonts.bold, fontSize: 17 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="job/[id]" options={{ title: "Job" }} />
    </Stack>
  );
}
