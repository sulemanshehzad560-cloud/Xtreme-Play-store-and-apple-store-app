import * as SecureStore from "expo-secure-store";

const KEY = "xtreme.onboarded";

export const hasOnboarded = async () => (await SecureStore.getItemAsync(KEY).catch(() => null)) === "1";
export const markOnboarded = () => SecureStore.setItemAsync(KEY, "1").catch(() => undefined);
