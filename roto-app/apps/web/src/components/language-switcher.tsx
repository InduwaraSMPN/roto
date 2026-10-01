// Minimal language switcher (en/si/ta), persisted to cookie + localStorage.
"use client";

import { Button } from "@roto-app/ui/components/button";
import { LANGS, useLang } from "@/lib/lang";

export default function LanguageSwitcher() {
  const { lang, setLang } = useLang();
  return (
    <div role="group" aria-label="Language / භාෂාව / மொழி" className="flex items-center gap-0.5">
      {LANGS.map((l) => (
        <Button
          key={l.code}
          variant={lang === l.code ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          aria-label={`Switch language to ${l.label}`}
          className="h-8 px-2 text-xs font-bold"
        >
          {l.code === "en" ? "EN" : l.label}
        </Button>
      ))}
    </div>
  );
}
