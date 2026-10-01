// Lesson body screen: renders one module's trilingual lesson text + entry to its quiz.
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Button } from "heroui-native";
import { Text, View } from "react-native";

import { getModule } from "@roto-app/core/learn";
import { Container } from "@/components/container";
import { useLang } from "@/lib/i18n";
import { useMoreLang } from "@/lib/i18n-more";

export default function LearnModule() {
  const { module: slug } = useLocalSearchParams<{ module: string }>();
  const { lang } = useLang();
  const { m } = useMoreLang();
  const mod = getModule(slug ?? "");

  if (!mod) {
    return (
      <Container className="p-6">
        <Stack.Screen options={{ title: m.learnTitle }} />
        <Text className="text-foreground">{m.rideNotFound}</Text>
      </Container>
    );
  }

  return (
    <Container className="p-6" scrollViewProps={{ contentContainerStyle: { flexGrow: 1, gap: 16 } }}>
      <Stack.Screen options={{ title: mod.title[lang] }} />
      {mod.body[lang].split("\n\n").map((para, i) => (
        <Text key={i} className="text-base leading-relaxed text-foreground">
          {para}
        </Text>
      ))}
      <View className="flex-row gap-2">
        <Link href={{ pathname: "/(drawer)/learn/quiz", params: { slug: mod.slug } }} asChild>
          <Button className="flex-1">
            <Button.Label>{m.takeQuiz}</Button.Label>
          </Button>
        </Link>
        <Link href="/(drawer)/learn" asChild>
          <Button variant="secondary">
            <Button.Label>{m.backToLearn}</Button.Label>
          </Button>
        </Link>
      </View>
    </Container>
  );
}
