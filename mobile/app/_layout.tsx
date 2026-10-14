import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StripeProvider } from "@stripe/stripe-react-native";
import { Loading } from "@/components/ui";
import { AuthProvider, useAuth } from "@/lib/auth";
import { registerPush } from "@/lib/push";
import { closeSocket } from "@/lib/realtime";
import { colors } from "@/lib/theme";
import "@/lib/staff-location"; // registers the background task at startup

function Gate() {
  const { ready, user } = useAuth();

  useEffect(() => {
    if (user) registerPush().catch(() => undefined);
    else closeSocket();
  }, [user?.id]);

  if (!ready) return <Loading />;
  const isStaff = user?.role === "staff";
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!user && !isStaff}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={isStaff}>
        <Stack.Screen name="(staff)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* The publishable key arrives with each payment, so none is needed up front. */}
      <StripeProvider publishableKey="" merchantIdentifier="merchant.ae.xtremefm.app" urlScheme="xtreme">
        <AuthProvider>
          <StatusBar style="light" />
          <Gate />
        </AuthProvider>
      </StripeProvider>
    </SafeAreaProvider>
  );
}
