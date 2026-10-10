import { bearing, haversineM, lineLengthKm } from "@roto-app/core/geo";
import { speakManeuver } from "@roto-app/core/maneuvers";
import { Camera, GeoJSONSource, Layer } from "@maplibre/maplibre-react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { File } from "expo-file-system";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
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

declare const require: any;

import { MotoMap } from "@/components/moto-map";
import { SosCountdownOverlay } from "@/components/safety/sos-countdown";
import { importRouteFile } from "@/lib/gpx";
import { interpolate, LANGS, useLang, type Lang } from "@/lib/i18n";
import { kvDelete, kvGet, kvSet } from "@/lib/kv";
import { downloadLkRegion } from "@/lib/maps";
import { clearQueued, enqueueRide, listQueued, type QueuedRide } from "@/lib/ride-queue";
import { AUTO_PAUSE_KEY, useRideRecorder } from "@/lib/ride-recorder";
import { ROTO, numerals } from "@/lib/roto-theme";
import type { RouteCapabilities, RouteResult } from "@/lib/routing";
import { sosFlow } from "@/lib/safety";
import { listLocalContacts } from "@/lib/sos-contacts";
import { useNavigation } from "@/lib/use-navigation";
import { authClient } from "@/lib/auth-client";
import { insideAny, trimEnds, type Zone } from "@/lib/privacy";
import { ensureVoice, hasPromptedVoiceDownload, markPromptedVoiceDownload, say } from "@/lib/voice";
import { fetchWx, type Wx } from "@/lib/weather";
import { queryClient, trpc } from "@/utils/trpc";

const COLOMBO: [number, number] = [79.8612, 6.9271];
const WEATHER_REFRESH_MS = 15 * 60 * 1000;
const GROUP_ID_KEY = "roto-group-id";
const GROUP_CODE_KEY = "roto-group-code";
const NO_CAPS: RouteCapabilities = { maneuvers: false, elevation: false, speedLimits: false, surface: false };

const StyledIonicons = withUniwind(Ionicons);

const SectionLabel = memo(function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-muted" style={{ fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>
      {children}
    </Text>
  );
});

type NamedRoute = RouteResult & { name: string };

export default function RideMap() {
  const { lang, setLang, t } = useLang();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();

  const poisQuery = useQuery(trpc.rides.pois.queryOptions({}));
  const { data: session } = authClient.useSession();
  const createRide = useMutation(trpc.rides.create.mutationOptions());
  const reportPoi = useMutation(trpc.rides.reportPoi.mutationOptions());
  const createGroup = useMutation(trpc.groups.create.mutationOptions());
  const joinGroup = useMutation(trpc.groups.join.mutationOptions());
  const leaveGroup = useMutation(trpc.groups.leave.mutationOptions());
  const pushPosition = useMutation(trpc.groups.updatePosition.mutationOptions());
  const setHome = useMutation(trpc.privacy.setHome.mutationOptions());
  const triggerSos = useMutation(trpc.safety.trigger.mutationOptions());
  const startTripMut = useMutation(trpc.safety.startTrip.mutationOptions());
  const pingTripMut = useMutation(trpc.safety.pingTrip.mutationOptions());
  const endTripMut = useMutation(trpc.safety.endTrip.mutationOptions());

  // Fresh closures for async callbacks (crash flow, trip pings) that outlive their render.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const tripRef = useRef<string | null>(null);
  const lastPingAt = useRef(0);

  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupCode, setGroupCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [route, setRoute] = useState<NamedRoute | null>(null);
  const [loopChoices, setLoopChoices] = useState<RouteResult[]>([]);
  const [loopChoiceIdx, setLoopChoiceIdx] = useState(0);
  const [sosContactCount, setSosContactCount] = useState(0);
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
    saverOverride.current = true;
    const next = !saver;
    setSaver(next);
    await SecureStore.setItemAsync("roto-saver", next ? "1" : "0").catch(() => undefined);
  };

  // §4.18: auto-saver below 20% when expo-battery is present; the manual toggle always wins
  // (override flag, so a deliberate choice survives the next battery poll). Crash watch and
  // SOS never read this flag — lib/safety.ts takes no saver input by design.
  const saverOverride = useRef(false);
  useEffect(() => {
    let battery: any = null;
    try {
      battery = require("expo-battery");
    } catch {
      battery = null;
    }
    if (!battery) return;
    let sub: { remove(): void } | null = null;
    (async () => {
      try {
        const level = await battery.getBatteryLevelAsync();
        if (level !== null && level < 0.2 && !saverOverride.current) {
          setSaver(true);
          await SecureStore.setItemAsync("roto-saver", "1").catch(() => undefined);
          toast.show({ variant: "warning", label: t.saverAuto });
        }
        sub = battery.addBatteryLevelListener?.(({ batteryLevel }: { batteryLevel: number }) => {
          if (saverOverride.current || batteryLevel >= 0.2) return;
          setSaver(true);
          void SecureStore.setItemAsync("roto-saver", "1").catch(() => undefined);
        }) ?? null;
      } catch {
        // Battery telemetry never breaks the ride screen.
      }
    })();
    return () => {
      try {
        sub?.remove();
      } catch {
        // Listener cleanup is best-effort.
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [autoPauseOn, setAutoPauseOn] = useState(true);
  useEffect(() => {
    SecureStore.getItemAsync(AUTO_PAUSE_KEY).then((v) => setAutoPauseOn(v !== "0")).catch(() => undefined);
  }, []);
  const flipAutoPause = async () => {
    const next = !autoPauseOn;
    setAutoPauseOn(next);
    await SecureStore.setItemAsync(AUTO_PAUSE_KEY, next ? "1" : "0").catch(() => undefined);
  };

  // SOS contacts are read from the local mirror (lib/sos-contacts.ts) so the count — and the
  // crash flow below — work offline and logged out, not just when `rides.sosList` answers.
  useEffect(() => {
    void listLocalContacts().then((c) => setSosContactCount(c.length));
  }, []);

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

  // B5/§4.12: crash and manual SOS run the 30 s countdown flow (overlay + voice), then the
  // server trigger when signed in, else the local SMS composer via the contacts mirror.
  // Never gated behind busy/saver/login — PRODUCT.md "Safety never sleeps".
  const crash = async (reason: "crash" | "manual") => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    const [lon, lat] = lastFix.current;
    const mapsUrl = `https://maps.google.com/?q=${lat},${lon}`;
    const result = await sosFlow({
      reason,
      lat,
      lon,
      tripToken: tripRef.current,
      fallbackText: interpolate(t.sosSmsText, { url: mapsUrl }),
      sendViaServer: sessionRef.current?.user ? (args) => triggerSos.mutateAsync(args) : undefined,
    }).catch(() => ({ status: "cancelled" }) as const);
    if (result.status === "no-contacts") toast.show({ variant: "warning", label: t.noContactsForTest });
  };

  // Turn-by-turn follow: `route.maneuvers` (core `Maneuver[]`) references coords by index
  // (`beginIdx`), not lon/lat directly — fixes the old code's dependence on a bespoke `steps`
  // field that no longer exists on the shared `RouteResult` (map.tsx:196 in the stream A handoff
  // note). Falls back to just updating the HUD speed for routes with no maneuvers (curated/GPX).
  const follow = (lon: number, lat: number, heading: number, speed: number) => {
    const maneuvers = route?.maneuvers;
    const coords = route?.coords;
    const m = maneuvers && coords && announced.current < maneuvers.length ? maneuvers[announced.current] : undefined;
    const target = m && coords ? coords[m.beginIdx] : undefined;
    if (m && target) {
      const distM = haversineM(lon, lat, target[0], target[1]);
      const text = speakManeuver(m, lang, distM);
      setHudInfo({
        instr: m.instruction || text,
        distM: Math.round(distM),
        arrowDeg: Math.round(bearing(lon, lat, target[0], target[1]) - heading),
        speed: Math.round(speed),
      });
      if (distM < 120) {
        announced.current += 1;
        say(text, lang);
      }
    } else {
      setHudInfo((h) => ({ ...h, speed: Math.round(speed) }));
    }
  };

  // Turn-by-turn navigator (§4.3): drives the HUD, voice, reroute, car mirror and remotes
  // for the active route. follow() below stays the fallback lane for fixes the navigator
  // doesn't own (no route, or compass-only routes it already mirrors via onHud).
  const nav = useNavigation({
    route,
    lang,
    enabled: true,
    curvy: 0.7,
    onHud: (h) => setHudInfo(h),
    onRouteUpdate: (fresh) => {
      announced.current = 0;
      setLoopChoices([]);
      setRoute((prev) => ({ ...fresh, name: prev?.name ?? t.loop }));
    },
    onSos: () => void crash("manual"),
    onToggleHud: () => setHud((h) => !h),
    onHazard: () => void reportHazard(),
  });
  const navRef = useRef(nav);
  navRef.current = nav;
  const navActive = nav.navigating && (route?.maneuvers?.length ?? 0) > 0;
  const navActiveRef = useRef(navActive);
  navActiveRef.current = navActive;

  // Navigation follows the active route; clearing the route stops it.
  useEffect(() => {
    if (route) nav.start(route.name);
    else nav.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  const { recording, km, elapsedMin, avgKmh, maxLean, start, stop, online } = useRideRecorder(
    () => void crash("crash"),
    (lon, lat, heading, speedKmh) => {
      lastFix.current = [lon, lat];
      if (groupId && !insideAny(lon, lat, zones)) pushPosition.mutate({ groupId, lon, lat, heading, speed: speedKmh });
      // Live-trip pings while riding (§4.12): throttled, and never from inside a privacy zone.
      if (tripRef.current && !insideAny(lon, lat, zones) && Date.now() - lastPingAt.current > 10_000) {
        lastPingAt.current = Date.now();
        pingTripMut.mutate({ token: tripRef.current, lat, lon, speed: speedKmh / 3.6, heading });
      }
      // Navigator owns the fix when it is actively guiding; legacy follow() stays the fallback.
      if (navActiveRef.current) navRef.current.update({ lon, lat, heading, speedKmh });
      else follow(lon, lat, heading, speedKmh);
    },
    { lowPower: saver },
  );

  // B10: weather comes from the rider's own fix, not a hardcoded Colombo point, and refreshes
  // every 15 minutes while recording instead of once on mount.
  const refreshWeather = async () => {
    const [lon, lat] = lastFix.current;
    const w = await fetchWx(lat, lon);
    setWx(w);
    if (w && w.rain > 2 && !rainWarned.current) {
      rainWarned.current = true;
      say(t.rain, lang);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.granted) {
          const last = await Location.getLastKnownPositionAsync().catch(() => null);
          const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }).catch(() => null));
          if (pos && !cancelled) lastFix.current = [pos.coords.longitude, pos.coords.latitude];
        }
      } catch {
        // No permission yet / location unavailable — weather falls back to the Colombo default.
      }
      if (!cancelled) await refreshWeather();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => void refreshWeather(), WEATHER_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  // One-time "download voice" prompt (plan §3.5) — checked whenever the app language changes to
  // si/ta and the device has no matching TTS voice installed.
  useEffect(() => {
    if (lang === "en") return;
    let cancelled = false;
    (async () => {
      const status = await ensureVoice(lang);
      if (cancelled || status !== "missing") return;
      if (await hasPromptedVoiceDownload(lang)) return;
      await markPromptedVoiceDownload(lang);
      const label = LANGS.find((l) => l.code === lang)?.label ?? lang;
      toast.show({
        variant: "warning",
        label: interpolate(t.voiceDownloadTitle, { lang: label }),
        description: interpolate(t.voiceDownloadBody, { lang: label }),
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // B11: restore an active group from local kv on mount, then reconcile against the server
  // (`groups.mine`) once signed in — e.g. a fresh install on a second device.
  useEffect(() => {
    (async () => {
      const savedId = await kvGet(GROUP_ID_KEY);
      const savedCode = await kvGet(GROUP_CODE_KEY);
      if (savedId && savedCode) {
        setGroupId(savedId);
        setGroupCode(savedCode);
      }
    })();
  }, []);

  const groupsMineQuery = useQuery({ ...trpc.groups.mine.queryOptions(), enabled: !!session?.user });
  useEffect(() => {
    if (groupId || !groupsMineQuery.data?.length) return;
    const g = groupsMineQuery.data[0];
    if (!g) return;
    setGroupId(g.id);
    setGroupCode(g.code);
    void kvSet(GROUP_ID_KEY, g.id);
    void kvSet(GROUP_CODE_KEY, g.code);
  }, [groupsMineQuery.data, groupId]);

  // B11: broadcast position via a lightweight foreground watch whenever a group is active, even
  // when not recording. (A background version needs the Phase 1 location task — plan §4.10.)
  useEffect(() => {
    if (!groupId || !session?.user || recording) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted || cancelled) return;
      sub = await Location.watchPositionAsync(
        saver
          ? { accuracy: Location.Accuracy.Balanced, timeInterval: 30000, distanceInterval: 30 }
          : { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 15 },
        (loc) => {
          const { longitude, latitude, heading, speed, accuracy } = loc.coords;
          lastFix.current = [longitude, latitude];
          if (!insideAny(longitude, latitude, zones)) {
            pushPosition.mutate({
              groupId,
              lon: longitude,
              lat: latitude,
              heading: heading ?? undefined,
              speed: speed ?? undefined,
              accuracyM: accuracy ?? undefined,
            });
          }
        },
      );
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, recording, session?.user, saver]);

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

  // B12: one sync path for a queued ride, used both right after stopping (online) and by the
  // bulk "sync queued rides" action — both used to build separate, drifting `createRide` payloads
  // (the online path silently dropped gpx/samples/startedAt/endedAt/stats entirely).
  const syncRide = (q: QueuedRide) =>
    createRide.mutateAsync({
      name: q.name,
      distanceKm: q.distanceKm,
      maxLeanDeg: q.maxLean ?? undefined,
      gpx: q.gpx ?? undefined,
      samples: q.samples ?? undefined,
      startedAt: q.startedAt ? new Date(q.startedAt).toISOString() : undefined,
      endedAt: q.endedAt ? new Date(q.endedAt).toISOString() : undefined,
      durationS: q.durationS ?? undefined,
      movingS: q.movingS ?? undefined,
      maxSpeedKmh: q.maxSpeedKmh ?? undefined,
      avgSpeedKmh: q.avgSpeedKmh ?? undefined,
      elevationGainM: q.elevationGainM ?? undefined,
      elevationLossM: q.elevationLossM ?? undefined,
    });

  const toggle = async () => {
    void Haptics.selectionAsync().catch(() => undefined);
    if (recording) {
      const r = await stop(zones);
      // End the live trip (§4.12) — best-effort, never blocks the stop path.
      if (tripRef.current) {
        endTripMut.mutate({ token: tripRef.current });
        tripRef.current = null;
      }
      if (await online()) {
        try {
          await syncRide({
            id: r.id,
            name: `Ride ${new Date(r.startedAt).toLocaleDateString()}`,
            distanceKm: r.km,
            gpx: r.gpx,
            samples: r.samples,
            startedAt: r.startedAt,
            endedAt: r.endedAt,
            durationS: r.durationS,
            movingS: r.movingS,
            maxSpeedKmh: r.maxSpeedKmh,
            avgSpeedKmh: r.avgSpeedKmh,
            maxLean: r.maxLean,
            elevationGainM: null,
            elevationLossM: null,
          });
          await clearQueued([r.id]);
        } catch {
          // stays queued, syncs next stop / manual sync
        }
      }
    } else {
      await start().catch(() => toast.show({ variant: "danger", label: t.failedRoute }));
      // Live trip for SOS links (§4.12): best-effort, signed-in only, never blocks recording.
      if (sessionRef.current?.user) {
        const [lon, lat] = lastFix.current;
        startTripMut.mutate(
          { reason: "manual", lat, lon },
          { onSuccess: (res) => { tripRef.current = res.token; } },
        );
      }
    }
  };

  const loop = () =>
    run("loop", async () => {
      const [lon, lat] = lastFix.current;
      const { best, alternatives } = await queryClient.fetchQuery(
        trpc.route.roundTrip.queryOptions({ center: { lat, lon }, km: 60, curvy: 0.7 }),
      );
      const choices = [best, ...alternatives];
      setLoopChoices(choices);
      setLoopChoiceIdx(0);
      announced.current = 0;
      setRoute({ ...best, name: t.loop });
    }, t.failedRoute);

  const shuffleLoop = () => {
    if (loopChoices.length < 2) return;
    const next = (loopChoiceIdx + 1) % loopChoices.length;
    const choice = loopChoices[next];
    if (!choice) return;
    setLoopChoiceIdx(next);
    announced.current = 0;
    setRoute({ ...choice, name: t.loop });
  };

  const loadCurated = () =>
    run("routes", async () => {
      // curated.list is cursor-paginated (§4.9): {items, nextCursor}.
      const list = (await queryClient.fetchQuery(trpc.curated.list.queryOptions({}))).items;
      if (!list.length) throw new Error("empty");
      const pick = list[curatedIdx.current % list.length];
      curatedIdx.current += 1;
      if (!pick) throw new Error("empty");
      const full = await queryClient.fetchQuery(trpc.curated.get.queryOptions({ id: pick.id }));
      announced.current = 0;
      setLoopChoices([]);
      setRoute({
        coords: full.coords as [number, number][],
        km: full.distanceKm,
        min: 0,
        engine: "brouter",
        maneuvers: [],
        capabilities: NO_CAPS,
        name: full.nameEn,
      });
    }, t.failedRoute);

  // Task 4: imports now go through @roto-app/core's `importRouteFile` (GPX/KML/KMZ/ITN/TCX) via
  // the new expo-file-system `File` API, replacing the old regex-only `parseGpxTrack` +
  // `readAsStringAsync` (tracks only, GPX only).
  const importGpx = () =>
    run("import", async () => {
      const picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true }).catch(() => null);
      const asset = picked && !picked.canceled ? picked.assets?.[0] : null;
      if (!asset?.uri) return;
      const bytes = await new File(asset.uri).bytes();
      const imported = await importRouteFile(asset.name ?? "import.gpx", bytes);
      const coords = imported.tracks[0] ?? imported.routes[0];
      if (!coords || coords.length < 2) throw new Error("empty");
      announced.current = 0;
      setLoopChoices([]);
      setRoute({ coords, km: lineLengthKm(coords), min: 0, engine: "gps", maneuvers: [], capabilities: NO_CAPS, name: t.import });
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
      if (!session?.user) throw new Error("login");
      const g = await createGroup.mutateAsync({ name: `Ride ${new Date().toLocaleDateString()}` });
      setGroupId(g.id);
      setGroupCode(g.code);
      await kvSet(GROUP_ID_KEY, g.id);
      await kvSet(GROUP_CODE_KEY, g.code);
    }, t.loginNeeded);

  // B11: leaving now actually tells the server (`groups.leave`) instead of only clearing local
  // state — the old code just called `setGroupId(null)`, leaving a phantom member row behind.
  const leave = () =>
    run("leave", async () => {
      if (!groupId) return;
      await leaveGroup.mutateAsync({ groupId });
      setGroupId(null);
      setGroupCode(null);
      await kvDelete(GROUP_ID_KEY);
      await kvDelete(GROUP_CODE_KEY);
    }, t.failedRoute);

  const join = () =>
    run("join", async () => {
      const g = await joinGroup.mutateAsync({ code: joinCode.trim().toUpperCase() });
      setGroupId(g.id);
      setGroupCode(g.code);
      await kvSet(GROUP_ID_KEY, g.id);
      await kvSet(GROUP_CODE_KEY, g.code);
      setJoinCode("");
    }, t.failedJoin);

  const syncQueued = async () => {
    if (!(await online())) return 0;
    const queued = await listQueued();
    const done: string[] = [];
    for (const q of queued) {
      try {
        await syncRide(q);
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
          {/* ponytail: the offline pack holds every OSM POI in the viewport, so drawing them all at
              the default zoom buried the map under thousands of rings. Gate them by zoom instead of
              ranking them, which needs no new sync data. */}
          <Layer id="poi-dots" source="pois" type="circle" minzoom={13} paint={{ "circle-radius": 5, "circle-color": ROTO.parchment, "circle-stroke-color": ROTO.signal, "circle-stroke-width": 1.5 }} />
          <Layer id="poi-labels" source="pois" type="symbol" minzoom={15} layout={{ "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.2] }} />
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
          <Tabs.List accessibilityLabel={t.languageField}>
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
          <Text className="text-foreground text-center font-semibold">{session.user.email}</Text>
        )}
        <Link href="/(drawer)/safety" asChild>
          <LinkButton size="sm" className="self-center">
            <LinkButton.Label>
              {sosContactCount > 0 ? interpolate(t.sosContactsCount, { count: sosContactCount }) : t.sosContactsLink}
            </LinkButton.Label>
          </LinkButton>
        </Link>

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
            {loopChoices.length > 1 && (
              <Button size="sm" variant="secondary" onPress={shuffleLoop} accessibilityLabel={t.shuffle}>
                <StyledIonicons name="shuffle" size={14} className="text-foreground" />
                <Button.Label>{t.shuffle}</Button.Label>
              </Button>
            )}
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
          <Button size="lg" variant="danger" onPress={() => void crash("manual")} accessibilityLabel={t.sos}>
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
            <View className="flex-row items-center gap-2">
              <Chip
                size="lg"
                accessibilityLabel={t.shareLive}
                style={{ backgroundColor: ROTO.live }}
                className="flex-1 self-start"
              >
                <Chip.Label style={{ color: ROTO.white }} className="font-extrabold">
                  {interpolate(t.liveGroupBadge, {
                    code: groupCode ?? "",
                    count: memberFeatures.length,
                  })}
                </Chip.Label>
              </Chip>
              <Button variant="danger-soft" onPress={() => void leave()} isDisabled={busy !== null} accessibilityLabel={t.leaveGroup}>
                <Button.Label>{busy === "leave" ? "…" : t.leaveGroup}</Button.Label>
              </Button>
            </View>
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
          <ControlField isSelected={autoPauseOn} onSelectedChange={() => void flipAutoPause()} isDisabled={busy !== null}>
            <StyledIonicons name="pause-circle-outline" size={18} className="text-foreground mr-2" />
            <View className="flex-1">
              <Label>{t.autoPause}</Label>
            </View>
            <ControlField.Indicator />
          </ControlField>
          <Button variant="secondary" onPress={() => void setHomeHere()} isDisabled={busy !== null} accessibilityLabel={t.home}>
            <StyledIonicons name="home-outline" size={18} className="text-foreground" />
            <Button.Label>{busy === "home" ? "…" : `${t.home}${zones.length ? ` (${zones.length})` : ""}`}</Button.Label>
          </Button>
        </Surface>

        <View className="flex-row items-center justify-between">
          <LinkButton
            size="sm"
            hitSlop={12}
            onPress={() =>
              void syncQueued()
                .then(() => void listLocalContacts().then((c) => setSosContactCount(c.length)))
                .catch(() => undefined)
            }
          >
            <LinkButton.Label>{t.syncQueued}</LinkButton.Label>
          </LinkButton>
          <LinkButton size="sm" hitSlop={12} onPress={() => setHud(true)}>
            <LinkButton.Label className="font-bold">{t.rideHud}</LinkButton.Label>
          </LinkButton>
        </View>
        <Text className="text-muted text-right" style={{ fontSize: 11 }}>{t.attribution}</Text>
      </ScrollView>
      <SosCountdownOverlay />
    </View>
  );
}
