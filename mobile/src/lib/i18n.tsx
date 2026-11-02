import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { rebuildStyles } from "../components/ui";
import { AR } from "./ar";
import { fonts } from "./theme";

export type Lang = "en" | "ar";

const KEY = "app-language";

const LATIN_FONTS = { ...fonts };
// Tajawal covers Arabic and Latin, so mixed text (brand names, prices) stays consistent.
const ARABIC_FONTS = {
  regular: "Tajawal_400Regular",
  medium: "Tajawal_500Medium",
  semibold: "Tajawal_700Bold",
  bold: "Tajawal_700Bold",
  extrabold: "Tajawal_800ExtraBold",
};

let current: Lang = "en";

/** The language the app is showing right now. */
export const lang = () => current;
export const isRTL = () => current === "ar";

/**
 * Translate an English UI string. The English text is the key, so anything without an Arabic
 * entry simply stays in English. `{name}` placeholders are filled from `vars`.
 */
export function t(en: string, vars?: Record<string, string | number | null | undefined>): string {
  let s = current === "ar" ? (AR[en] ?? en) : en;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v ?? ""));
  return s;
}

/** Switch fonts and module state before anything renders in the new language. */
export function applyLanguage(l: Lang) {
  if (current === l && (l === "en" ? fonts.regular === LATIN_FONTS.regular : fonts.regular === ARABIC_FONTS.regular)) return;
  current = l;
  Object.assign(fonts, l === "ar" ? ARABIC_FONTS : LATIN_FONTS);
  rebuildStyles();
}

const LangContext = createContext<{ lang: Lang; chosen: boolean; setLang: (l: Lang) => void }>({
  lang: "en",
  chosen: true,
  setLang: () => undefined,
});

/** English or Arabic, chosen on first launch and changeable in Account. Remembered on the device. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ lang: Lang; chosen: boolean } | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((v) => setState(v === "ar" || v === "en" ? { lang: v, chosen: true } : { lang: "en", chosen: false }))
      .catch(() => setState({ lang: "en", chosen: false }));
  }, []);

  if (!state) return null;
  applyLanguage(state.lang);

  const setLang = (l: Lang) => {
    applyLanguage(l);
    setState({ lang: l, chosen: true });
    SecureStore.setItemAsync(KEY, l).catch(() => undefined);
  };
  return <LangContext.Provider value={{ ...state, setLang }}>{children}</LangContext.Provider>;
}

export const useLanguage = () => useContext(LangContext);

/** Locale for dates: Arabic month and day names with Western digits, as used across the UAE. */
export const dateLocale = () => (current === "ar" ? "ar-AE-u-nu-latn" : "en-GB");

/** Wraps a fixed English lookup table so every value read from it is translated at render time. */
export function translated<T extends Record<string, string>>(table: T): T {
  return new Proxy(table, { get: (o, k) => (typeof k === "string" && typeof o[k] === "string" ? t(o[k] as string) : (o as Record<string | symbol, unknown>)[k]) }) as T;
}
