// Learn module (plan §5.3, D12): lesson body from @roto-app/core/learn, then a ten-question
// quiz. Same content pack as the native app; only chrome text is local.
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ListChecks } from "lucide-react";

import { getModule } from "@roto-app/core/learn";
import { interpolate } from "@roto-app/core/i18n";
import { buttonVariants } from "@roto-app/ui/components/button";
import { Card, CardContent } from "@roto-app/ui/components/card";
import { cn } from "@roto-app/ui/lib/utils";

import { tx, useLang } from "@/lib/lang";

import { dict } from "../_components/i18n";

export default function LearnModulePage() {
  const { module } = useParams<{ module: string }>();
  const { lang } = useLang();
  const t = (k: string) => tx(lang, { en: dict.en[k] ?? k, si: dict.si[k] ?? k, ta: dict.ta[k] ?? k });
  const mod = getModule(module ?? "");

  if (!mod) {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 pt-10 pb-16 sm:px-6">
        <Link href="/learn" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-9 w-fit")}>
          <ArrowLeft />
          {t("back")}
        </Link>
        <h1 className="text-3xl font-black tracking-tight">{module}</h1>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 pt-10 pb-16 sm:px-6">
      <Link href="/learn" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-9 w-fit")}>
        <ArrowLeft />
        {t("back")}
      </Link>
      <h1 className="text-3xl font-black tracking-tight">{mod.title[lang]}</h1>
      <Card>
        <CardContent className="grid gap-3 pt-5">
          {mod.body[lang].split("\n\n").map((para, i) => (
            <p key={i} className="text-sm leading-relaxed text-muted-foreground">
              {para}
            </p>
          ))}
        </CardContent>
      </Card>
      <div className="flex items-center gap-3">
        <ListChecks aria-hidden className="size-5 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {interpolate(t("question"), { i: 1, n: mod.quiz.length })}
        </p>
      </div>
      <Link href={`/learn/${mod.slug}/quiz`} className={cn(buttonVariants({ size: "sm" }), "h-10 w-fit")}>
        {t("startQuiz")}
      </Link>
    </div>
  );
}
