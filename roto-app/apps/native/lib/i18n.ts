// Thin re-export of contexts/lang-context.tsx, kept so existing
// `import { useLang, LANGS, STR, type Lang } from "@/lib/i18n"` call sites don't need to change.
// The actual dictionary (core + native-only keys) and the shared LangProvider live there —
// see that file's header for why.
export {
  LANGS,
  STR,
  VOICE_LOCALE,
  useLang,
  LangProvider,
  interpolate,
  type Lang,
  type AppStrings,
  type AppStrings as Strings,
} from "@/contexts/lang-context";
