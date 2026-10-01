// Ride detail (plan §4.10/§4.11): track map, stats grid, elevation + speed + lean charts,
// photo strip, replay scrubber, share/visibility. Offline-first: the local queued ride is the
// primary source; the server row (rides.mine) only adds visibility/sync state when reachable.
// Privacy: samples here were already `trimEnds`-trimmed at record time (lib/ride-recorder.ts).
import { Camera, GeoJSONSource, Layer } from "@maplibre/maplibre-react-native";
import { useQuery } from "@tanstack/react-query";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Button, Card, Slider } from "heroui-native";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";

import type { RideSample } from "@roto-app/core/types";
import { LeanChart } from "@/components/charts/lean-chart";
import { LineChart } from "@/components/charts/line-chart";
import { Container } from "@/components/container";
import { MotoMap } from "@/components/moto-map";
import { PhotoButton } from "@/components/ride/photo-button";
import { PhotoStrip } from "@/components/ride/photo-strip";
import { ShareControls, type Visibility } from "@/components/ride/share-controls";
import { authClient } from "@/lib/auth-client";
import { useMoreLang } from "@/lib/i18n-more";
import { insideAny, type Zone } from "@/lib/privacy";
import { listQueued, uploadQueuedPhotos } from "@/lib/ride-queue";
import { ROTO } from "@/lib/roto-theme";
import { queryClient, trpc } from "@/utils/trpc";

function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)] as T);
  return out;
}

function fmtDuration(totalS: number | null): string {
  if (totalS == null) return "—";
  const h = Math.floor(totalS / 3600);
  const mm = Math.floor((totalS % 3600) / 60);
  return h > 0 ? `${h}h ${mm}m` : `${mm} min`;
}

type ServerRide = {
  id?: string;
  name?: string | null;
  distanceKm?: number | null;
  visibility?: Visibility | null;
  hideMaxSpeed?: boolean | null;
};

export default function RideDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { m } = useMoreLang();
  const { data: session } = authClient.useSession();
  const [replayIdx, setReplayIdx] = useState(0);
  const [photoTick, setPhotoTick] = useState(0);
  const [uploadNote, setUploadNote] = useState<string | null>(null);

  const localQuery = useQuery({
    queryKey: ["queued-ride", id],
    queryFn: async () => (await listQueued()).find((r) => r.id === id) ?? null,
  });
  const serverQuery = useQuery({
    ...trpc.rides.mine.queryOptions({ limit: 200 }),
    enabled: !!session?.user,
  });
  const zonesQuery = useQuery({ ...trpc.privacy.list.queryOptions(), enabled: !!session?.user });

  const serverRide = useMemo<ServerRide | null>(() => {
    try {
      const rows = (serverQuery.data ?? []) as ServerRide[];
      return rows.find((r) => r?.id === id) ?? null;
    } catch {
      return null;
    }
  }, [serverQuery.data, id]);

  const zones: Zone[] = useMemo(() => {
    try {
      return ((zonesQuery.data ?? []) as { lat: number; lon: number; radiusM?: number }[]).map((z) => ({
        lat: z.lat,
        lon: z.lon,
        radiusM: z.radiusM ?? 200,
      }));
    } catch {
      return [];
    }
  }, [zonesQuery.data]);

  const ride = localQuery.data;
  const samples: RideSample[] = useMemo(() => ride?.samples ?? [], [ride]);
  const coords = useMemo(() => samples.map((s) => [s.lon, s.lat] as [number, number]), [samples]);

  const trackGeo = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: { type: "LineString" as const, coordinates: coords },
          properties: {},
        },
      ],
    }),
    [coords],
  );

  const replaySample = samples[Math.min(replayIdx, samples.length - 1)];
  const markerGeo = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: replaySample
        ? [
            {
              type: "Feature" as const,
              geometry: { type: "Point" as const, coordinates: [replaySample.lon, replaySample.lat] as [number, number] },
              properties: {},
            },
          ]
        : [],
    }),
    [replaySample],
  );

  const center: [number, number] = replaySample
    ? [replaySample.lon, replaySample.lat]
    : coords.length > 0
      ? (coords[Math.floor(coords.length / 2)] as [number, number])
      : [79.86, 6.93];

  const elev = useMemo(() => downsample(samples.map((s) => s.ele ?? 0), 300), [samples]);
  const speed = useMemo(() => downsample(samples.map((s) => (s.spd ?? 0) * 3.6), 300), [samples]);
  const lean = useMemo(() => downsample(samples.map((s) => Math.abs(s.lean ?? 0)), 300), [samples]);
  const hasElev = useMemo(() => samples.some((s) => (s.ele ?? 0) !== 0), [samples]);

  const hideMax = !!serverRide?.hideMaxSpeed;
  const name = ride?.name ?? serverRide?.name ?? m.rideDetail;
  const km = ride?.distanceKm ?? serverRide?.distanceKm ?? 0;

  const stats: { label: string; value: string }[] = [
    { label: m.distance, value: `${Math.round(km * 10) / 10} km` },
    { label: m.movingTime, value: fmtDuration(ride?.movingS ?? null) },
    { label: m.totalTime, value: fmtDuration(ride?.durationS ?? null) },
    { label: m.avgSpeed, value: ride?.avgSpeedKmh != null ? `${Math.round(ride.avgSpeedKmh)} km/h` : "—" },
    { label: m.maxSpeed, value: hideMax ? "—" : ride?.maxSpeedKmh != null ? `${Math.round(ride.maxSpeedKmh)} km/h` : "—" },
    { label: m.maxLean, value: ride?.maxLean != null ? `${Math.round(ride.maxLean * 10) / 10}°` : "—" },
  ];

  const upload = async () => {
    setUploadNote(null);
    const res = await uploadQueuedPhotos().catch(() => ({ uploaded: 0, pending: 0, reason: "error" }));
    setUploadNote(res.reason ? m.uploadUnavailable : m.photosUploaded);
    setPhotoTick((t) => t + 1);
    void queryClient.refetchQueries().catch(() => undefined);
  };

  if (localQuery.isLoading) {
    return (
      <Container className="p-6">
        <Text className="text-muted">{m.loading}</Text>
      </Container>
    );
  }

  if (!ride && !serverRide) {
    return (
      <Container className="p-6">
        <Stack.Screen options={{ title: m.rideDetail }} />
        <Text className="text-foreground">{m.rideNotFound}</Text>
        <Link href="/(drawer)/(tabs)/two" asChild>
          <Button className="mt-4" variant="secondary">
            <Button.Label>{m.backToRides}</Button.Label>
          </Button>
        </Link>
      </Container>
    );
  }

  return (
    <Container className="p-6">
      <View className="gap-4">
      <Stack.Screen options={{ title: name }} />
      <View className="flex-row items-center gap-2">
        <View style={{ backgroundColor: serverRide ? ROTO.go : ROTO.signal }} className="size-2 rounded-full" />
        <Text className="text-sm text-muted">{serverRide ? m.syncedRide : m.localRide}</Text>
      </View>

      {coords.length > 0 && (
        <View style={{ height: 260, borderRadius: ROTO.radius, overflow: "hidden" }}>
          <MotoMap>
            <Camera center={center} zoom={13} />
            <GeoJSONSource id="track" data={trackGeo}>
              <Layer id="track-line" source="track" type="line" paint={{ "line-color": ROTO.signal, "line-width": 4 }} />
            </GeoJSONSource>
            <GeoJSONSource id="replay-marker" data={markerGeo}>
              <Layer
                id="replay-dot"
                source="replay-marker"
                type="circle"
                paint={{ "circle-radius": 8, "circle-color": ROTO.parchment, "circle-stroke-color": ROTO.signal, "circle-stroke-width": 3 }}
              />
            </GeoJSONSource>
          </MotoMap>
        </View>
      )}
      <Text className="text-xs text-muted">© OpenMapTiles © OpenStreetMap contributors</Text>

      {samples.length > 1 && (
        <View>
          <Text className="mb-2 text-sm font-bold text-foreground">{m.replay}</Text>
          <Slider
            value={replayIdx}
            minValue={0}
            maxValue={samples.length - 1}
            step={1}
            onChange={(v) => setReplayIdx(typeof v === "number" ? Math.round(v) : Math.round(v[0] ?? 0))}
            accessibilityLabel={m.replay}
          >
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb />
            </Slider.Track>
          </Slider>
        </View>
      )}

      <View className="flex-row flex-wrap gap-2">
        {stats.map((s) => (
          <Card key={s.label} variant="secondary" className="min-w-[30%] flex-1 p-3">
            <Text className="text-xs text-muted">{s.label}</Text>
            <Text className="text-lg font-extrabold text-foreground tabular-nums">{s.value}</Text>
          </Card>
        ))}
      </View>

      {hasElev && <LineChart data={elev} color={ROTO.sky} label={m.elevation} unit="m" highlightIdx={replayIdx} />}
      {speed.some((v) => v > 0) && <LineChart data={speed} label={m.speed} unit="km/h" highlightIdx={replayIdx} />}
      {lean.some((v) => v > 0) && (
        <View>
          <LineChart data={lean} color={ROTO.danger} label={m.lean} unit="°" highlightIdx={replayIdx} />
          <Text className="mb-1 mt-3 text-sm font-bold text-foreground">{m.corners}</Text>
          <LeanChart samples={samples} />
        </View>
      )}

      <View>
        <Text className="mb-2 text-sm font-bold text-foreground">{m.photos}</Text>
        <PhotoStrip rideId={id} refreshKey={photoTick} queuedLabel={m.queuedTag} />
        <View className="mt-2 flex-row gap-2">
          <PhotoButton rideId={id} zones={zones} onQueued={() => setPhotoTick((t) => t + 1)} />
          <Button variant="secondary" onPress={() => void upload()} accessibilityLabel={m.uploadPhotos}>
            <Button.Label>{m.uploadPhotos}</Button.Label>
          </Button>
        </View>
        {samples.length === 0 && zones.length > 0 && (
          <Text className="mt-2 text-xs text-muted">
            {samples.filter((s) => insideAny(s.lon, s.lat, zones)).length} fixes inside zones are never sent.
          </Text>
        )}
        {uploadNote != null && <Text className="mt-2 text-sm text-muted">{uploadNote}</Text>}
      </View>

      <ShareControls rideId={id} rideName={name} initial={serverRide?.visibility ?? "private"} />
      </View>
    </Container>
  );
}
