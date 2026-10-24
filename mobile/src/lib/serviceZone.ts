// Copy of backend/src/config/service-zone.ts; the server has the final say.
export const SERVICE_ZONE_NAME = "Abu Dhabi city and Al Reem Island";
export const OUTSIDE_ZONE_MESSAGE = `Sorry, we only serve ${SERVICE_ZONE_NAME} at the moment. Please choose an address there.`;

const POLYGON: [number, number][] = [
  [24.6, 54.3],
  [24.6, 54.52],
  [24.54, 54.66],
  [24.48, 54.8],
  [24.3, 54.82],
  [24.22, 54.66],
  [24.24, 54.42],
  [24.38, 54.26],
];

export function inServiceZone(lat: number, lng: number): boolean {
  let inside = false;
  for (let i = 0, j = POLYGON.length - 1; i < POLYGON.length; j = i++) {
    const [aLat, aLng] = POLYGON[i]!;
    const [bLat, bLng] = POLYGON[j]!;
    if (aLat > lat !== bLat > lat && lng < ((bLng - aLng) * (lat - aLat)) / (bLat - aLat) + aLng) inside = !inside;
  }
  return inside;
}
