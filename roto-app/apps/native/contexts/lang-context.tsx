// Shared app-wide language state (plan §3.5). Fixes B13's propagation half: the old
// `apps/native/lib/i18n.ts` `useLang()` kept its own `useState` + SecureStore read per
// component, so switching language on one screen never updated another. Now there is exactly
// one LangProvider (mounted in app/_layout.tsx, above everything) and every screen reads the
// same context.
//
// The dictionary itself is the merge of @roto-app/core/i18n (shared with the web app, A1) and
// lib/i18n-native.ts (native-only screens). apps/native/lib/i18n.ts re-exports everything here
// so existing `import { useLang, LANGS, STR } from "@/lib/i18n"` call sites keep working.
import { interpolate, LANGS, STR as CORE_STR } from "@roto-app/core/i18n";
import type { Lang, Strings as CoreStrings } from "@roto-app/core/i18n";
import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { NATIVE_STR, type NativeStrings } from "@/lib/i18n-native";

export type { Lang };
export { LANGS, interpolate };

/** Merged dictionary shape: every core key plus every native-only key. */
export type AppStrings = CoreStrings & NativeStrings;

/** Android TTS locale per language (plan §1.2: si/ta are separately downloaded voices). */
export const VOICE_LOCALE: Record<Lang, string> = { en: "en-LK", si: "si-LK", ta: "ta-LK" };

export const STR: Record<Lang, AppStrings> = {
  en: { ...CORE_STR.en, ...NATIVE_STR.en },
  si: { ...CORE_STR.si, ...NATIVE_STR.si },
  ta: { ...CORE_STR.ta, ...NATIVE_STR.ta },
};

const STORE_KEY = "roto-lang";

type LangContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => Promise<void>;
  t: AppStrings;
};

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    SecureStore.getItemAsync(STORE_KEY)
      .then((v) => {
        if (v === "si" || v === "ta" || v === "en") setLangState(v);
      })
      .catch(() => undefined);
  }, []);

  const setLang = async (next: Lang) => {
    setLangState(next);
    await SecureStore.setItemAsync(STORE_KEY, next).catch(() => undefined);
  };

  const value = useMemo<LangContextValue>(() => ({ lang, setLang, t: STR[lang] }), [lang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang() must be used within <LangProvider>");
  return ctx;
}
