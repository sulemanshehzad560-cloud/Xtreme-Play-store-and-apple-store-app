// Xtreme-Cleaning Partner design tokens: a light, familiar service-app look with the
// Xtreme black-and-gold brand used for the header, primary actions and highlights.
export const colors = {
  bg: "#F6F4EF",
  surface: "#FFFFFF",
  surfaceAlt: "#FBF7EC",
  border: "#ECE6DA",
  divider: "#F1ECE2",
  ink: "#16130E", // brand black: header band, primary buttons
  inkSoft: "#2A251D",
  text: "#1C1914",
  muted: "#6F685C",
  faint: "#A39B8C",
  gold: "#B98F35", // readable on white
  goldBright: "#E2C170", // on black
  goldSoft: "#FBF1DA",
  goldLine: "#E9D6A6",
  onInk: "#FFFFFF",
  success: "#1E9E5A",
  successSoft: "#E6F6EC",
  warning: "#C77C02",
  warningSoft: "#FDF1DC",
  danger: "#D14343",
  dangerSoft: "#FCE9E9",
  info: "#2F6FDE",
  infoSoft: "#E8F0FD",
  star: "#F5A524",
};

export const fonts = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
};

export const shadow = {
  card: { shadowColor: "#3A2E14", shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  raised: { shadowColor: "#3A2E14", shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
};

export const space = (n: number) => n * 4;
export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };
