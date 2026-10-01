// ponytail: next-intl is SKIP (D4 open), so web i18n is a tiny cookie/localStorage
// lang state + colocated per-route dictionaries (each route's _components/i18n.ts).
// Shared strings still come from @roto-app/core/i18n (attribution etc.). Upgrade to
// next-intl [locale] routing only if D4 decides it — the dict shape already keys en/si/ta.
"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Lang = "en" | "si" | "ta";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "si", label: "සිංහල" },
  { code: "ta", label: "தமிழ்" },
];

const COOKIE = "roto-lang";

function readLang(): Lang {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(COOKIE);
  if (stored === "si" || stored === "ta" || stored === "en") return stored;
  const cookie = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`));
  const value = cookie?.split("=")[1];
  return value === "si" || value === "ta" ? value : "en";
}

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: "en",
  setLang: () => {},
});

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    setLangState(readLang());
  }, []);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(COOKIE, l);
      document.cookie = `${COOKIE}=${l}; path=/; max-age=31536000`;
    } catch {
      // Private mode etc. — the in-memory lang still applies for this visit.
    }
  }, []);
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

/** Pick the rider-facing string for the current lang. */
export function tx(lang: Lang, s: { en: string; si: string; ta: string }): string {
  return s[lang] ?? s.en;
}
