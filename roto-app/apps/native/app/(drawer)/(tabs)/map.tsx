import { Camera, GeoJSONSource, Layer } from "@maplibre/maplibre-react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as Speech from "expo-speech";
import { Link } from "expo-router";
import {
  Alert,
  Button,
  Chip,
  CloseButton,
  ControlField,
  Input,
  Label,
  LinkButton,
  Surface,
  Tabs,
  TextField,
  useToast,
} from "heroui-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

import { MotoMap } from "@/components/moto-map";
import { LANGS, speak, useLang, type Lang } from "@/lib/i18n";
import { downloadLkRegion } from "@/lib/maps";
import { clearQueued, listQueued } from "@/lib/ride-queue";
import { haversineKm, useRideRecorder } from "@/lib/ride-recorder";
import { ROTO, numerals } from "@/lib/roto-theme";
import type { RouteResult } from "@/lib/routing";
import { sosAlert } from "@/lib/safety";
import { authClient } from "@/lib/auth-client";
import { parseGpxTrack } from "@/lib/gpx";
import { insideAny, trimEnds, type Zone } from "@/lib/privacy";
import { fetchWx, type Wx } from "@/lib/weather";
import { queryClient, trpc } from "@/utils/trpc";

const COLOMBO: [number, number] = [79.8612, 6.9271];

const StyledIonicons = withUniwind(Ionicons);

const SectionLabel = memo(function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-muted" style={{ fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>
      {children}
    </Text>
  );
});

export default function RideMap() {
  const { lang, setLang, t } = useLang();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();

  const poisQuery = useQuery(trpc.rides.pois.queryOptions({}));
  const { data: session } = authClient.useSession();
  const sosQuery = useQuery({ ...trpc.rides.sosList.queryOptions(), enabled: !!session?.user });
  const createRide = useMutation(trpc.rides.create.mutationOptions());
  const reportPoi = useMutation(trpc.rides.reportPoi.mutationOptions());
  const createGroup = useMutation(trpc.groups.create.mutationOptions());
  const joinGroup = useMutation(trpc.groups.join.mutationOptions());
  const pushPosition = useMutation(trpc.groups.updatePosition.mutationOptions());
  const setHome = useMutation(trpc.privacy.setHome.mutationOptions());

  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupCode, setGroupCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [route, setRoute] = useState<(RouteResult & { name: string }) | null>(null);
  const [wx, setWx] = useState<Wx | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [hud, setHud] = useState(false);
  const [hudInfo, setHudInfo] = useState({ instr: "", distM: 0, arrowDeg: 0, speed: 0 });
  const [saver, setSaver] = useState(false);
  const lastFix = useRef<[number, number]>(COLOMBO);
  const announced = useRef(0);
  const rainWarned = useRef(false);
  const curatedIdx = useRef(0);
  const zonesQuery = useQuery({ ...trpc.privacy.list.queryOptions(), enabled: !!session?.user });
  const zones: Zone[] = (zonesQuery.data ?? []).map((z) => ({ lat: z.lat, lon: z.lon, radiusM: z.radiusM }));
  const sharing = !!groupId && !!session?.user;
  const membersQuery = useQuery({
    ...trpc.groups.members.queryOptions({ groupId: groupId ?? "" }),
    enabled: sharing,
    refetchInterval: sharing ? (saver ? 30000 : 5000) : false,
  });

  useEffect(() => {
    SecureStore.getItemAsync("roto-saver").then((v) => setSaver(v === "1")).catch(() => undefined);
  }, []);
  const flipSaver = async () => {
    const next = !saver;
    setSaver(next);
    await SecureStore.setItemAsync("roto-saver", next ? "1" : "0").catch(() => undefined);
  };

  const reduceMotion = useReducedMotion();
  const arrowDeg = useSharedValue(0);
  const arrowBase = useRef(0);
  useEffect(() => {
    const target = hudInfo.arrowDeg;
    let delta = ((target - arrowBase.current + 540) % 360) - 180;
    arrowBase.current += delta;
    arrowDeg.value = reduceMotion ? arrowBase.current : withSpring(arrowBase.current, { damping: 18, stiffness: 140 });
  }, [hudInfo.arrowDeg, arrowDeg, reduceMotion]);
  const arrowStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${arrowDeg.value}deg` }] }));

  const crash = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    speak(lang, "crash");
    const phones = (sosQuery.data ?? []).map((c) => c.phone);
    void sosAlert(phones, "Roto SOS: rider may have crashed. Last location shared in app.");
  };

  const bearing = (lon1: number, lat1: number, lon2: number, lat2: number) => {
    const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
    const x =
      Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
      Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(((lon2 - lon1) * Math.PI) / 180);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  };
  const follow = (lon: number, lat: number, heading: number, speed: number) => {
    const steps = route?.steps;
    const next = steps && announced.current < steps.length ? steps[announced.current] : undefined;
    if (next) {
      const d = haversineKm([[next.lon, next.lat]], { latitude: lat, longitude: lon });
      setHudInfo({ instr: next.instruction, distM: Math.round(d * 1000), arrowDeg: Math.round(bearing(lon, lat, next.lon, next.lat) - heading), speed: Math.round(speed) });
      if (d < 0.12) {
        announced.current += 1;
        Speech.speak(next.instruction, { language: "en-LK" });
      }
    } else {
      setHudInfo((h) => ({ ...h, speed: Math.round(speed) }));
    }
  };

  const { recording, km, elapsedMin, avgKmh, maxLean, start, stop, online } = useRideRecorder(
    crash,
    (lon, lat, heading, speedKmh) => {
      lastFix.current = [lon, lat];
      if (groupId && !insideAny(lon, lat, zones)) pushPosition.mutate({ groupId, lon, lat });
      follow(lon, lat, heading, speedKmh);
    },
    { lowPower: saver },
  );

  useEffect(() => {
    fetchWx(COLOMBO[1], COLOMBO[0]).then((w) => {
      setWx(w);
      if (w && w.rain > 2 && !rainWarned.current) {
        rainWarned.current = true;
        speak(lang, "rain");
      }
    });
  }, []);

  const run = async (key: string, fn: () => Promise<void>, failMsg: string) => {
    setBusy(key);
    try {
      await fn();
    } catch {
      toast.show({ variant: "danger", label: failMsg });
    } finally {
      setBusy(null);
    }
  };

  const toggle = async () => {
    void Haptics.selectionAsync().catch(() => undefined);
    if (recording) {
      const r = await stop((c) => trimEnds(c, zones));
      if (await online()) {
        try {
          await createRide.mutateAsync({ name: `Ride ${new Date().toLocaleDateString()}`, distanceKm: r.km, maxLeanDeg: r.maxLean || undefined, gpx: undefined });
          await clearQueued([r.id]);
        } catch {
          // stays queued, syncs next stop
        }
      }
    } else {
      await start().catch(() => toast.show({ variant: "danger", label: t.failedRoute }));
    }
  };

  const loop = () =>
    run("loop", async () => {
      const [lon, lat] = lastFix.current;
      const r = await queryClient.fetchQuery(trpc.route.roundTrip.queryOptions({ center: { lat, lon }, km: 60, curvy: 0.7 }));
      announced.current = 0;
      setRoute({ ...r, name: "Loop 60km" });
    }, t.failedRoute);

  const loadCurated = () =>
    run("routes", async () => {
      const list = await queryClient.fetchQuery(trpc.curated.list.queryOptions({}));
      if (!list.length) throw new Error("empty");
      const pick = list[curatedIdx.current % list.length];
      curatedIdx.current += 1;
      if (!pick) throw new Error("empty");
      const full = await queryClient.fetchQuery(trpc.curated.get.queryOptions({ id: pick.id }));
      announced.current = 0;
      setRoute({ coords: full.coords as [number, number][], km: full.distanceKm, min: 0, engine: "curated", name: full.nameEn });
    }, t.failedRoute);

  const importGpx = () =>
    run("import", async () => {
      const picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true }).catch(() => null);
      const uri = picked && picked.assets?.[0]?.uri;
      if (!uri) return;
      const xml = await FileSystem.readAsStringAsync(uri);
      const coords = parseGpxTrack(xml);
      if (coords.length < 2) throw new Error("empty");
      let km = 0;
      for (let i = 1; i < coords.length; i++) {
        const a = coords[i - 1];
        const b = coords[i];
        if (a && b) km += haversineKm([a], { latitude: b[1], longitude: b[0] });
      }
      announced.current = 0;
      setRoute({ coords, km, min: 0, engine: "gpx", name: "Imported GPX" });
    }, t.failedImport);

  const reportHazard = () =>
    run("hazard", async () => {
      if (!session?.user) throw new Error("login");
      const loc = await Location.getCurrentPositionAsync({});
      await reportPoi.mutateAsync({ kind: "hazard", name: "Hazard report", lat: loc.coords.latitude, lon: loc.coords.longitude });
      poisQuery.refetch();
      toast.show({ variant: "success", label: t.hazardSaved });
    }, t.loginNeeded);

  const share = () =>
    run("share", async () => {
      if (groupId) {
        setGroupId(null);
        return;
      }
      if (!session?.user) throw new Error("login");
      const g = await createGroup.mutateAsync({ name: `Ride ${new Date().toLocaleDateString()}` });
      setGroupId(g.id);
      setGroupCode(g.code);
    }, t.loginNeeded);

  const join = () =>
    run("join", async () => {
      const g = await joinGroup.mutateAsync({ code: joinCode.trim().toUpperCase() });
      setGroupId(g.id);
      setGroupCode(joinCode.trim().toUpperCase());
      setJoinCode("");
    }, t.failedJoin);

  const syncQueued = async () => {
    if (!(await online())) return 0;
    const queued = await listQueued();
    const done: string[] = [];
    for (const q of queued) {
      try {
        await createRide.mutateAsync({ name: q.name, distanceKm: q.distanceKm, maxLeanDeg: q.maxLean ?? undefined, gpx: q.gpx ?? undefined });
        done.push(q.id);
      } catch {
        break;
      }
    }
    await clearQueued(done);
    return done.length;
  };

  const setHomeHere = () =>
    run("home", async () => {
      if (!session?.user) throw new Error("login");
      const [lon, lat] = lastFix.current;
      await setHome.mutateAsync({ lat, lon });
      zonesQuery.refetch();
    }, t.loginNeeded);

  const pois = poisQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const features = useMemo(
    () =>
      pois.map((p) => ({
        type: "Feature" as const,
        properties: { name: p.nameEn, kind: p.kind },
        geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
      })),
    [pois],
  );
  const memberFeatures = useMemo(
    () =>
      members.map((m) => ({
        type: "Feature" as const,
        properties: { name: m.name ?? "rider" },
        geometry: { type: "Point" as const, coordinates: [m.lon, m.lat] },
      })),
    [members],
  );
  const poisGeo = useMemo(() => ({ type: "FeatureCollection" as const, features }), [features]);
  const membersGeo = useMemo(() => ({ type: "FeatureCollection" as const, features: memberFeatures }), [memberFeatures]);
  const routeGeo = useMemo(
    () => ({ type: "FeatureCollection" as const, features: route ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: route.coords } }] : [] }),
    [route],
  );

  if (hud) {
    // ponytail: the HUD is a fixed dark overlay by design (DESIGN.md "Signature
    // Component") — it stays black-on-signal regardless of the app's light/dark
    // theme, so it keeps using raw ROTO colors instead of theme tokens.
    return (
      <Pressable
        onPress={() => setHud(false)}
        accessibilityRole="button"
        accessibilityLabel={t.tapExitHud}
        style={{ flex: 1, backgroundColor: ROTO.black, justifyContent: "center", alignItems: "center", gap: 16, padding: 24, paddingTop: insets.top + 24 }}
      >
        <Text maxFontSizeMultiplier={1.5} style={{ color: ROTO.white, fontSize: 64, ...numerals }}>{hudInfo.speed}</Text>
        <Text style={{ color: ROTO.fog, fontSize: 18 }}>km/h</Text>
        <Animated.View style={arrowStyle}>
          <Ionicons name="navigate" size={72} color={ROTO.signal} />
        </Animated.View>
        <Text style={{ color: ROTO.white, fontSize: 22, textAlign: "center" }}>{hudInfo.instr || t.noRouteHud}</Text>
        <Text style={{ color: ROTO.signal, fontSize: 28, fontWeight: "700" }}>
          {hudInfo.distM > 950 ? `${(hudInfo.distM / 1000).toFixed(1)} km` : `${hudInfo.distM} m`}
        </Text>
        <Text style={{ color: ROTO.fog, marginTop: 24 }}>{t.tapExitHud}</Text>
      </Pressable>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <MotoMap>
        <Camera center={COLOMBO} zoom={12} />
        <GeoJSONSource id="pois" data={poisGeo}>
          <Layer id="poi-dots" source="pois" type="circle" paint={{ "circle-radius": 7, "circle-color": ROTO.parchment, "circle-stroke-color": ROTO.signal, "circle-stroke-width": 2 }} />
          <Layer id="poi-labels" source="pois" type="symbol" layout={{ "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.2] }} />
        </GeoJSONSource>
        <GeoJSONSource id="members" data={membersGeo}>
          <Layer id="member-dots" source="members" type="circle" paint={{ "circle-radius": 8, "circle-color": ROTO.live }} />
          <Layer id="member-labels" source="members" type="symbol" layout={{ "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.2] }} />
        </GeoJSONSource>
        <GeoJSONSource
          id="route"
          data={routeGeo}
        >
          <Layer id="route-line" source="route" type="line" paint={{ "line-color": ROTO.signal, "line-width": 4 }} />
        </GeoJSONSource>
      </MotoMap>

      <ScrollView
        style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
        contentContainerStyle={{ padding: 16, paddingBottom: Math.max(28, insets.bottom + 78), gap: 14, maxWidth: 560, width: "100%", alignSelf: "center" }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Tabs value={lang} onValueChange={(v) => void setLang(v as Lang)} className="self-center">
          <Tabs.List accessibilityLabel="Language">
            <Tabs.Indicator />
            {LANGS.map((l) => (
              <Tabs.Trigger key={l.code} value={l.code}>
                <Tabs.Label>{l.label}</Tabs.Label>
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs>

        {!session?.user ? (
          <Link href="/(drawer)" asChild>
            <Button variant="secondary">
              <Button.Label>{t.signInPrompt}</Button.Label>
            </Button>
          </Link>
        ) : (
          <View>
            <Text className="text-foreground text-center font-semibold">{session.user.email}</Text>
            <Text className="text-muted text-center text-sm">
              {(sosQuery.data ?? []).length} SOS contacts
            </Text>
          </View>
        )}

        <View className="items-center">
          <Text maxFontSizeMultiplier={1.5} className="text-foreground text-center" style={{ fontSize: 44, ...numerals }}>
            {recording ? km.toFixed(1) : maxLean > 0 ? maxLean.toFixed(0) + "°" : "—"}
          </Text>
          <Text className="text-muted text-center text-sm">
            {recording ? `${elapsedMin.toFixed(0)} min, ${avgKmh.toFixed(0)} km/h` : maxLean > 0 ? `${t.lastRide} ${t.maxLean}` : t.ready}
          </Text>
          {recording && (
            <Text style={{ color: ROTO.danger, textAlign: "center", fontSize: 13, fontWeight: "700" }}>● {t.rec}</Text>
          )}
        </View>
        {wx && (
          <Text className="text-accent text-center">
            {wx.temp.toFixed(0)}°C · {t.rainLabel} {wx.rain.toFixed(1)}mm · {t.windLabel} {wx.wind.toFixed(0)}km/h
          </Text>
        )}
        {route && (
          <Alert status="accent" className="items-center">
            <Alert.Indicator className="pt-0" />
            <Alert.Content>
              <Alert.Title>{route.name}</Alert.Title>
              <Alert.Description>
                {route.engine} · {route.km.toFixed(0)}km
              </Alert.Description>
            </Alert.Content>
            <CloseButton onPress={() => setRoute(null)} accessibilityLabel={t.dismiss} />
          </Alert>
        )}

        {/* One primary action per screen (DESIGN.md "One Signal Rule"): START/STOP. */}
        <Button size="lg" variant={recording ? "danger" : "primary"} onPress={() => void toggle()}>
          <Button.Label className="text-lg font-extrabold" style={{ letterSpacing: 1 }}>
            {recording ? t.stop : t.startRide}
          </Button.Label>
        </Button>

        <View className="gap-2">
          <SectionLabel>{t.sectionRide}</SectionLabel>
          {/* SOS never gates behind busy/saver/login — PRODUCT.md "Safety never sleeps". */}
          <Button size="lg" variant="danger" onPress={() => crash()} accessibilityLabel={t.sos}>
            <Button.Label>{t.sos}</Button.Label>
          </Button>
        </View>

        <Surface variant="secondary" className="gap-3">
          <SectionLabel>{t.sectionPlan}</SectionLabel>
          <View className="flex-row gap-3">
            <Button className="flex-1" variant="secondary" onPress={() => void loop()} isDisabled={busy !== null} accessibilityLabel={t.loop}>
              <Button.Label>{busy === "loop" ? "…" : t.loop}</Button.Label>
            </Button>
            <Button className="flex-1" variant="secondary" onPress={() => void loadCurated()} isDisabled={busy !== null} accessibilityLabel={t.routes}>
              <Button.Label>{busy === "routes" ? "…" : t.routes}</Button.Label>
            </Button>
          </View>
          <View className="flex-row gap-3">
            <Button className="flex-1" variant="secondary" onPress={() => void importGpx()} isDisabled={busy !== null} accessibilityLabel={t.import}>
              <Button.Label>{busy === "import" ? "…" : t.import}</Button.Label>
            </Button>
            <Button className="flex-1" variant="secondary" onPress={() => void reportHazard()} isDisabled={busy !== null} accessibilityLabel={t.hazard}>
              <StyledIonicons name="warning" size={18} className="text-accent" />
              <Button.Label>{t.hazard}</Button.Label>
            </Button>
          </View>
        </Surface>

        <Surface variant="secondary" className="gap-3">
          <SectionLabel>{t.sectionGroup}</SectionLabel>
          {groupId ? (
            <Chip
              size="lg"
              onPress={() => void share()}
              disabled={busy !== null}
              accessibilityLabel={t.shareLive}
              style={{ backgroundColor: ROTO.live }}
              className="self-start"
            >
              <Chip.Label style={{ color: ROTO.white }} className="font-extrabold">
                {busy === "share" ? "…" : `LIVE ${groupCode} (${memberFeatures.length})`}
              </Chip.Label>
            </Chip>
          ) : (
            <>
              <Button variant="secondary" onPress={() => void share()} isDisabled={busy !== null} accessibilityLabel={t.shareLive}>
                <Button.Label>{busy === "share" ? "…" : t.shareLive}</Button.Label>
              </Button>
              <View className="flex-row gap-2">
                <TextField className="flex-1">
                  <Input
                    value={joinCode}
                    onChangeText={setJoinCode}
                    placeholder={t.code}
                    autoCapitalize="characters"
                    maxLength={6}
                    accessibilityLabel={t.code}
                  />
                </TextField>
                <Button variant="secondary" onPress={() => void join()} isDisabled={busy !== null} accessibilityLabel={t.join}>
                  <Button.Label>{t.join}</Button.Label>
                </Button>
              </View>
            </>
          )}
        </Surface>

        <Surface variant="secondary" className="gap-3">
          <SectionLabel>{t.sectionOffline}</SectionLabel>
          <Button
            variant="secondary"
            onPress={() => void run("offline", () => downloadLkRegion("colombo").then(() => {}), t.failedRoute)}
            isDisabled={busy !== null}
            accessibilityLabel={t.offlineCmb}
          >
            <Button.Label>{busy === "offline" ? "…" : t.offlineCmb}</Button.Label>
          </Button>
        </Surface>

        <Surface variant="secondary" className="gap-3">
          <SectionLabel>{t.sectionTools}</SectionLabel>
          <ControlField isSelected={saver} onSelectedChange={() => void flipSaver()} isDisabled={busy !== null}>
            <StyledIonicons name={saver ? "battery-charging" : "battery-half"} size={18} className="text-foreground mr-2" />
            <View className="flex-1">
              <Label>{saver ? t.saverOn : t.saver}</Label>
            </View>
            <ControlField.Indicator />
          </ControlField>
          <Button variant="secondary" onPress={() => void setHomeHere()} isDisabled={busy !== null} accessibilityLabel={t.home}>
            <StyledIonicons name="home-outline" size={18} className="text-foreground" />
            <Button.Label>{busy === "home" ? "…" : `${t.home}${zones.length ? ` (${zones.length})` : ""}`}</Button.Label>
          </Button>
        </Surface>

        <View className="flex-row items-center justify-between">
          <LinkButton size="sm" hitSlop={12} onPress={() => void syncQueued().catch(() => undefined)}>
            <LinkButton.Label>{t.syncQueued}</LinkButton.Label>
          </LinkButton>
          <LinkButton size="sm" hitSlop={12} onPress={() => setHud(true)}>
            <LinkButton.Label className="font-bold">{t.rideHud}</LinkButton.Label>
          </LinkButton>
        </View>
        <Text className="text-muted text-right" style={{ fontSize: 11 }}>{t.attribution}</Text>
      </ScrollView>
    </View>
  );
}
