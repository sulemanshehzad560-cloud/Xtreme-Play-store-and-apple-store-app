import { Stack } from "expo-router";
import { colors } from "@/lib/theme";

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.gold,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="service/[key]" options={{ title: "Book a service" }} />
      <Stack.Screen name="booking/[id]/index" options={{ title: "Booking" }} />
      <Stack.Screen name="booking/[id]/track" options={{ title: "Live tracking" }} />
      <Stack.Screen name="booking/[id]/pay" options={{ title: "Payment", presentation: "modal" }} />
      <Stack.Screen name="phone" options={{ title: "Mobile number", presentation: "modal" }} />
    </Stack>
  );
}
