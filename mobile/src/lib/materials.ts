import { useEffect, useState } from "react";
import { api } from "./api";
import { lang } from "./i18n";

interface MaterialsText {
  title: string;
  note: string;
  titleAr: string;
  noteAr: string;
}

/** Shown until the server answers (and if it can't be reached). */
const DEFAULTS: MaterialsText = {
  title: "Cleaning materials are free of cost",
  note: "Professional-grade cleaning solutions",
  titleAr: "مواد التنظيف مجانية",
  noteAr: "منتجات تنظيف احترافية",
};

let cached: MaterialsText | null = null;
let loading: Promise<MaterialsText> | null = null;

function load(): Promise<MaterialsText> {
  loading ??= api<{ materials?: Partial<MaterialsText> }>("/company")
    .then((c) => (cached = { ...DEFAULTS, ...(c.materials ?? {}) }))
    .catch(() => DEFAULTS)
    .finally(() => {
      loading = null;
    });
  return loading;
}

/**
 * The free-materials message, set by the office in the dashboard (Admin & IT → Company
 * contacts), so the wording can change without an app update.
 */
export function useMaterialsText(): { title: string; note: string } {
  const [text, setText] = useState<MaterialsText>(cached ?? DEFAULTS);
  useEffect(() => {
    let live = true;
    void load().then((t) => live && setText(t));
    return () => {
      live = false;
    };
  }, []);
  return lang() === "ar" ? { title: text.titleAr, note: text.noteAr } : { title: text.title, note: text.note };
}
