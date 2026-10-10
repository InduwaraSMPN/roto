import { Ionicons } from "@expo/vector-icons";
import { Button, Card } from "heroui-native";
import { Link } from "expo-router";
import { Text, View } from "react-native";

import { Container } from "@/components/container";
import { useLang } from "@/lib/i18n";
import { ROTO } from "@/lib/roto-theme";

export default function Home() {
  const { t } = useLang();

  return (
    <Container className="p-6">
      <View className="py-2">
        <Text className="text-2xl font-extrabold tracking-tight text-foreground">
          {t.startHere}
        </Text>
        <Text className="mt-1 text-muted">
          {t.startHereSub}
        </Text>
      </View>

      <Card variant="secondary" className="mt-4 items-center p-8">
        <View
          style={{ backgroundColor: ROTO.signal }}
          className="mb-4 items-center justify-center rounded-full p-4"
        >
          <Ionicons name="bicycle" size={32} color={ROTO.signalInk} />
        </View>
        <Card.Title className="mb-1 text-xl">{t.readyToRide}</Card.Title>
        <Card.Description className="mb-5 text-center">
          {t.readyToRideSub}
        </Card.Description>
        <Link href="/(drawer)/(tabs)/map" asChild>
          <Button className="self-stretch">
            <Button.Label>{t.openRideTab}</Button.Label>
          </Button>
        </Link>
      </Card>
    </Container>
  );
}
