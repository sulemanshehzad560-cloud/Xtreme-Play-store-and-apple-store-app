import { Stack } from "expo-router";
import { colors, fonts } from "@/lib/theme";

export default function StaffLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.gold,
        headerTitleStyle: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
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
