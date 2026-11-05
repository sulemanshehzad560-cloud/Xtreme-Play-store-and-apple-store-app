import { useEffect, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold } from "@expo-google-fonts/tajawal";
import { View } from "react-native";
import { Stack, router } from "expo-router";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StripeProvider } from "@stripe/stripe-react-native";
import { BrandIntro } from "@/components/BrandIntro";
import { LanguagePicker } from "@/components/LanguagePicker";
import { LanguageProvider, useLanguage } from "@/lib/i18n";
import { Loading } from "@/components/ui";
import { AuthProvider, useAuth } from "@/lib/auth";
import { DEMO } from "@/lib/demo";
import { registerPush } from "@/lib/push";
import { closeSocket } from "@/lib/realtime";
import { colors } from "@/lib/theme";
import { ThemeProvider, useThemeMode } from "@/lib/themeMode";
import "@/lib/staff-location"; // registers the background task at startup
import { api } from "@/lib/api";

// Hand over from the static native splash to the animated brand intro as soon as JS is up.
SplashScreen.preventAutoHideAsync().catch(() => undefined);
function Gate() {
  const { ready, user, refreshUser } = useAuth();
  const { dark } = useThemeMode();
  const { lang, chosen } = useLanguage();
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  // Keep the server in step with the app language, so notifications arrive in it too.
  useEffect(() => {
    if (!user || DEMO || user.locale === lang) return;
    api("/me", { method: "PATCH", body: { locale: lang } })
      .then(() => refreshUser())
      .catch(() => undefined);
  }, [user?.id, user?.locale, lang]);

  useEffect(() => {
    if (user) registerPush().catch(() => undefined);
    else closeSocket();
  }, [user?.id]);

  useEffect(() => {
    if (!user || DEMO) return;
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const data = res.notification.request.content.data as { bookingId?: string; type?: string };
      if (data?.type === "offer") return router.push("/");
      if (!data?.bookingId) return;
      // A new-order alert is for awareness; staff open job details once the office assigns them.
      if (user.role === "staff" && data.type === "new_order") return router.push("/");
      if (data.type === "job_chat") return router.push(user.role === "staff" ? `/chat/${data.bookingId}` : `/booking/${data.bookingId}/chat`);
      router.push(user.role === "staff" ? `/job/${data.bookingId}` : `/booking/${data.bookingId}`);
    });
    return () => sub.remove();
  }, [user?.id]);

  // 3-second brand intro; the mop loader only appears if start-up is still loading after it.
  if (!introDone) return <BrandIntro onDone={() => setIntroDone(true)} />;
  if (!chosen) return <LanguagePicker />;
  if (!ready) return <Loading />;
  const isStaff = user?.role === "staff";
  // Phone sign-ins start without a name: ask for name and date of birth before anything else.
  const needsProfile = !!user && !isStaff && !user.fullName?.trim();
  // Screens read the palette and language when they render, so changing either remounts the navigator.
  // Arabic lays the whole app out right-to-left.
  return (
    <View style={{ flex: 1, direction: lang === "ar" ? "rtl" : "ltr" }}>
    <Stack key={`${dark ? "dark" : "light"}-${lang}`} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={needsProfile}>
        <Stack.Screen name="profile-setup" />
      </Stack.Protected>
      <Stack.Protected guard={!!user && !isStaff && !needsProfile}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={isStaff}>
        <Stack.Screen name="(staff)" />
      </Stack.Protected>
    </Stack>
    </View>
  );
}

/** Stripe is only needed for real card payments; demo builds take payments in-app. */
function Payments({ children }: { children: React.ReactElement }) {
  if (DEMO) return children;
  // The publishable key arrives with each payment, so none is needed up front.
  return (
    <StripeProvider publishableKey="" merchantIdentifier="merchant.ae.xtremefm.app" urlScheme="xtreme">
      {children}
    </StripeProvider>
  );
}

function ThemedStatusBar() {
  return <StatusBar style={useThemeMode().dark ? "light" : "dark"} />;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Tajawal_400Regular,
    Tajawal_500Medium,
    Tajawal_700Bold,
    Tajawal_800ExtraBold,
  });
  // The native logo splash stays up until the fonts are ready, so text never flashes in a fallback font.
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <Payments>
        <AuthProvider>
          <LanguageProvider>
            <ThemeProvider>
              <ThemedStatusBar />
              <Gate />
            </ThemeProvider>
          </LanguageProvider>
        </AuthProvider>
      </Payments>
    </SafeAreaProvider>
  );
}
