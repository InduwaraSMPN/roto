// Rides tab (plan §4.16, §4.10 history): Feed / Challenges / Clubs / My rides segments
// (HeroUI Tabs). Parallel-built server contracts (community.*, challenges.*, routes.*,
// curated.rate/submit, privacy.exportMine/deleteAccount) are feature-detected at runtime:
// the tRPC proxy builds paths lazily, so an unbuilt procedure surfaces as a query error and
// the UI falls back to a note + the parts that work offline (events, groups, local queue).
// ponytail: guarded-casts (`as unknown as …Api`) instead of router-type edits on purpose —
// when the parallel server stream lands, these resolve with no client changes.
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { Button, Input, ListGroup, Separator, Tabs, TextField } from "heroui-native";
import { Fragment, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { Container } from "@/components/container";
import { authClient } from "@/lib/auth-client";
import { useLang } from "@/lib/i18n";
import { useMoreLang } from "@/lib/i18n-more";
import { listQueued, type QueuedRide } from "@/lib/ride-queue";
import { queryClient, trpc } from "@/utils/trpc";

type FeedPost = { id: string; body?: string | null; createdAt?: string | null; likeCount?: number | null };
type Challenge = { id: string; slug?: string; name?: string | null; target?: number | null; kind?: string | null };
type ChallengeBoardRow = { userId?: string; name?: string | null; km?: number | null };
type GroupRow = { id: string; name: string; code: string };

type CommunityApi = {
  feed: { queryOptions: (input: Record<string, unknown>) => { queryKey: unknown[]; queryFn: () => Promise<unknown> } };
  post: { mutationOptions: () => { mutationFn: (input: Record<string, unknown>) => Promise<unknown> } };
  react: { mutationOptions: () => { mutationFn: (input: Record<string, unknown>) => Promise<unknown> } };
  follow: { mutationOptions: () => { mutationFn: (input: Record<string, unknown>) => Promise<unknown> } };
};
type ChallengesApi = {
  list: { queryOptions: (input?: Record<string, unknown>) => { queryKey: unknown[]; queryFn: () => Promise<unknown> } };
  join: { mutationOptions: () => { mutationFn: (input: Record<string, unknown>) => Promise<unknown> } };
  leaderboard: { queryOptions: (input: Record<string, unknown>) => { queryKey: unknown[]; queryFn: () => Promise<unknown> } };
  checkin: { mutationOptions: () => { mutationFn: (input: Record<string, unknown>) => Promise<unknown> } };
};

function castApi<T>(get: () => T): T | null {
  try {
    return get();
  } catch {
    return null;
  }
}

const SEGMENTS = ["feed", "challenges", "clubs", "my-rides"] as const;
type Segment = (typeof SEGMENTS)[number];

export default function Community() {
  const { t } = useLang();
  const { m } = useMoreLang();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [seg, setSeg] = useState<Segment>("feed");
  const [code, setCode] = useState("");
  const [eventName, setEventName] = useState("");
  const [postBody, setPostBody] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const community = useMemo(() => castApi(() => (trpc as unknown as { community: CommunityApi }).community), []);
  const challengesApi = useMemo(() => castApi(() => (trpc as unknown as { challenges: ChallengesApi }).challenges), []);

  // --- Feed (parallel-built community.*) ---
  const feedOpts = useMemo(() => {
    try {
      return community?.feed.queryOptions({ scope: "following" }) ?? null;
    } catch {
      return null;
    }
  }, [community]);
  const feedQuery = useQuery({
    queryKey: feedOpts?.queryKey ?? ["community-feed-off"],
    queryFn: feedOpts?.queryFn ?? (async () => null),
    enabled: !!feedOpts && !!session?.user,
    retry: false,
  });
  const feedPosts = useMemo(() => {
    const d = feedQuery.data as { items?: FeedPost[] } | FeedPost[] | null;
    if (!d) return null;
    return Array.isArray(d) ? d : (d.items ?? null);
  }, [feedQuery.data]);
  const postMut = useMutation({
    mutationFn: async (body: string) => {
      if (!community) throw new Error("no community api");
      const fn = community.post.mutationOptions().mutationFn;
      return fn({ body });
    },
  });
  const reactMut = useMutation({
    mutationFn: async (postId: string) => {
      if (!community) throw new Error("no community api");
      const fn = community.react.mutationOptions().mutationFn;
      return fn({ postId });
    },
  });

  // --- Challenges (parallel-built challenges.*) + monthly board fallback ---
  const chalOpts = useMemo(() => {
    try {
      return challengesApi?.list.queryOptions() ?? null;
    } catch {
      return null;
    }
  }, [challengesApi]);
  const chalQuery = useQuery({
    queryKey: chalOpts?.queryKey ?? ["challenges-off"],
    queryFn: chalOpts?.queryFn ?? (async () => null),
    retry: false,
  });
  const challengeList = useMemo(() => {
    const d = chalQuery.data as Challenge[] | null;
    return Array.isArray(d) ? d : null;
  }, [chalQuery.data]);
  const joinChallenge = useMutation({
    mutationFn: async (challengeId: string) => {
      if (!challengesApi) throw new Error("no challenges api");
      const fn = challengesApi.join.mutationOptions().mutationFn;
      return fn({ challengeId });
    },
  });
  const checkinMut = useMutation({
    mutationFn: async (challengeId: string) => {
      if (!challengesApi) throw new Error("no challenges api");
      const fn = challengesApi.checkin.mutationOptions().mutationFn;
      // Location comes from a recorded fix at the real call site (map.tsx); here the server
      // enforces the 200 m rule, so a bare check-in attempt is the honest minimal client.
      return fn({ challengeId });
    },
  });
  const boardQuery = useQuery(trpc.events.leaderboard.queryOptions({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }));

  // --- Clubs: events (existing) + real groups.mine/join ---
  const eventsQuery = useQuery(trpc.events.list.queryOptions());
  const rsvp = useMutation(trpc.events.rsvp.mutationOptions());
  const createEvent = useMutation(trpc.events.create.mutationOptions());
  const groupsQuery = useQuery({ ...trpc.groups.mine.queryOptions(), enabled: !!session?.user });
  const joinGroup = useMutation(trpc.groups.join.mutationOptions());
  const myGroups = useMemo(() => ((groupsQuery.data ?? []) as GroupRow[]), [groupsQuery.data]);

  // --- My rides: server history + local queue ---
  const mineQuery = useQuery({ ...trpc.rides.mine.queryOptions({ limit: 50 }), enabled: !!session?.user });
  const queuedQuery = useQuery({ queryKey: ["queued-rides"], queryFn: () => listQueued().catch(() => [] as QueuedRide[]) });

  const board = (boardQuery.data ?? []) as ChallengeBoardRow[];
  const events = (eventsQuery.data ?? []) as { id: string; name: string; place?: string | null; startsAt: string }[];
  const serverRides = useMemo(() => ((mineQuery.data ?? []) as { id: string; name?: string | null; distanceKm?: number | null; startedAt?: string | null }[]), [mineQuery.data]);
  const queued = (queuedQuery.data ?? []) as QueuedRide[];

  const segLabel = (s: Segment) => (s === "feed" ? m.feed : s === "challenges" ? m.challenges : s === "clubs" ? m.clubs : m.myRides);

  const openRide = (id: string) => router.push({ pathname: "/ride/[id]", params: { id } });

  const submitPost = async () => {
    if (!postBody.trim()) return;
    try {
      await postMut.mutateAsync(postBody.trim());
      setPostBody("");
      void feedQuery.refetch();
    } catch {
      setNote(m.postUnavailable);
    }
  };

  const addEvent = async () => {
    if (!eventName.trim()) return;
    await createEvent
      .mutateAsync({ name: eventName.trim(), place: "", startsAt: new Date(Date.now() + 7 * 864e5).toISOString() })
      .catch(() => null);
    setEventName("");
    void eventsQuery.refetch();
  };

  const joinByCode = async () => {
    const c = code.trim().toUpperCase();
    if (c.length !== 6) {
      setNote(m.groupJoinFailed);
      return;
    }
    try {
      await joinGroup.mutateAsync({ code: c });
      setCode("");
      setNote(m.groupJoined);
      void groupsQuery.refetch();
    } catch {
      setNote(m.groupJoinFailed);
    }
  };

  return (
    <Container className="p-6">
      <View className="gap-3">
      <View className="py-2">
        <Text className="text-2xl font-extrabold tracking-tight text-foreground">{t.challenge}</Text>
        <Text className="mt-1 text-muted">{t.challengeSub}</Text>
      </View>

      <Tabs value={seg} onValueChange={(v) => setSeg(v as Segment)} className="self-start">
        <Tabs.List accessibilityLabel={t.sections}>
          <Tabs.Indicator />
          {SEGMENTS.map((s) => (
            <Tabs.Trigger key={s} value={s}>
              <Tabs.Label>{segLabel(s)}</Tabs.Label>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs>

      {seg === "feed" && (
        <View className="gap-3">
          {session?.user && (
            <View className="flex-row gap-2">
              <TextField className="flex-1">
                <Input value={postBody} onChangeText={setPostBody} placeholder={m.newPost} returnKeyType="done" onSubmitEditing={() => void submitPost()} accessibilityLabel={m.newPost} />
              </TextField>
              <Button onPress={() => void submitPost()} accessibilityLabel={m.post}>
                <Button.Label>{m.post}</Button.Label>
              </Button>
            </View>
          )}
          {feedQuery.isLoading && <Text className="text-muted">{m.loading}</Text>}
          {feedPosts != null && feedPosts.length > 0 && (
            <ListGroup>
              {feedPosts.map((p, i) => (
                <Fragment key={p.id}>
                  <ListGroup.Item>
                    <ListGroup.ItemContent>
                      <ListGroup.ItemTitle numberOfLines={3}>{p.body ?? p.id}</ListGroup.ItemTitle>
                    </ListGroup.ItemContent>
                    {session?.user && (
                      <ListGroup.ItemSuffix>
                        <Button size="sm" variant="secondary" onPress={() => void reactMut.mutateAsync(p.id).then(() => feedQuery.refetch()).catch(() => setNote(m.postUnavailable))} accessibilityLabel={m.react}>
                          <Button.Label>
                            {m.react}
                            {p.likeCount ? ` ${p.likeCount}` : ""}
                          </Button.Label>
                        </Button>
                      </ListGroup.ItemSuffix>
                    )}
                  </ListGroup.Item>
                  {i < feedPosts.length - 1 && <Separator className="mx-4" />}
                </Fragment>
              ))}
            </ListGroup>
          )}
          {(feedPosts == null || feedPosts.length === 0) && !feedQuery.isLoading && (
            <Text className="leading-relaxed text-muted">{community ? m.feedEmpty : m.feedUnavailable}</Text>
          )}
        </View>
      )}

      {seg === "challenges" && (
        <View className="gap-3">
          {challengeList == null && <Text className="leading-relaxed text-muted">{m.challengesUnavailable}</Text>}
          {challengeList != null && challengeList.length > 0 && (
            <ListGroup>
              {challengeList.map((c, i) => (
                <Fragment key={c.id}>
                  <ListGroup.Item>
                    <ListGroup.ItemContent>
                      <ListGroup.ItemTitle numberOfLines={1}>{c.name ?? c.slug ?? c.id}</ListGroup.ItemTitle>
                      <ListGroup.ItemDescription>
                        {c.kind ?? ""}{c.target != null ? ` · ${c.target}` : ""}
                      </ListGroup.ItemDescription>
                    </ListGroup.ItemContent>
                    {session?.user && (
                      <ListGroup.ItemSuffix>
                        <View className="flex-row gap-1">
                          <Button size="sm" variant="secondary" onPress={() => void joinChallenge.mutateAsync(c.id).then(() => setNote(m.joined)).catch(() => setNote(m.challengesUnavailable))} accessibilityLabel={m.challengeJoin}>
                            <Button.Label>{m.challengeJoin}</Button.Label>
                          </Button>
                          <Button size="sm" variant="secondary" onPress={() => void checkinMut.mutateAsync(c.id).then(() => setNote(m.checkinDone)).catch(() => setNote(m.challengesUnavailable))} accessibilityLabel={m.checkin}>
                            <Button.Label>{m.checkin}</Button.Label>
                          </Button>
                        </View>
                      </ListGroup.ItemSuffix>
                    )}
                  </ListGroup.Item>
                  {i < challengeList.length - 1 && <Separator className="mx-4" />}
                </Fragment>
              ))}
            </ListGroup>
          )}
          <Text className="text-xs leading-relaxed text-muted">{m.checkinNote}</Text>
          {board.length > 0 && (
            <ListGroup>
              {board.map((r, i) => (
                <Fragment key={r.userId ?? r.name ?? i}>
                  <ListGroup.Item>
                    <ListGroup.ItemContent>
                      <ListGroup.ItemTitle numberOfLines={1}>
                        {i + 1}. {r.name}
                      </ListGroup.ItemTitle>
                    </ListGroup.ItemContent>
                    <ListGroup.ItemSuffix>
                      <Text className="font-extrabold text-foreground tabular-nums">{r.km} km</Text>
                    </ListGroup.ItemSuffix>
                  </ListGroup.Item>
                  {i < board.length - 1 && <Separator className="mx-4" />}
                </Fragment>
              ))}
            </ListGroup>
          )}
          {!boardQuery.isLoading && board.length === 0 && <Text className="leading-relaxed text-muted">{t.noRides}</Text>}
        </View>
      )}

      {seg === "clubs" && (
        <View className="gap-3">
          <Text className="text-sm leading-relaxed text-muted">{m.clubsNote}</Text>
          {session?.user && (
            <View className="flex-row gap-2">
              <TextField className="flex-1">
                <Input value={code} onChangeText={(v) => setCode(v.toUpperCase())} placeholder={m.groupCode} maxLength={6} autoCapitalize="characters" returnKeyType="done" onSubmitEditing={() => void joinByCode()} accessibilityLabel={m.groupCode} />
              </TextField>
              <Button onPress={() => void joinByCode()} accessibilityLabel={m.joinByCode}>
                <Button.Label>{m.joinByCode}</Button.Label>
              </Button>
            </View>
          )}
          {myGroups.length > 0 && (
            <ListGroup>
              {myGroups.map((g, i) => (
                <Fragment key={g.id}>
                  <ListGroup.Item>
                    <ListGroup.ItemContent>
                      <ListGroup.ItemTitle numberOfLines={1}>{g.name}</ListGroup.ItemTitle>
                      <ListGroup.ItemDescription>{g.code}</ListGroup.ItemDescription>
                    </ListGroup.ItemContent>
                  </ListGroup.Item>
                  {i < myGroups.length - 1 && <Separator className="mx-4" />}
                </Fragment>
              ))}
            </ListGroup>
          )}
          <Text className="mt-2 text-lg font-extrabold text-foreground">{t.groupRides}</Text>
          <Text className="-mt-2 text-muted">{t.groupRidesSub}</Text>
          {!eventsQuery.isLoading && events.length === 0 && <Text className="text-muted">{t.noEvents}</Text>}
          {events.length > 0 && (
            <ListGroup>
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
                        <Button size="sm" variant="secondary" onPress={() => void rsvp.mutateAsync({ eventId: e.id }).then(() => queryClient.refetchQueries()).catch(() => undefined)}>
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
            <View className="flex-row gap-2">
              <TextField className="flex-1">
                <Input value={eventName} onChangeText={setEventName} placeholder={t.newRideName} returnKeyType="done" onSubmitEditing={() => void addEvent()} accessibilityLabel={t.newRideName} />
              </TextField>
              <Button onPress={() => void addEvent()} accessibilityLabel={t.add}>
                <Button.Label>{t.add}</Button.Label>
              </Button>
            </View>
          )}
        </View>
      )}

      {seg === "my-rides" && (
        <View className="gap-2">
          {serverRides.length === 0 && queued.length === 0 && <Text className="text-muted">{m.noRidesYet}</Text>}
          {queued.map((r) => (
            <ListGroup key={r.id}>
              <ListGroup.Item>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle numberOfLines={1}>{r.name}</ListGroup.ItemTitle>
                  <ListGroup.ItemDescription>
                    {Math.round(r.distanceKm * 10) / 10} km · {m.queuedTag}
                  </ListGroup.ItemDescription>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix>
                  <Button size="sm" variant="secondary" onPress={() => openRide(r.id)} accessibilityLabel={m.openRide}>
                    <Button.Label>{m.openRide}</Button.Label>
                  </Button>
                </ListGroup.ItemSuffix>
              </ListGroup.Item>
            </ListGroup>
          ))}
          {serverRides.length > 0 && (
            <ListGroup>
              {serverRides.map((r, i) => (
                <Fragment key={r.id}>
                  <ListGroup.Item>
                    <ListGroup.ItemContent>
                      <ListGroup.ItemTitle numberOfLines={1}>{r.name ?? r.id}</ListGroup.ItemTitle>
                      <ListGroup.ItemDescription>
                        {[r.distanceKm != null ? `${Math.round(r.distanceKm * 10) / 10} km` : null, r.startedAt ? new Date(r.startedAt).toLocaleDateString() : null].filter(Boolean).join(" · ")}
                      </ListGroup.ItemDescription>
                    </ListGroup.ItemContent>
                    <ListGroup.ItemSuffix>
                      <Button size="sm" variant="secondary" onPress={() => openRide(r.id)} accessibilityLabel={m.openRide}>
                        <Button.Label>{m.openRide}</Button.Label>
                      </Button>
                    </ListGroup.ItemSuffix>
                  </ListGroup.Item>
                  {i < serverRides.length - 1 && <Separator className="mx-4" />}
                </Fragment>
              ))}
            </ListGroup>
          )}
          <View className="mt-2 flex-row flex-wrap gap-2">
            <Link href="/(drawer)/learn" asChild>
              <Button size="sm" variant="secondary">
                <Ionicons name="book-outline" size={16} />
                <Button.Label>{m.learnTitle}</Button.Label>
              </Button>
            </Link>
            <Link href="/(drawer)/dealers" asChild>
              <Button size="sm" variant="secondary">
                <Ionicons name="construct-outline" size={16} />
                <Button.Label>{m.dealersTitle}</Button.Label>
              </Button>
            </Link>
            <Link href="/(drawer)/privacy" asChild>
              <Button size="sm" variant="secondary">
                <Ionicons name="eye-off-outline" size={16} />
                <Button.Label>{m.privacyTitle}</Button.Label>
              </Button>
            </Link>
          </View>
        </View>
      )}

      {note != null && <Text className="text-sm text-muted">{note}</Text>}
      </View>
    </Container>
  );
}
