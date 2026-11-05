import { calls } from "./voip";

/**
 * Calls the other side of a booking with a free in-app voice call (over the internet), so the
 * customer and the team (staff or supplier) never see each other's phone number.
 */
export function maskedCall(bookingId: string) {
  return calls.start(bookingId);
}
