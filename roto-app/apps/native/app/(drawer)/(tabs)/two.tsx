import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { Container } from "@/components/container";
import { authClient } from "@/lib/auth-client";
import { useLang } from "@/lib/i18n";
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
      <Text className="text-2xl font-bold text-foreground mb-1">{t.challenge}</Text>
      <Text className="text-muted mb-3">{t.challengeSub}</Text>
      {(boardQuery.data ?? []).map((r, i) => (
        <View key={r.name} className="flex-row justify-between py-2 border-b border-muted">
          <Text className="text-foreground font-semibold">
            {i + 1}. {r.name}
          </Text>
          <Text className="text-foreground">{r.km} km</Text>
        </View>
      ))}
      {!boardQuery.data?.length && <Text className="text-muted mb-4">{t.noRides}</Text>}

      <Text className="text-2xl font-bold text-foreground mt-6 mb-3">{t.groupRides}</Text>
      {(eventsQuery.data ?? []).map((e) => (
        <View key={e.id} className="py-3 border-b border-muted">
          <Text className="text-foreground font-semibold">{e.name}</Text>
          <Text className="text-muted text-sm">
            {e.place} · {new Date(e.startsAt).toLocaleDateString()}
          </Text>
          {session?.user && (
            <Pressable
              onPress={() => void rsvp.mutateAsync({ eventId: e.id }).then(() => queryClient.refetchQueries()).catch(() => undefined)}
              className="mt-2 bg-secondary py-2 px-4 rounded-lg self-start"
            >
              <Text className="text-foreground font-semibold">{t.rsvp}</Text>
            </Pressable>
          )}
        </View>
      ))}

      {session?.user && (
        <View className="flex-row gap-2 mt-4">
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t.newRideName}
            className="flex-1 bg-secondary text-foreground p-3 rounded-lg"
          />
          <Pressable onPress={() => void add()} className="bg-[#FFB300] px-4 rounded-lg justify-center">
            <Text className="text-black font-bold">{t.add}</Text>
          </Pressable>
        </View>
      )}

      {session?.user && (
        <>
          <Text className="text-2xl font-bold text-foreground mt-6 mb-1">{t.privacyZones}</Text>
          <Text className="text-muted mb-3">{t.privacySub}</Text>
          {(zonesQuery.data ?? []).map((z) => (
            <View key={z.id} className="flex-row justify-between items-center py-2 border-b border-muted">
              <Text className="text-foreground font-semibold">
                {z.name} · {z.radiusM}m
              </Text>
              <Pressable
                onPress={() => void removeZone.mutateAsync({ id: z.id }).then(() => zonesQuery.refetch()).catch(() => undefined)}
                className="px-3 py-2"
              >
                <Text className="text-red-500 font-bold">{t.delete}</Text>
              </Pressable>
            </View>
          ))}
          {!zonesQuery.data?.length && <Text className="text-muted">{t.noZones}</Text>}
        </>
      )}
    </Container>
  );
}
