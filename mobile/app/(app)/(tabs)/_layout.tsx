import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { colors } from "@/lib/theme";

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.faint,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("⌂") }} />
      <Tabs.Screen name="bookings" options={{ title: "Bookings", tabBarIcon: icon("☰") }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: icon("◉") }} />
    </Tabs>
  );
}
