export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Rough driving ETA. Straight-line distance is stretched by 1.35 to approximate roads,
 * then divided by an average city speed. Swap for a routing API when one is configured.
 */
export function estimateEtaMinutes(from: LatLng, to: LatLng, averageSpeedKmh: number): number {
  return etaMinutesForDistance(distanceMeters(from, to), averageSpeedKmh);
}

export function etaMinutesForDistance(straightLineMeters: number, averageSpeedKmh: number): number {
  const roadKm = (straightLineMeters * 1.35) / 1000;
  return Math.max(1, Math.round((roadKm / averageSpeedKmh) * 60));
}

/** Ray-casting point-in-polygon test. Fine for city-sized areas, where the earth is flat enough. */
export function insidePolygon(p: LatLng, polygon: readonly LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
}
