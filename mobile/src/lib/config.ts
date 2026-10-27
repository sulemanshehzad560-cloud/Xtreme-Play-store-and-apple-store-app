import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? "http://localhost:8080").replace(/\/$/, "");

// Release builds only ever talk to the server over HTTPS (encrypted in transit).
const release = typeof __DEV__ !== "undefined" && !__DEV__;
if (release && process.env.EXPO_PUBLIC_DEMO !== "1" && !API_URL.startsWith("https://")) throw new Error(`Refusing to use an unencrypted API address: ${API_URL}`);
export const GOOGLE_WEB_CLIENT_ID = extra.googleWebClientId;
export const GOOGLE_IOS_CLIENT_ID = extra.googleIosClientId;
