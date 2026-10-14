import * as Location from "expo-location";
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

export async function startSharingLocation(): Promise<boolean> {
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
      notificationTitle: "Xtreme: on duty",
      notificationBody: "Sharing your location with customers while you are on duty.",
      notificationColor: "#E2C170",
    },
  });
  return true;
}

export async function stopSharingLocation() {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}
