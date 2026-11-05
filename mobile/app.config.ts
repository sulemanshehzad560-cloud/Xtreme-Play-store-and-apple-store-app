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

// Apple Pay needs the merchant ID linked to the App ID in Apple Developer and Stripe's
// Apple Pay certificate. Until both are done, iPhone builds offer card payments only.
const APPLE_PAY = env.APPLE_PAY_ENABLED === "true";

// APP_VARIANT=staff builds the separate staff & supplier app ("Xtreme Staff"): its own Android
// package, so it installs next to the customer app, and it opens straight to the staff sign-in.
// Push alerts need GOOGLE_SERVICES_JSON_STAFF (Firebase → add Android app ae.xtremefm.staff).
const STAFF = env.APP_VARIANT === "staff";

const config: ExpoConfig = {
  name: STAFF ? "Xtreme Staff" : "Xtreme-Cleaning Partner",
  slug: "xtreme-home-partner",
  owner: env.EXPO_OWNER ?? EXPO_OWNER,
  platforms: STAFF ? ["android"] : ["ios", "android"],
  scheme: STAFF ? "xtremestaff" : "xtreme",
  version: "1.1.1",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  backgroundColor: "#030405",
  ios: {
    bundleIdentifier: "ae.xtremefm.app",
    supportsTablet: false,
    usesAppleSignIn: true,
    config: { googleMapsApiKey: env.GOOGLE_MAPS_IOS_KEY },
    infoPlist: {
      NSLocationWhenInUseUsageDescription: "Xtreme-Cleaning Partner uses your location to set the service address and to show your team arriving.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "Staff only: Xtreme-Cleaning Partner shares your location with the customer while you are on duty and travelling to a job.",
      // Camera: a profile photo, quote photos (sofa, mattress…), or scanning a card in Stripe's payment form. Apple requires the reasons.
      NSCameraUsageDescription: "Xtreme-Cleaning Partner uses the camera only when you choose to take a profile photo, photograph the item you want cleaned (for example a sofa or mattress) so we can send your quote, or scan your payment card.",
      NSPhotoLibraryUsageDescription: "Xtreme-Cleaning Partner lets you choose a profile photo, or photos of the item you want cleaned (for example a sofa or mattress) so we can send your quote.",
      NSMicrophoneUsageDescription: "Xtreme-Cleaning Partner uses the microphone only for in-app calls between you and your cleaning team (or, for staff, the customer).",
      // "audio" keeps an in-app call going when the screen locks.
      UIBackgroundModes: ["location", "remote-notification", "audio"],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: STAFF ? "ae.xtremefm.staff" : "ae.xtremefm.app",
    // Keep the app's data (sign-in, cached screens) out of cloud/device backups.
    allowBackup: false,
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#030405" },
    ...(env.GOOGLE_MAPS_ANDROID_KEY ? { config: { googleMaps: { apiKey: env.GOOGLE_MAPS_ANDROID_KEY } } } : {}),
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
      "POST_NOTIFICATIONS",
      // In-app calls.
      "RECORD_AUDIO",
      "MODIFY_AUDIO_SETTINGS",
      "BLUETOOTH_CONNECT",
    ],
    // The WebRTC plugin adds the camera for video, which these calls don't use.
    blockedPermissions: ["android.permission.CAMERA"],
    googleServicesFile: STAFF ? googleServicesFile(env.GOOGLE_SERVICES_JSON_STAFF) : googleServicesFile(env.GOOGLE_SERVICES_JSON),
  },
  plugins: [
    "expo-router",
    ["expo-splash-screen", { image: "./assets/logo.png", imageWidth: 200, resizeMode: "contain", backgroundColor: "#030405" }],
    "expo-secure-store",
    "expo-apple-authentication",
    "expo-web-browser",
    [
      "expo-image-picker",
      {
        photosPermission: "Xtreme-Cleaning Partner lets you choose a profile photo, or photos of the item you want cleaned (for example a sofa or mattress) so we can send your quote.",
        cameraPermission: "Xtreme-Cleaning Partner uses the camera only when you choose to take a profile photo, photograph the item you want cleaned (for example a sofa or mattress) so we can send your quote, or scan your payment card.",
        microphonePermission: "Xtreme-Cleaning Partner uses the microphone for in-app calls with your cleaning team.",
      },
    ],
    [
      "expo-location",
      {
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    ["@config-plugins/react-native-webrtc", { microphonePermission: "Xtreme-Cleaning Partner uses the microphone only for in-app calls between you and your cleaning team (or, for staff, the customer)." }],
    ["expo-notifications", { icon: "./assets/notification-icon.png", color: "#E2C170" }],
    ["@react-native-google-signin/google-signin", { iosUrlScheme: env.GOOGLE_IOS_URL_SCHEME ?? "com.googleusercontent.apps.placeholder" }],
    [
      "react-native-fbsdk-next",
      {
        appID: env.FACEBOOK_APP_ID ?? "2305248043660220",
        clientToken: env.FACEBOOK_CLIENT_TOKEN ?? "09b9400741882cee37ede5f7289ae84d",
        displayName: "Xtreme-Cleaning Partner",
        scheme: `fb${env.FACEBOOK_APP_ID ?? "2305248043660220"}`,
        isAutoInitEnabled: true,
        advertiserIDCollectionEnabled: false,
        autoLogAppEventsEnabled: false,
      },
    ],
    ["@stripe/stripe-react-native", { merchantIdentifier: APPLE_PAY ? "merchant.ae.xtremefm.app" : undefined, enableGooglePay: true }],
    // No plain-HTTP traffic in store builds; development builds may talk to a local server.
    ["expo-build-properties", { android: { minSdkVersion: 24, usesCleartextTraffic: !(env.EXPO_PUBLIC_API_URL ?? "").startsWith("https://") } }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    apiUrl: env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080",
    googleWebClientId: env.GOOGLE_WEB_CLIENT_ID,
    googleIosClientId: env.GOOGLE_IOS_CLIENT_ID,
    // Android needs a Google Maps key to draw maps; without one the app shows a drawn map instead.
    androidMapsEnabled: Boolean(env.GOOGLE_MAPS_ANDROID_KEY),
    applePay: APPLE_PAY,
    variant: STAFF ? "staff" : "customer",
    eas: { projectId: env.EAS_PROJECT_ID ?? EXPO_PROJECT_ID },
  },
};

export default config;
