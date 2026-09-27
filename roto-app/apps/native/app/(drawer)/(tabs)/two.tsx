import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { Container } from "@/components/container";
import { authClient } from "@/lib/auth-client";
import { useLang } from "@/lib/i18n";
import { ROTO } from "@/lib/roto-theme";
import { queryClient, trpc } from "@/utils/trpc";

export default function Community() {
  const { t } = useLang();
  const { data: session } = authClient.useSession();
  const eventsQuery = useQuery(trpc.events.list.queryOptions());
  const boardQuery = useQuery(trpc.events.leaderboard.queryOptions({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }));
  const rsvp = useMutation(trpc.events.rsvp.mutationOptions());
  const createEvent = useMutation(trpc.events.create.mutationOptions());
  const zonesQuery = useQuery({ ...trpc.privacy.list.queryOptions(), enabled: !!session?.user });
  const removeZone = useMutation(trpc.privacy.remove.mutationOptions());
  const [name, setName] = useState("");

  const add = async () => {
    if (!name.trim()) return;
    await createEvent
      .mutateAsync({ name: name.trim(), place: "", startsAt: new Date(Date.now() + 7 * 864e5).toISOString() })
      .catch(() => null);
    setName("");
    eventsQuery.refetch();
  };

  return (
    <Container className="p-6">
      <View className="py-2">
        <Text className="text-2xl font-extrabold tracking-tight text-foreground">
          {t.challenge}
        </Text>
        <Text className="mt-1 text-muted">{t.challengeSub}</Text>
      </View>
      <View className="mt-3 rounded-2xl border border-muted p-4">
        {(boardQuery.data ?? []).map((r, i) => (
          <View
            key={r.name}
            className="flex-row items-center justify-between border-b border-muted py-2.5 last:border-b-0 last:pb-0 first:pt-0"
          >
            <Text className="flex-1 text-foreground font-semibold" numberOfLines={1}>
              {i + 1}. {r.name}
            </Text>
            <Text className="ml-3 text-foreground font-extrabold tabular-nums">
              {r.km} km
            </Text>
          </View>
        ))}
        {boardQuery.isLoading && (
          <Text className="text-muted">Checking the pack…</Text>
        )}
        {!boardQuery.isLoading && !boardQuery.data?.length && (
          <Text className="leading-relaxed text-muted">{t.noRides}</Text>
        )}
      </View>

      <Text className="mt-6 text-2xl font-extrabold tracking-tight text-foreground">
        {t.groupRides}
      </Text>
      <Text className="mt-1 text-muted">
        RSVP to join the pack — codes are shared on the Ride tab.
      </Text>
      {!eventsQuery.data?.length && !eventsQuery.isLoading && (
        <Text className="mt-3 text-muted">{t.noEvents}</Text>
      )}
      {eventsQuery.isLoading && (
        <Text className="mt-3 text-muted">Loading group rides…</Text>
      )}
      {(eventsQuery.data ?? []).map((e) => (
        <View key={e.id} className="mt-3 rounded-2xl border border-muted p-4">
          <Text className="text-foreground font-bold">{e.name}</Text>
          <Text className="mt-0.5 text-muted text-sm">
            {[e.place, new Date(e.startsAt).toLocaleDateString()]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {session?.user && (
            <Pressable
              onPress={() => void rsvp.mutateAsync({ eventId: e.id }).then(() => queryClient.refetchQueries()).catch(() => undefined)}
              className="mt-3 self-start rounded-lg bg-secondary px-4 py-2.5 active:opacity-70"
            >
              <Text className="text-foreground font-bold">{t.rsvp}</Text>
            </Pressable>
          )}
        </View>
      ))}

      {session?.user && (
        <View className="mt-4 flex-row gap-2">
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t.newRideName}
            placeholderTextColor={ROTO.fog}
            returnKeyType="done"
            onSubmitEditing={() => void add()}
            className="min-h-[48px] flex-1 rounded-xl border border-muted bg-secondary px-4 text-foreground"
          />
          <Pressable
            onPress={() => void add()}
            style={{ backgroundColor: ROTO.signal }}
            className="min-h-[48px] min-w-[64px] items-center justify-center rounded-xl px-4 active:opacity-70"
          >
            <Text style={{ color: ROTO.signalInk }} className="font-extrabold">{t.add}</Text>
          </Pressable>
        </View>
      )}

      {session?.user && (
        <View className="mt-6">
          <Text className="text-2xl font-extrabold tracking-tight text-foreground">
            {t.privacyZones}
          </Text>
          <Text className="mb-3 mt-1 text-muted">{t.privacySub}</Text>
          {(zonesQuery.data ?? []).map((z) => (
            <View
              key={z.id}
              className="flex-row items-center justify-between border-b border-muted py-2.5"
            >
              <Text className="flex-1 text-foreground font-semibold" numberOfLines={1}>
                {z.name} · {z.radiusM}m
              </Text>
              <Pressable
                onPress={() => void removeZone.mutateAsync({ id: z.id }).then(() => zonesQuery.refetch()).catch(() => undefined)}
                className="ml-3 min-h-[44px] min-w-[44px] items-center justify-center px-3"
              >
                <Text className="font-bold text-red-500">{t.delete}</Text>
              </Pressable>
            </View>
          ))}
          {zonesQuery.isLoading && (
            <Text className="text-muted">Loading privacy zones…</Text>
          )}
          {!zonesQuery.isLoading && !zonesQuery.data?.length && (
            <Text className="leading-relaxed text-muted">{t.noZones}</Text>
          )}
        </View>
      )}
    </Container>
  );
}
