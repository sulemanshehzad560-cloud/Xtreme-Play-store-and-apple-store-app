import { router } from "expo-router";

/**
 * Guests can browse services, prices and quotes without an account (App Store guideline 5.1.1(v)).
 * Account-based actions (booking, plans, chat, notifications) send them to sign in first;
 * the sign-in screens sit on top of the screen they came from, so they land back there.
 */
export function goSignIn() {
  router.push("/(auth)");
}
