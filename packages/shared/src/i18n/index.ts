import i18next, { type i18n, type Module } from "i18next";
import ja from "./consts/ja.json" assert { type: "json" };
import en from "./consts/en.json" assert { type: "json" };

export const supportedLocales = ["ja", "en"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export const normalizeLocale = (
  value: string | null | undefined
): SupportedLocale | null => {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower.startsWith("ja")) return "ja";
  if (lower.startsWith("en")) return "en";
  return null;
};

const resources = {
  ja: { translation: ja },
  en: { translation: en }
};

const instance: i18n = i18next.createInstance();
let initialized = false;

export const initI18n = async (input?: {
  lng?: SupportedLocale;
  plugins?: Module[];
}) => {
  if (initialized) return instance;
  input?.plugins?.forEach((plugin) => instance.use(plugin));
  await instance.init({
    resources,
    lng: input?.lng ?? "ja",
    fallbackLng: "ja",
    supportedLngs: supportedLocales,
    interpolation: { escapeValue: false },
    initImmediate: false,
    react: { useSuspense: false }
  });
  initialized = true;
  return instance;
};

export const t = (
  key: string,
  options?: Record<string, any> & { locale?: SupportedLocale }
) => {
  const locale = options?.locale;
  return instance.t(key, { ...options, lng: locale });
};

export const setLocale = async (locale: SupportedLocale) => {
  if (!initialized) {
    await initI18n({ lng: locale });
  }
  return instance.changeLanguage(locale);
};

export const getLocale = (): SupportedLocale => {
  return (instance.language as SupportedLocale) ?? "ja";
};

export { instance as i18n };
