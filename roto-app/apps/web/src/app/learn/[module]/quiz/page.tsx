// Module quiz (plan §5.3, D12): ten questions from @roto-app/core/learn, one at a time,
// score at the end. Web only keeps the score in memory; native persists progress locally
// (apps/native/app/(drawer)/learn/quiz.tsx) since it has a device DB.
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { getModule } from "@roto-app/core/learn";
import { interpolate } from "@roto-app/core/i18n";
import { buttonVariants } from "@roto-app/ui/components/button";
import { Card, CardContent } from "@roto-app/ui/components/card";
import { cn } from "@roto-app/ui/lib/utils";

import { tx, useLang } from "@/lib/lang";

import { dict } from "../../_components/i18n";

export default function LearnQuizPage() {
  const { module } = useParams<{ module: string }>();
  const { lang } = useLang();
  const t = (k: string) => tx(lang, { en: dict.en[k] ?? k, si: dict.si[k] ?? k, ta: dict.ta[k] ?? k });
  const mod = getModule(module ?? "");

  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  if (!mod) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 pb-16 sm:px-6">
        <Link href="/learn" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-9 w-fit")}>
          <ArrowLeft />
          {t("back")}
        </Link>
      </div>
    );
  }

  const total = mod.quiz.length;
  const q = mod.quiz[idx];

  const answer = (choice: number) => {
    if (!q || picked != null) return;
    setPicked(choice);
    const next = score + (choice === q.correct ? 1 : 0);
    setScore(next);
  };

  const advance = () => {
    if (idx + 1 >= total) {
      setDone(true);
      return;
    }
    setIdx(idx + 1);
    setPicked(null);
  };

  if (done) {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 pt-10 pb-16 sm:px-6">
        <h1 className="text-3xl font-black tracking-tight">{t("done")}</h1>
        <p className="numerals text-5xl font-extrabold">
          {score}/{total}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("score")}: {score}/{total}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-10")}
            onClick={() => {
              setIdx(0);
              setPicked(null);
              setScore(0);
              setDone(false);
            }}
          >
            {t("retake")}
          </button>
          <Link href={`/learn/${mod.slug}`} className={cn(buttonVariants({ size: "sm" }), "h-10")}>
            {t("backToLearn")}
          </Link>
        </div>
      </div>
    );
  }

  if (!q) return null;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 pt-10 pb-16 sm:px-6">
      <Link href={`/learn/${mod.slug}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-9 w-fit")}>
        <ArrowLeft />
        {t("backToLearn")}
      </Link>
      <p className="text-sm font-bold text-muted-foreground">{interpolate(t("question"), { i: idx + 1, n: total })}</p>
      <Card>
        <CardContent className="pt-5">
          <p className="text-lg font-bold leading-relaxed">{q.q[lang]}</p>
        </CardContent>
      </Card>
      <div className="grid gap-2">
        {([0, 1, 2, 3] as const).map((choice) => {
          const isCorrect = picked != null && choice === q.correct;
          const isWrong = picked === choice && choice !== q.correct;
          return (
            <button
              key={choice}
              type="button"
              aria-pressed={picked === choice}
              className={cn(
                buttonVariants({
                  variant: isCorrect ? "default" : isWrong ? "destructive" : "outline",
                  size: "lg",
                }),
                "h-auto min-h-12 justify-start whitespace-normal py-3 text-left",
              )}
              onClick={() => answer(choice)}
              disabled={picked != null}
            >
              {q.a[lang][choice]}
            </button>
          );
        })}
      </div>
      {picked != null && (
        <p className={cn("text-sm font-semibold", picked === q.correct ? "text-foreground" : "text-destructive")}>
          {picked === q.correct ? t("correct") : t("wrong")}
        </p>
      )}
      {picked != null && (
        <button type="button" className={cn(buttonVariants({ size: "sm" }), "h-10 w-fit")} onClick={advance}>
          {t("next")}
        </button>
      )}
    </div>
  );
}
