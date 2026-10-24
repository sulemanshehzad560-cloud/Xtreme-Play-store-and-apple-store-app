import { badRequest } from "../lib/errors.js";
import { insidePolygon, type LatLng } from "../lib/geo.js";

/**
 * Where Xtreme takes bookings: Abu Dhabi city (the island, Al Reem, Saadiyat, Yas,
 * Al Raha, Khalifa City, MBZ, Mussafah, Shakhbout, Al Shamkha, Al Reef, Baniyas).
 * Al Ain, Al Dhafra and the Dubai side are outside. Points go round the boundary in order.
 * The mobile app keeps a copy in src/lib/serviceZone.ts; change both together.
 */
export const SERVICE_ZONE = {
  name: "Abu Dhabi city and Al Reem Island",
  polygon: [
    { lat: 24.6, lng: 54.3 },
    { lat: 24.6, lng: 54.52 },
    { lat: 24.54, lng: 54.66 },
    { lat: 24.48, lng: 54.8 },
    { lat: 24.3, lng: 54.82 },
    { lat: 24.22, lng: 54.66 },
    { lat: 24.24, lng: 54.42 },
    { lat: 24.38, lng: 54.26 },
  ] satisfies LatLng[],
} as const;

export const OUTSIDE_ZONE_MESSAGE = `Sorry, we only serve ${SERVICE_ZONE.name} at the moment. Please choose an address there.`;

export const inServiceZone = (p: LatLng) => insidePolygon(p, SERVICE_ZONE.polygon);

/** Rejects addresses outside the service zone, with a message the app shows as is. */
export function assertInServiceZone(p: LatLng) {
  if (!inServiceZone(p)) throw badRequest("outside_service_area", OUTSIDE_ZONE_MESSAGE);
}
