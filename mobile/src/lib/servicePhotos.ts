import type { ImageSourcePropType } from "react-native";

/**
 * Real photos for services. Put a landscape JPEG (about 900 × 560, under 120 KB) in
 * assets/services/ named after the service key and add a line here, e.g.
 *   sofa: require("../../assets/services/sofa.jpg"),
 * Services without a photo keep their illustrated icon.
 */
export const SERVICE_PHOTOS: Partial<Record<string, ImageSourcePropType>> = {};
