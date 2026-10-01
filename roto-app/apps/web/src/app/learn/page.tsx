// Learn index (plan §5.3, D12): the five modules and their ten-question quizzes, both read
// from @roto-app/core/learn so web and native share one content pack.
"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";

import { LEARN_MODULES } from "@roto-app/core/learn";
import { buttonVariants } from "@roto-app/ui/components/button";
import { Card, CardContent } from "@roto-app/ui/components/card";
import { cn } from "@roto-app/ui/lib/utils";

import { tx, useLang } from "@/lib/lang";

import { dict } from "./_components/i18n";

export default function LearnPage() {
  const { lang } = useLang();
  const t = (k: string) => tx(lang, { en: dict.en[k] ?? k, si: dict.si[k] ?? k, ta: dict.ta[k] ?? k });
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-10 pb-16 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">{t("title")}</h1>
      <p className="mt-2 max-w-[65ch] leading-relaxed text-muted-foreground">{t("sub")}</p>
      <ol className="mt-6 grid gap-4">
        {LEARN_MODULES.map((mod, i) => (
          <li key={mod.slug}>
            <Card>
              <CardContent className="flex items-center justify-between gap-4 pt-5">
                <div className="flex min-w-0 items-start gap-3">
                  <BookOpen aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="font-bold">
                      <span className="numerals mr-2 text-muted-foreground">{i + 1}</span>
                      {mod.title[lang]}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {mod.body[lang].split("\n\n")[0]}
                    </p>
                  </div>
                </div>
                <Link href={`/learn/${mod.slug}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 shrink-0")}>
                  {t("open")}
                </Link>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
