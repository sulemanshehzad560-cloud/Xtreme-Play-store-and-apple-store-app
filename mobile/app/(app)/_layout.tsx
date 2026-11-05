import { Stack } from "expo-router";
import { colors, fonts } from "@/lib/theme";
import { t } from "@/lib/i18n";

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
      <Stack.Screen name="service/[key]" options={{ title: t("Book a service") }} />
      <Stack.Screen name="booking/[id]/index" options={{ title: t("Booking details") }} />
      <Stack.Screen name="booking/[id]/track" options={{ headerShown: false }} />
      <Stack.Screen name="booking/[id]/pay" options={{ title: t("Payment"), presentation: "modal" }} />
      <Stack.Screen name="booking/[id]/invoice" options={{ title: t("Receipt") }} />
      <Stack.Screen name="booking/[id]/chat" options={{ title: t("Messages") }} />
      <Stack.Screen name="phone" options={{ title: t("Mobile number"), presentation: "modal" }} />
      <Stack.Screen name="notifications" options={{ title: t("Notifications") }} />
      <Stack.Screen name="addresses" options={{ title: t("Saved addresses") }} />
      <Stack.Screen name="plans" options={{ title: t("Cleaning plans") }} />
      <Stack.Screen name="subscribe/[planId]" options={{ title: t("Subscribe") }} />
      <Stack.Screen name="subscriptions" options={{ title: t("My subscriptions") }} />
      <Stack.Screen name="chat" options={{ title: t("Chat with us") }} />
      <Stack.Screen name="invite" options={{ title: t("Invite friends") }} />
    </Stack>
  );
}
