import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { api } from "./api";
import { DEMO } from "./demo";

let registeredToken: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Asks for permission (once) and registers this device with the API. */
export async function registerPush() {
  if (DEMO || !Device.isDevice) return;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("bookings", {
      name: "Booking updates",
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: "#E2C170",
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  registeredToken = data;
  await api("/me/push-tokens", { body: { token: data, platform: Platform.OS === "ios" ? "ios" : "android" } });
}

export async function unregisterPush() {
  if (registeredToken) await api("/me/push-tokens", { method: "DELETE", body: { token: registeredToken } });
  registeredToken = null;
}
