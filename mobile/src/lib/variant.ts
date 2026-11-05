import Constants from "expo-constants";

/** True in the separate staff & supplier app ("Xtreme Staff"), built with APP_VARIANT=staff. */
export const STAFF_APP = Constants.expoConfig?.extra?.variant === "staff";
