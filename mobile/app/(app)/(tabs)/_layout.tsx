import { StyleSheet, View } from "react-native";
import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { TabIcon } from "@/components/TabIcon";
import { colors, fonts } from "@/lib/theme";

/** Floating glass tab bar with a glowing active icon. */
export default function TabsLayout() {
  const icon =
    (name: "home" | "bookings" | "account") =>
    ({ color, focused }: { color: string; focused: boolean }) => (
      <View style={focused ? { shadowColor: colors.gold, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } } : undefined}>
        <TabIcon name={name} color={color} />
      </View>
    );
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: { fontFamily: fonts.displayMedium, fontSize: 9, letterSpacing: 1.4 },
        tabBarStyle: {
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 20,
          height: 66,
          paddingTop: 8,
          paddingBottom: 8,
          borderRadius: 24,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: colors.hairline,
          backgroundColor: "transparent",
          elevation: 0,
          overflow: "hidden",
        },
        tabBarItemStyle: { borderRadius: 18 },
        tabBarBackground: () => (
          <BlurView intensity={40} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(10,11,14,0.72)" }]} />
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: "HOME", tabBarIcon: icon("home") as never }} />
      <Tabs.Screen name="bookings" options={{ title: "BOOKINGS", tabBarIcon: icon("bookings") as never }} />
      <Tabs.Screen name="account" options={{ title: "ACCOUNT", tabBarIcon: icon("account") as never }} />
    </Tabs>
  );
}
