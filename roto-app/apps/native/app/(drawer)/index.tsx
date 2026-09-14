import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, Chip, useThemeColor } from "heroui-native";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { Container } from "@/components/container";
import { SignIn } from "@/components/sign-in";
import { SignUp } from "@/components/sign-up";
import { authClient } from "@/lib/auth-client";
import { LANGS, useLang } from "@/lib/i18n";
import { ROTO } from "@/lib/roto-theme";
import { queryClient, trpc } from "@/utils/trpc";

export default function Home() {
  const { lang, setLang } = useLang();
  const healthCheck = useQuery(trpc.healthCheck.queryOptions());
  const curated = useQuery(trpc.curated.list.queryOptions({}));
  const leaderboard = useQuery(
    trpc.events.leaderboard.queryOptions({
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
    }),
  );
  const isConnected = healthCheck?.data === "OK";
  const isLoading = healthCheck?.isLoading;
  const { data: session } = authClient.useSession();

  const mutedColor = useThemeColor("muted");
  const successColor = useThemeColor("success");
  const dangerColor = useThemeColor("danger");

  const topRoutes = (curated.data ?? []).slice(0, 3);
  const topRiders = (leaderboard.data ?? []).slice(0, 3);

  return (
    <Container className="p-6">
      <View className="py-4">
        <View className="flex-row items-baseline gap-2">
          <Text className="text-4xl font-extrabold tracking-tight text-foreground">
            ROTO
          </Text>
          <Text className="text-sm font-bold text-muted">රොටෝ · ரோட்டோ</Text>
          <View
            style={{ backgroundColor: ROTO.signal }}
            className="mb-1 size-2 self-center rounded-full"
          />
        </View>
        <Text className="mt-1 text-muted">
          Free offline-first rides for Sri Lanka — no subscription, no tracking.
        </Text>
        <View className="mt-3 flex-row gap-2" accessibilityRole="radiogroup" accessibilityLabel="Language">
          {LANGS.map((l) => {
            const active = lang === l.code;
            return (
              <Pressable
                key={l.code}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => void setLang(l.code)}
                style={{ backgroundColor: active ? ROTO.signal : undefined }}
                className={`rounded-lg border border-muted px-3 py-2 ${active ? "border-transparent" : ""}`}
              >
                <Text
                  style={{ color: active ? ROTO.signalInk : undefined }}
                  className={`text-sm font-bold ${active ? "" : "text-foreground"}`}
                >
                  {l.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {session?.user ? (
        <Card variant="secondary" className="mb-4 p-4">
          <Text className="text-foreground text-base mb-1">
            Welcome back, <Text className="font-bold">{session.user.name}</Text>
          </Text>
          <Text className="text-muted text-sm mb-4">{session.user.email}</Text>
          <View className="flex-row gap-2">
            <Link href="/(drawer)/(tabs)/map" asChild>
              <Pressable
                style={{ backgroundColor: ROTO.signal }}
                className="flex-1 items-center rounded-lg px-4 py-3 active:opacity-70"
              >
                <Text style={{ color: ROTO.signalInk }} className="font-extrabold">
                  Plan a ride
                </Text>
              </Pressable>
            </Link>
            <Pressable
              className="items-center rounded-lg border border-muted px-4 py-3 active:opacity-70"
              onPress={() => {
                authClient.signOut();
                queryClient.invalidateQueries();
              }}
            >
              <Text className="text-foreground font-semibold">Sign Out</Text>
            </Pressable>
          </View>
        </Card>
      ) : (
        <Link href="/(drawer)/(tabs)/map" asChild>
          <Pressable
            style={{ backgroundColor: ROTO.signal }}
            className="mb-4 items-center rounded-lg px-4 py-4 active:opacity-70"
          >
            <Text style={{ color: ROTO.signalInk }} className="text-base font-extrabold">
              Plan a ride — no account needed
            </Text>
          </Pressable>
        </Link>
      )}

      <Card variant="secondary" className="p-4">
        <Card.Title className="mb-2">Proven LK routes</Card.Title>
        {curated.isLoading ? (
          <Card.Description>Loading routes…</Card.Description>
        ) : topRoutes.length === 0 ? (
          <Card.Description>
            Routes are unavailable. Open the Ride tab and draw a 60 km loop.
          </Card.Description>
        ) : (
          topRoutes.map((route) => (
            <View
              key={route.id}
              className="flex-row items-center justify-between border-t border-muted py-2.5 first:border-t-0 first:pt-0 last:pb-0"
            >
              <View className="mr-3 flex-1">
                <Text className="text-foreground font-semibold" numberOfLines={1}>
                  {route.nameEn}
                </Text>
                <Text className="text-muted text-xs capitalize">
                  {route.region} · {route.difficulty}
                </Text>
              </View>
              <Text className="text-foreground font-extrabold tabular-nums">
                {route.distanceKm.toFixed(0)} km
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card variant="secondary" className="mt-4 p-4">
        <View className="flex-row items-center justify-between mb-2">
          <Card.Title>Riding this month</Card.Title>
          <Text className="text-muted text-xs font-semibold">Target 500 km</Text>
        </View>
        {leaderboard.isLoading ? (
          <Card.Description>Checking the pack…</Card.Description>
        ) : topRiders.length === 0 ? (
          <Card.Description>
            No rides logged yet — record a ride and take the top spot.
          </Card.Description>
        ) : (
          topRiders.map((rider, index) => (
            <View
              key={`${rider.name}-${index}`}
              className="flex-row items-center justify-between py-1.5"
            >
              <Text className="text-foreground font-semibold" numberOfLines={1}>
                {index + 1}. {rider.name}
              </Text>
              <Text className="text-foreground font-extrabold tabular-nums">
                {rider.km} km
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card variant="secondary" className="mt-4 p-4">
        <View className="flex-row items-center justify-between mb-3">
          <Card.Title>Service status</Card.Title>
          <Chip variant="secondary" color={isConnected ? "success" : "danger"} size="sm">
            <Chip.Label>{isConnected ? "LIVE" : "OFFLINE"}</Chip.Label>
          </Chip>
        </View>

        <View className="flex-row items-center border-t border-muted pt-3">
          <View
            className={`w-3 h-3 rounded-full mr-3 ${isConnected ? "bg-success" : "bg-muted"}`}
          />
          <View className="flex-1">
            <Text className="text-foreground font-medium mb-1">Roto API</Text>
            <Card.Description>
              {isLoading
                ? "Checking connection..."
                : isConnected
                  ? "Connected — routes and community are live"
                  : "Offline — offline packs and recording still work"}
            </Card.Description>
          </View>
          {isLoading && <Ionicons name="hourglass-outline" size={20} color={mutedColor} />}
          {!isLoading && isConnected && (
            <Ionicons name="checkmark-circle" size={20} color={successColor} />
          )}
          {!isLoading && !isConnected && (
            <Ionicons name="close-circle" size={20} color={dangerColor} />
          )}
        </View>
      </Card>

      {!session?.user && (
        <View className="mt-4 gap-4">
          <SignIn />
          <SignUp />
        </View>
      )}
    </Container>
  );
}
