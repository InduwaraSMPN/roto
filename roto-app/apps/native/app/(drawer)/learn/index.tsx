// Learn index (plan §5.3, D12): the five modules + progress + paperwork guides.
// Progress lives in the local `learner_progress` table (`module_id` = slug,
// `completed` = lesson done, `quiz_score` = best quiz score) — device-only, works offline.
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Link } from "expo-router";
import { Button, Card, ListGroup, Separator } from "heroui-native";
import { Fragment, useCallback, useState } from "react";
import { Text, View } from "react-native";

import { GUIDES, LEARN_MODULES } from "@roto-app/core/learn";
import { Container } from "@/components/container";
import { db } from "@/db";
import { learnerProgress } from "@/db/schema";
import { interpolate, useLang } from "@/lib/i18n";
import { useMoreLang } from "@/lib/i18n-more";

type Progress = Record<string, { completed: boolean; best: number | null }>;

export default function LearnIndex() {
  const { lang } = useLang();
  const { m } = useMoreLang();
  const [progress, setProgress] = useState<Progress>({});

  const refresh = useCallback(async () => {
    try {
      const rows = await db.select().from(learnerProgress);
      const next: Progress = {};
      for (const r of rows) next[r.moduleId] = { completed: !!r.completed, best: r.quizScore };
      setProgress(next);
    } catch {
      // No local DB yet — treat everything as fresh.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const doneCount = LEARN_MODULES.filter((mod) => progress[mod.slug]?.completed).length;

  return (
    <Container className="p-6" scrollViewProps={{ contentContainerStyle: { flexGrow: 1, gap: 16 } }}>
      <View>
        <Text className="text-2xl font-extrabold tracking-tight text-foreground">{m.learnTitle}</Text>
        <Text className="mt-1 leading-relaxed text-muted">{m.learnSub}</Text>
        <Text className="mt-2 text-sm font-bold text-muted">{interpolate(m.lessonsDone, { n: doneCount })}</Text>
      </View>

      <ListGroup>
        {LEARN_MODULES.map((mod, i) => {
          const p = progress[mod.slug];
          return (
            <Fragment key={mod.slug}>
              <Link href={{ pathname: "/(drawer)/learn/[module]", params: { module: mod.slug } }} asChild>
                <ListGroup.Item>
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle numberOfLines={2}>{mod.title[lang]}</ListGroup.ItemTitle>
                    <ListGroup.ItemDescription>
                      {p?.completed ? `${m.lessonDone} · ${m.bestScore}: ${p.best ?? 0}/10` : p?.best != null ? `${interpolate(m.quizBestLine, { n: p.best })}` : m.notStarted}
                    </ListGroup.ItemDescription>
                  </ListGroup.ItemContent>
                  <ListGroup.ItemSuffix>
                    <Ionicons
                      name={p?.completed ? "checkmark-circle" : "chevron-forward"}
                      size={22}
                      color={p?.completed ? "#16a34a" : undefined}
                    />
                  </ListGroup.ItemSuffix>
                </ListGroup.Item>
              </Link>
              {i < LEARN_MODULES.length - 1 && <Separator className="mx-4" />}
            </Fragment>
          );
        })}
      </ListGroup>

      <View>
        <Text className="mb-2 text-lg font-extrabold text-foreground">{m.guidesTitle}</Text>
        {GUIDES.map((g) => (
          <Card key={g.slug} variant="secondary" className="mb-2 p-4">
            <Text className="font-bold text-foreground">{g.title[lang]}</Text>
            {g.steps[lang].map((s, i) => (
              <Text key={i} className="mt-1 text-sm leading-relaxed text-muted">
                {i + 1}. {s}
              </Text>
            ))}
          </Card>
        ))}
      </View>

      <Text className="text-xs leading-relaxed text-muted">{m.reviewNote}</Text>
      <Link href="/(drawer)/(tabs)/two" asChild>
        <Button variant="secondary">
          <Button.Label>{m.backToRides}</Button.Label>
        </Button>
      </Link>
    </Container>
  );
}
