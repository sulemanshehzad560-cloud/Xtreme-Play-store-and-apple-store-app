import { Stack } from "expo-router";
import { colors, fonts } from "@/lib/theme";

export default function AppLayout() {
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
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="service/[key]" options={{ title: "Book a service" }} />
      <Stack.Screen name="booking/[id]/index" options={{ title: "Booking details" }} />
      <Stack.Screen name="booking/[id]/track" options={{ headerShown: false }} />
      <Stack.Screen name="booking/[id]/pay" options={{ title: "Payment", presentation: "modal" }} />
      <Stack.Screen name="booking/[id]/invoice" options={{ title: "Invoice" }} />
      <Stack.Screen name="phone" options={{ title: "Mobile number", presentation: "modal" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="addresses" options={{ title: "Saved addresses" }} />
      <Stack.Screen name="plans" options={{ title: "Cleaning plans" }} />
      <Stack.Screen name="subscribe/[planId]" options={{ title: "Subscribe" }} />
      <Stack.Screen name="subscriptions" options={{ title: "My subscriptions" }} />
    </Stack>
  );
}
