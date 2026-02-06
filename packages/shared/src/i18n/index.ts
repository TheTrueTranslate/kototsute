import i18next, { type i18n, type Module } from "i18next";

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

type LocaleResource = Record<string, any>;
type Resources = Record<SupportedLocale, { translation: LocaleResource }>;

const isNodeRuntime = () => typeof window === "undefined";

const loadLocaleResource = async (path: string) => {
  if (isNodeRuntime()) {
    const { readFile } = await import("node:fs/promises");
    const fileUrl = new URL(path, import.meta.url);
    const json = await readFile(fileUrl, "utf8");
    return JSON.parse(json) as LocaleResource;
  }
  const module = await import(path);
  return (module as { default: LocaleResource }).default;
};

const loadResources = async (): Promise<Resources> => {
  const [ja, en] = await Promise.all([
    loadLocaleResource("./consts/ja.json"),
    loadLocaleResource("./consts/en.json")
  ]);
  return {
    ja: { translation: ja },
    en: { translation: en }
  };
};

const instance: i18n = i18next.createInstance();
let initialized = false;
let resources: Resources | null = null;

export const initI18n = async (input?: {
  lng?: SupportedLocale;
  plugins?: Module[];
}) => {
  if (initialized) return instance;
  if (!resources) {
    resources = await loadResources();
  }
  input?.plugins?.forEach((plugin) => instance.use(plugin));
  await instance.init({
    resources: resources ?? {},
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
