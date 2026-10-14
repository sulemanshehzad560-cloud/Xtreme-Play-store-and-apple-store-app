import { useEffect, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { Orbitron_500Medium, Orbitron_700Bold, Orbitron_900Black } from "@expo-google-fonts/orbitron";
import { Exo2_400Regular, Exo2_500Medium, Exo2_600SemiBold, Exo2_700Bold } from "@expo-google-fonts/exo-2";
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

// Hand over from the static native splash to the animated loader as soon as JS is up.
SplashScreen.preventAutoHideAsync().catch(() => undefined);
const MIN_LOADER_MS = 1600;

function Gate() {
  const { ready, user } = useAuth();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
    const t = setTimeout(() => setShown(true), MIN_LOADER_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (user) registerPush().catch(() => undefined);
    else closeSocket();
  }, [user?.id]);

  if (!ready || !shown) return <Loading />;
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
  const [fontsLoaded, fontError] = useFonts({
    Orbitron_500Medium,
    Orbitron_700Bold,
    Orbitron_900Black,
    Exo2_400Regular,
    Exo2_500Medium,
    Exo2_600SemiBold,
    Exo2_700Bold,
  });
  // The native logo splash stays up until the fonts are ready, so text never flashes in a fallback font.
  if (!fontsLoaded && !fontError) return null;
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
