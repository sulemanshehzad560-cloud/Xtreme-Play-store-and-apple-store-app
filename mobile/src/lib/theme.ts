// Xtreme-Cleaning Partner design tokens: a light, familiar service-app look with the
// Xtreme black-and-gold brand used for the header, primary actions and highlights.
const LIGHT = {
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
  primary: "#16130E", // main buttons
  onPrimary: "#FFFFFF",
  success: "#1E9E5A",
  successSoft: "#E6F6EC",
  warning: "#C77C02",
  warningSoft: "#FDF1DC",
  danger: "#D14343",
  dangerSoft: "#FCE9E9",
  info: "#2F6FDE",
  infoSoft: "#E8F0FD",
  star: "#F5A524",
  successLine: "#BFE5CC",
  successText: "#2E7A50",
  skeleton: "#E9E3D7",
};

// Dark mode keeps the black-and-gold brand: warm charcoal surfaces, gold accents, light text.
const DARK: typeof LIGHT = {
  bg: "#0F0E0C",
  surface: "#1A1814",
  surfaceAlt: "#221F19",
  border: "#2E2A22",
  divider: "#26221C",
  ink: "#2B261D",
  inkSoft: "#332D23",
  text: "#F3EFE6",
  muted: "#B3AA99",
  faint: "#7D7566",
  gold: "#E2C170",
  goldBright: "#E2C170",
  goldSoft: "#2E2616",
  goldLine: "#5A4A26",
  onInk: "#FFFFFF",
  primary: "#E2C170", // gold buttons stand out on dark screens
  onPrimary: "#16130E",
  success: "#3DCB7F",
  successSoft: "#12291C",
  warning: "#F0A43A",
  warningSoft: "#2E2212",
  danger: "#F06A6A",
  dangerSoft: "#2E1616",
  info: "#6C9CF0",
  infoSoft: "#14203A",
  star: "#F5A524",
  successLine: "#245A3A",
  successText: "#9FDDB9",
  skeleton: "#2A261F",
};

/**
 * The current palette. Screens read it at render time, so switching theme swaps the values
 * in place and the app re-renders (see ThemeProvider).
 */
export const colors = { ...LIGHT };

export function applyPalette(dark: boolean) {
  Object.assign(colors, dark ? DARK : LIGHT);
}

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
