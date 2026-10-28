import { Tabs } from "expo-router";
import { TabIcon } from "@/components/TabIcon";
import { colors, fonts } from "@/lib/theme";

export default function TabsLayout() {
  const icon = (name: "home" | "bookings" | "account") => ({ color }: { color: string }) => <TabIcon name={name} color={color} />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingTop: 6, paddingBottom: 8 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home") as never }} />
      <Tabs.Screen name="bookings" options={{ title: "Bookings", tabBarIcon: icon("bookings") as never }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: icon("account") as never }} />
    </Tabs>
  );
}
