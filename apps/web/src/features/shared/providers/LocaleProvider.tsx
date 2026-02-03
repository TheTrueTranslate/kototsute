import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { setLocale, type SupportedLocale } from "@kototsute/shared";
import { useAuth } from "../../auth/auth-provider";
import { db } from "../lib/firebase";
import { initWebI18n, resolveBrowserLocale } from "../lib/i18n";

type LocaleState = {
  locale: SupportedLocale;
  loading: boolean;
  updateLocale: (next: SupportedLocale, persist?: boolean) => Promise<void>;
};

const LocaleContext = createContext<LocaleState | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [locale, setLocaleState] = useState<SupportedLocale>(resolveBrowserLocale());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void initWebI18n(locale);
  }, [locale]);

  useEffect(() => {
    const load = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      const snap = await getDoc(doc(db, "profiles", user.uid));
      const saved = snap.data()?.locale as SupportedLocale | undefined;
      if (saved) {
        setLocaleState(saved);
        await setLocale(saved);
      }
      setLoading(false);
    };
    void load();
  }, [user]);

  const updateLocale = async (next: SupportedLocale, persist = true) => {
    setLocaleState(next);
    await setLocale(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("locale", next);
    }
    if (persist && user) {
      await setDoc(doc(db, "profiles", user.uid), { locale: next }, { merge: true });
    }
  };

  const value = useMemo(() => ({ locale, loading, updateLocale }), [locale, loading]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider.");
  }
  return context;
}
