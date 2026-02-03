import { initReactI18next } from "react-i18next";
import {
  initI18n,
  i18n,
  normalizeLocale,
  type SupportedLocale
} from "@kototsute/shared";

let initialized = false;

export const initWebI18n = async (lng?: SupportedLocale) => {
  if (!initialized) {
    await initI18n({
      lng,
      plugins: [initReactI18next]
    });
    initialized = true;
  }
  return i18n;
};

export const resolveBrowserLocale = (): SupportedLocale => {
  if (typeof window === "undefined") return "ja";
  const stored = window.localStorage.getItem("locale");
  const storedLocale = normalizeLocale(stored);
  if (storedLocale) return storedLocale;
  const browser = normalizeLocale(window.navigator.language);
  return browser ?? "ja";
};
