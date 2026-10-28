import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import { rebuildStyles } from "../components/ui";
import { applyPalette } from "./theme";

export type ThemeMode = "light" | "dark" | "system";

const KEY = "theme-mode";
const ThemeContext = createContext<{ mode: ThemeMode; dark: boolean; setMode: (m: ThemeMode) => void }>({
  mode: "light",
  dark: false,
  setMode: () => undefined,
});

let applied = false;

/** Light, dark or follow the phone. The choice is remembered on the device. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((v) => setModeState(v === "dark" || v === "system" ? v : "light"))
      .catch(() => setModeState("light"));
  }, []);

  const dark = mode === "dark" || (mode === "system" && system === "dark");
  // Swap the palette before anything below renders with it.
  if (applied !== dark) {
    applyPalette(dark);
    rebuildStyles();
    applied = dark;
  }

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    SecureStore.setItemAsync(KEY, m).catch(() => undefined);
  };

  if (mode === null) return null;
  return <ThemeContext.Provider value={{ mode, dark, setMode }}>{children}</ThemeContext.Provider>;
}

export const useThemeMode = () => useContext(ThemeContext);
