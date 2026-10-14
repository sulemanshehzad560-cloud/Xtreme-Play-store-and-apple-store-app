import type { ExpoConfig } from "expo/config";

// Values that differ per environment come from EAS environment variables (eas.json / expo.dev).
const env = process.env;

const config: ExpoConfig = {
  name: "Xtreme-Home Partner",
  slug: "xtreme-home-partner",
  platforms: ["ios", "android"],
  scheme: "xtreme",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  backgroundColor: "#030405",
  ios: {
    bundleIdentifier: "ae.xtremefm.app",
    buildNumber: "1",
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
    versionCode: 1,
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#030405" },
    config: { googleMaps: { apiKey: env.GOOGLE_MAPS_ANDROID_KEY } },
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
      "POST_NOTIFICATIONS",
    ],
    googleServicesFile: env.GOOGLE_SERVICES_JSON,
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
        isAutoInitEnabled: true,
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
    eas: { projectId: env.EAS_PROJECT_ID },
  },
};

export default config;
