import { Ionicons } from "@expo/vector-icons";
import { Button, Card } from "heroui-native";
import { Link } from "expo-router";
import { Text, View } from "react-native";

import { Container } from "@/components/container";
import { ROTO } from "@/lib/roto-theme";

export default function Home() {
  return (
    <Container className="p-6">
      <View className="py-2">
        <Text className="text-2xl font-extrabold tracking-tight text-foreground">
          Start here
        </Text>
        <Text className="mt-1 text-muted">
          The Ride tab plans and records. The Rides tab holds challenges, group
          rides, and privacy zones.
        </Text>
      </View>

      <Card variant="secondary" className="mt-4 items-center p-8">
        <View
          style={{ backgroundColor: ROTO.signal }}
          className="mb-4 items-center justify-center rounded-full p-4"
        >
          <Ionicons name="bicycle" size={32} color={ROTO.signalInk} />
        </View>
        <Card.Title className="mb-1 text-xl">Ready to ride?</Card.Title>
        <Card.Description className="mb-5 text-center">
          Plan a curvy loop, download the offline pack, then hit START RIDE.
        </Card.Description>
        <Link href="/(drawer)/(tabs)/map" asChild>
          <Button className="self-stretch">
            <Button.Label>Open the Ride tab</Button.Label>
          </Button>
        </Link>
      </Card>
    </Container>
  );
}
