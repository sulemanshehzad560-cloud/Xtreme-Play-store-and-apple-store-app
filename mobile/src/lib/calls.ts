import { Alert, Linking } from "react-native";
import { api } from "./api";
import { t } from "./i18n";

type CallResult = { mode: "bridge"; message: string } | { mode: "office"; phone: string; message: string };

/**
 * Calls the other side of a booking through Xtreme's masked number, so neither the customer
 * nor the team (or supplier) sees the other's real number. If masked calling isn't set up,
 * the office is called and connects them.
 */
export async function maskedCall(bookingId: string) {
  try {
    const r = await api<CallResult>(`/bookings/${bookingId}/call`, { body: {} });
    if (r.mode === "bridge") {
      Alert.alert(t("Calling you now"), t("Answer the call from Xtreme to be connected. Both numbers stay private."));
    } else {
      await Linking.openURL(`tel:${r.phone}`);
    }
  } catch (e) {
    Alert.alert(t("Could not start the call"), e instanceof Error ? e.message : t("Please try again."));
  }
}
