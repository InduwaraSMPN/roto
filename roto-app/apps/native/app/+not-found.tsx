import { Ionicons } from "@expo/vector-icons";
import { Link, Stack } from "expo-router";
import { Button, Surface } from "heroui-native";
import { Text, View } from "react-native";
import { withUniwind } from "uniwind";

import { Container } from "@/components/container";
import { useLang } from "@/lib/i18n";

const StyledIonicons = withUniwind(Ionicons);

export default function NotFoundScreen() {
  const { t } = useLang();

  return (
    <>
      <Stack.Screen options={{ title: t.notFoundTitle }} />
      <Container>
        <View className="flex-1 justify-center items-center p-4">
          <Surface variant="secondary" className="items-center p-6 max-w-sm rounded-lg">
            <StyledIonicons name="map-outline" size={40} className="text-accent mb-3" />
            <Text className="text-foreground font-medium text-lg mb-1">{t.pageNotFound}</Text>
            <Text className="text-muted text-sm text-center mb-4">{t.pageNotFoundBody}</Text>
            <Link href="/" asChild>
              <Button size="sm">
                <Button.Label>{t.goHome}</Button.Label>
              </Button>
            </Link>
          </Surface>
        </View>
      </Container>
    </>
  );
}
