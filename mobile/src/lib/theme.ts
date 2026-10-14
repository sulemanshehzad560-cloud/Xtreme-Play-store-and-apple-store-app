// Xtreme-Home Partner: black, gold and a cyan "tech" accent, with glass panels and glow.
export const colors = {
  bg: "#030405",
  bgDeep: "#000000",
  card: "#0E0F10",
  cardHi: "#17181A",
  glass: "rgba(14,16,20,0.78)",
  glassHi: "rgba(24,27,33,0.85)",
  border: "#2A2723",
  hairline: "rgba(226,193,112,0.18)",
  gold: "#E2C170",
  goldHi: "#F6DE9E",
  goldLo: "#9C7A2E",
  goldGlow: "rgba(226,193,112,0.55)",
  cyan: "#5AD8EA",
  cyanGlow: "rgba(90,216,234,0.55)",
  onGold: "#120F08",
  text: "#F6F0E3",
  muted: "#A69D8A",
  faint: "#6D6556",
  ok: "#3DDC84",
  warn: "#F2B64C",
  err: "#FF6B61",
  info: "#6FB3FF",
};

/** Gradients used across the app. */
export const gradients = {
  gold: ["#FFF1C4", "#E2C170", "#A67F2E"] as const,
  title: ["#FFF6DA", "#E2C170", "#C79A3E"] as const,
  border: ["rgba(246,222,158,0.55)", "rgba(226,193,112,0.08)", "rgba(90,216,234,0.45)"] as const,
  neon: ["#E2C170", "#5AD8EA"] as const,
};

/** Orbitron for display text, Exo 2 for reading text. Loaded in app/_layout.tsx. */
export const fonts = {
  display: "Orbitron_700Bold",
  displayBlack: "Orbitron_900Black",
  displayMedium: "Orbitron_500Medium",
  body: "Exo2_400Regular",
  bodyMedium: "Exo2_500Medium",
  bodySemi: "Exo2_600SemiBold",
  bodyBold: "Exo2_700Bold",
};

export const glow = (color: string, radius = 12) => ({
  textShadowColor: color,
  textShadowRadius: radius,
  textShadowOffset: { width: 0, height: 0 },
});

export const space = (n: number) => n * 4;
export const radius = { sm: 8, md: 14, lg: 22, pill: 999 };
