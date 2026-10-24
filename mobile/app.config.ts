import { writeFileSync } from "node:fs";
import type { ExpoConfig } from "expo/config";

// Values that differ per environment come from EAS environment variables (eas.json / expo.dev).
const env = process.env;

// The Expo account and project this app builds under (expo.dev → project page).
// These are identifiers, not secrets. Fill them in once the Expo project exists.
const EXPO_OWNER: string | undefined = "suleman560s-team";
const EXPO_PROJECT_ID: string | undefined = "08853eae-507e-439b-a003-f9e133053b99";

/**
 * GOOGLE_SERVICES_JSON (Firebase, for Android push) can be an EAS "file" variable (a path)
 * or a plain variable holding the file's text, which is easier to set from a phone.
 */
function googleServicesFile(value: string | undefined): string | undefined {
  if (!value?.trim().startsWith("{")) return value;
  writeFileSync("./google-services.json", value.trim());
  return "./google-services.json";
}

const config: ExpoConfig = {
  name: "Xtreme-Home Partner",
  slug: "xtreme-home-partner",
  owner: env.EXPO_OWNER ?? EXPO_OWNER,
  platforms: ["ios", "android"],
  scheme: "xtreme",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  backgroundColor: "#030405",
  ios: {
    bundleIdentifier: "ae.xtremefm.app",
    supportsTablet: false,
    usesAppleSignIn: true,
    config: { googleMapsApiKey: env.GOOGLE_MAPS_IOS_KEY },
    infoPlist: {
      NSLocationWhenInUseUsageDescription: "Xtreme-Home Partner uses your location to set the service address and to show your team arriving.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "Staff only: Xtreme-Home Partner shares your location with the customer while you are on duty and travelling to a job.",
      UIBackgroundModes: ["location", "remote-notification"],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "ae.xtremefm.app",
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#030405" },
    ...(env.GOOGLE_MAPS_ANDROID_KEY ? { config: { googleMaps: { apiKey: env.GOOGLE_MAPS_ANDROID_KEY } } } : {}),
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
      "POST_NOTIFICATIONS",
    ],
    googleServicesFile: googleServicesFile(env.GOOGLE_SERVICES_JSON),
  },
  plugins: [
    "expo-router",
    ["expo-splash-screen", { image: "./assets/logo.png", imageWidth: 200, resizeMode: "contain", backgroundColor: "#030405" }],
    "expo-secure-store",
    "expo-apple-authentication",
    "expo-web-browser",
    [
      "expo-location",
      {
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    ["expo-notifications", { icon: "./assets/notification-icon.png", color: "#E2C170" }],
    ["@react-native-google-signin/google-signin", { iosUrlScheme: env.GOOGLE_IOS_URL_SCHEME ?? "com.googleusercontent.apps.placeholder" }],
    [
      "react-native-fbsdk-next",
      {
        appID: env.FACEBOOK_APP_ID ?? "000000000000000",
        clientToken: env.FACEBOOK_CLIENT_TOKEN ?? "placeholder",
        displayName: "Xtreme-Home Partner",
        scheme: `fb${env.FACEBOOK_APP_ID ?? "000000000000000"}`,
        // Without a real app id (e.g. demo builds) the SDK must not start on launch.
        isAutoInitEnabled: Boolean(env.FACEBOOK_APP_ID),
        advertiserIDCollectionEnabled: false,
        autoLogAppEventsEnabled: false,
      },
    ],
    ["@stripe/stripe-react-native", { merchantIdentifier: "merchant.ae.xtremefm.app", enableGooglePay: true }],
    ["expo-build-properties", { android: { minSdkVersion: 26 } }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    apiUrl: env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080",
    googleWebClientId: env.GOOGLE_WEB_CLIENT_ID,
    googleIosClientId: env.GOOGLE_IOS_CLIENT_ID,
    // Android needs a Google Maps key to draw maps; without one the app shows a drawn map instead.
    androidMapsEnabled: Boolean(env.GOOGLE_MAPS_ANDROID_KEY),
    eas: { projectId: env.EAS_PROJECT_ID ?? EXPO_PROJECT_ID },
  },
};

export default config;
