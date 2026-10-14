import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? "http://localhost:8080").replace(/\/$/, "");
export const GOOGLE_WEB_CLIENT_ID = extra.googleWebClientId;
export const GOOGLE_IOS_CLIENT_ID = extra.googleIosClientId;
