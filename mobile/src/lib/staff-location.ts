import * as Location from "expo-location";
import { Alert } from "react-native";
import * as TaskManager from "expo-task-manager";
import { api } from "./api";

export const LOCATION_TASK = "xtreme-staff-location";

// Runs in the background while a staff member is on duty. Positions are batched and
// uploaded; the server ignores them if the staff member has gone off duty.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const pings = data.locations.map((l) => ({
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    accuracy: l.coords.accuracy,
    heading: l.coords.heading != null && l.coords.heading >= 0 ? l.coords.heading : null,
    speed: l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null,
    recordedAt: new Date(l.timestamp).toISOString(),
  }));
  await api("/staff/me/location", { body: { pings } }).catch(() => undefined);
});

/**
 * Prominent disclosure required by Google Play (and good practice on iOS): explains the
 * background location use in our own words before the system permission prompts.
 */
export const LOCATION_DISCLOSURE =
  "Xtreme-Home Partner collects your location data to show customers and the Xtreme office where you are and when you will arrive, " +
  "even when the app is closed or not in use. This happens only while you are on duty and stops when you go off duty. " +
  "Your location is not used for advertising.";

function confirmDisclosure(): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert("Share your location while on duty", LOCATION_DISCLOSURE, [
      { text: "Not now", style: "cancel", onPress: () => resolve(false) },
      { text: "Continue", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}

export async function startSharingLocation(): Promise<boolean> {
  const current = await Location.getBackgroundPermissionsAsync();
  if (current.status !== "granted" && !(await confirmDisclosure())) return false;
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return false;
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") return false;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) return true;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10_000,
    distanceInterval: 25,
    deferredUpdatesInterval: 10_000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Xtreme-Home Partner: on duty",
      notificationBody: "Sharing your location with customers while you are on duty.",
      notificationColor: "#E2C170",
    },
  });
  return true;
}

export async function stopSharingLocation() {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}
