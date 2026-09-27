import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Input, ListGroup, Separator, TextField } from "heroui-native";
import { Fragment, useState } from "react";
import { Text, View } from "react-native";

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

  const board = boardQuery.data ?? [];
  const events = eventsQuery.data ?? [];
  const zones = zonesQuery.data ?? [];

  return (
    <Container className="p-6">
      <View className="py-2">
        <Text className="text-2xl font-extrabold tracking-tight text-foreground">
          {t.challenge}
        </Text>
        <Text className="mt-1 text-muted">{t.challengeSub}</Text>
      </View>
      {board.length > 0 && (
        <ListGroup className="mt-3">
          {board.map((r, i) => (
            <Fragment key={r.name}>
              <ListGroup.Item>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle numberOfLines={1}>
                    {i + 1}. {r.name}
                  </ListGroup.ItemTitle>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix>
                  <Text className="text-foreground font-extrabold tabular-nums">{r.km} km</Text>
                </ListGroup.ItemSuffix>
              </ListGroup.Item>
              {i < board.length - 1 && <Separator className="mx-4" />}
            </Fragment>
          ))}
        </ListGroup>
      )}
      {boardQuery.isLoading && <Text className="mt-3 text-muted">Checking the pack…</Text>}
      {!boardQuery.isLoading && board.length === 0 && (
        <Text className="mt-3 leading-relaxed text-muted">{t.noRides}</Text>
      )}

      <Text className="mt-6 text-2xl font-extrabold tracking-tight text-foreground">
        {t.groupRides}
      </Text>
      <Text className="mt-1 text-muted">
        RSVP to join the pack — codes are shared on the Ride tab.
      </Text>
      {!eventsQuery.isLoading && events.length === 0 && (
        <Text className="mt-3 text-muted">{t.noEvents}</Text>
      )}
      {eventsQuery.isLoading && <Text className="mt-3 text-muted">Loading group rides…</Text>}
      {events.length > 0 && (
        <ListGroup className="mt-3">
          {events.map((e, i) => (
            <Fragment key={e.id}>
              <ListGroup.Item>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle numberOfLines={1}>{e.name}</ListGroup.ItemTitle>
                  <ListGroup.ItemDescription>
                    {[e.place, new Date(e.startsAt).toLocaleDateString()].filter(Boolean).join(" · ")}
                  </ListGroup.ItemDescription>
                </ListGroup.ItemContent>
                {session?.user && (
                  <ListGroup.ItemSuffix>
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={() => void rsvp.mutateAsync({ eventId: e.id }).then(() => queryClient.refetchQueries()).catch(() => undefined)}
                    >
                      <Button.Label>{t.rsvp}</Button.Label>
                    </Button>
                  </ListGroup.ItemSuffix>
                )}
              </ListGroup.Item>
              {i < events.length - 1 && <Separator className="mx-4" />}
            </Fragment>
          ))}
        </ListGroup>
      )}

      {session?.user && (
        <View className="mt-4 flex-row gap-2">
          <TextField className="flex-1">
            <Input
              value={name}
              onChangeText={setName}
              placeholder={t.newRideName}
              returnKeyType="done"
              onSubmitEditing={() => void add()}
              accessibilityLabel={t.newRideName}
            />
          </TextField>
          <Button onPress={() => void add()} accessibilityLabel={t.add}>
            <Button.Label>{t.add}</Button.Label>
          </Button>
        </View>
      )}

      {session?.user && (
        <View className="mt-6">
          <Text className="text-2xl font-extrabold tracking-tight text-foreground">
            {t.privacyZones}
          </Text>
          <Text className="mb-3 mt-1 text-muted">{t.privacySub}</Text>
          {zones.length > 0 && (
            <ListGroup>
              {zones.map((z, i) => (
                <Fragment key={z.id}>
                  <ListGroup.Item>
                    <ListGroup.ItemContent>
                      <ListGroup.ItemTitle numberOfLines={1}>
                        {z.name} · {z.radiusM}m
                      </ListGroup.ItemTitle>
                    </ListGroup.ItemContent>
                    <ListGroup.ItemSuffix>
                      <Button
                        size="sm"
                        variant="danger-soft"
                        onPress={() => void removeZone.mutateAsync({ id: z.id }).then(() => zonesQuery.refetch()).catch(() => undefined)}
                        accessibilityLabel={t.delete}
                      >
                        <Button.Label>{t.delete}</Button.Label>
                      </Button>
                    </ListGroup.ItemSuffix>
                  </ListGroup.Item>
                  {i < zones.length - 1 && <Separator className="mx-4" />}
                </Fragment>
              ))}
            </ListGroup>
          )}
          {zonesQuery.isLoading && <Text className="text-muted">Loading privacy zones…</Text>}
          {!zonesQuery.isLoading && zones.length === 0 && (
            <Text className="leading-relaxed text-muted">{t.noZones}</Text>
          )}
        </View>
      )}
    </Container>
  );
}
