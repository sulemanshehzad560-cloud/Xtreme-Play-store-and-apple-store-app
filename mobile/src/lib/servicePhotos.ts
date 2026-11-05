import type { ImageSourcePropType } from "react-native";

/**
 * Realistic service pictures on the light gold Xtreme backdrop.
 * - SERVICE_ICON_PHOTOS: square tiles (256 × 256) for the service grid, lists and headers.
 * - SERVICE_PHOTOS: landscape cards (680 × 416) for "Most booked".
 * Services without a picture fall back to their illustrated icon.
 */
export const SERVICE_ICON_PHOTOS: Partial<Record<string, ImageSourcePropType>> = {
  regular: require("../../assets/services/regular-icon.jpg"),
  deep: require("../../assets/services/deep-icon.jpg"),
  sofa: require("../../assets/services/sofa-icon.jpg"),
  mattress: require("../../assets/services/mattress-icon.jpg"),
  carpet: require("../../assets/services/carpet-icon.jpg"),
};

export const SERVICE_PHOTOS: Partial<Record<string, ImageSourcePropType>> = {
  regular: require("../../assets/services/regular.jpg"),
  deep: require("../../assets/services/deep.jpg"),
  sofa: require("../../assets/services/sofa.jpg"),
  mattress: require("../../assets/services/mattress.jpg"),
  carpet: require("../../assets/services/carpet.jpg"),
};
