// Module quiz: 10 questions, score at the end, best persisted locally (`quiz_score`) and
// the lesson marked `completed`. All offline — no server involved.
import { Link, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card } from "heroui-native";
import { eq } from "drizzle-orm";
import { useMemo, useState } from "react";import { Text, View } from "react-native";

import { getModule } from "@roto-app/core/learn";
import { Container } from "@/components/container";
import { db } from "@/db";
import { learnerProgress } from "@/db/schema";
import { interpolate, useLang } from "@/lib/i18n";
import { useMoreLang } from "@/lib/i18n-more";

export default function LearnQuiz() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { lang } = useLang();
  const { m } = useMoreLang();
  const router = useRouter();
  const mod = getModule(slug ?? "");

  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [best, setBest] = useState<number | null>(null);

  const total = mod?.quiz.length ?? 0;

  const finish = async (finalScore: number) => {
    if (!mod) return;
    setDone(true);
    try {
      const rows = await db.select().from(learnerProgress).where(eqSlug(mod.slug));
      const prevBest = rows[0]?.quizScore ?? null;
      const nextBest = Math.max(prevBest ?? 0, finalScore);
      setBest(nextBest);
      await db
        .insert(learnerProgress)
        .values({ moduleId: mod.slug, completed: true, quizScore: nextBest, updatedAt: Date.now() })
        .onConflictDoUpdate({
          target: learnerProgress.moduleId,
          set: { completed: true, quizScore: nextBest, updatedAt: Date.now() },
        });
    } catch {
      setBest(finalScore);
    }
  };

  const answer = (choice: number) => {
    if (!mod || picked != null) return;
    const q = mod.quiz[idx];
    if (!q) return;
    setPicked(choice);
    const gained = choice === q.correct ? 1 : 0;
    const nextScore = score + gained;
    setScore(nextScore);
    setTimeout(() => {
      if (idx + 1 >= total) {
        void finish(nextScore);
      } else {
        setIdx(idx + 1);
        setPicked(null);
      }
    }, 450);
  };

  const resultColor = useMemo(() => {
    if (!done) return undefined;
    return score >= 8 ? "#16a34a" : score >= 6 ? "#FFB300" : "#E5484D";
  }, [done, score]);

  if (!mod) {
    return (
      <Container className="p-6">
        <Stack.Screen options={{ title: m.takeQuiz }} />
        <Text className="text-foreground">{m.rideNotFound}</Text>
      </Container>
    );
  }

  if (done) {
    return (
      <Container className="p-6" scrollViewProps={{ contentContainerStyle: { flexGrow: 1, gap: 16, justifyContent: "center" } }}>
        <Stack.Screen options={{ title: m.quizDone }} />
        <Text className="text-center text-2xl font-extrabold text-foreground">{m.quizDone}</Text>
        <Text className="text-center text-5xl font-extrabold tabular-nums" style={{ color: resultColor }}>
          {score}/{total}
        </Text>
        <Text className="text-center text-muted">
          {m.bestScore}: {best ?? score}/{total}
        </Text>
        <View className="flex-row gap-2">
          <Button
            className="flex-1"
            variant="secondary"
            onPress={() => {
              setIdx(0);
              setPicked(null);
              setScore(0);
              setDone(false);
            }}
            accessibilityLabel={m.retake}
          >
            <Button.Label>{m.retake}</Button.Label>
          </Button>
          <Button className="flex-1" onPress={() => router.replace("/(drawer)/learn")} accessibilityLabel={m.backToLearn}>
            <Button.Label>{m.backToLearn}</Button.Label>
          </Button>
        </View>
      </Container>
    );
  }

  const q = mod.quiz[idx];
  if (!q) return null;

  return (
    <Container className="p-6" scrollViewProps={{ contentContainerStyle: { flexGrow: 1, gap: 16 } }}>
      <Stack.Screen options={{ title: mod.title[lang] }} />
      <Text className="text-sm font-bold text-muted">{interpolate(m.quizOf, { i: idx + 1 })}</Text>
      <Card variant="secondary" className="p-4">
        <Text className="text-lg font-bold leading-relaxed text-foreground">{q.q[lang]}</Text>
      </Card>
      {([0, 1, 2, 3] as const).map((choice) => {
        const isCorrect = picked != null && choice === q.correct;
        const isWrong = picked === choice && choice !== q.correct;
        return (
          <Button
            key={choice}
            variant={isCorrect ? "primary" : isWrong ? "danger" : "secondary"}
            onPress={() => answer(choice)}
            isDisabled={picked != null}
            accessibilityLabel={q.a[lang][choice]}
          >
            <Button.Label>{q.a[lang][choice]}</Button.Label>
          </Button>
        );
      })}
      <Link href="/(drawer)/learn" asChild>
        <Button variant="ghost">
          <Button.Label>{m.backToLearn}</Button.Label>
        </Button>
      </Link>
    </Container>
  );
}

function eqSlug(slug: string) {
  return eq(learnerProgress.moduleId, slug);
}
