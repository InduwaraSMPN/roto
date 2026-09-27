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
import { useToast, useThemeColor } from "heroui-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MotoMap } from "@/components/moto-map";
import { LANGS, speak, useLang } from "@/lib/i18n";
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

const Btn = memo(function Btn({ onPress, color, children, grow = true, label, hint, disabled }: { onPress: () => void; color: string; children: React.ReactNode; grow?: boolean; label?: string; hint?: string; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      style={{ flex: grow ? 1 : undefined, backgroundColor: color, padding: 16, borderRadius: ROTO.radius, alignItems: "center", justifyContent: "center", minHeight: 52, opacity: disabled ? 0.6 : 1 }}
    >
      {children}
    </Pressable>
  );
});
const BtnText = memo(function BtnText({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return <Text style={{ color: dark ? ROTO.signalInk : ROTO.white, fontSize: 16, fontWeight: "700" }}>{children}</Text>;
});

export default function RideMap() {
  const { lang, setLang, t } = useLang();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const bg = useThemeColor("background");
  const fg = useThemeColor("foreground");
  const muted = useThemeColor("muted");

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
  const pressScale = useSharedValue(1);
  useEffect(() => {
    const target = hudInfo.arrowDeg;
    let delta = ((target - arrowBase.current + 540) % 360) - 180;
    arrowBase.current += delta;
    arrowDeg.value = reduceMotion ? arrowBase.current : withSpring(arrowBase.current, { damping: 18, stiffness: 140 });
  }, [hudInfo.arrowDeg, arrowDeg, reduceMotion]);
  const arrowStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${arrowDeg.value}deg` }] }));
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));
  const pressIn = () => {
    pressScale.value = reduceMotion ? 1 : withSpring(0.95, { damping: 20, stiffness: 300 });
  };
  const pressOut = () => {
    pressScale.value = reduceMotion ? 1 : withSpring(1, { damping: 20, stiffness: 300 });
  };

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
    return (
      <Pressable onPress={() => setHud(false)} style={{ flex: 1, backgroundColor: ROTO.black, justifyContent: "center", alignItems: "center", gap: 16, padding: 24, paddingTop: insets.top + 24 }}>
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
    <View style={{ flex: 1, backgroundColor: bg }}>
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
        contentContainerStyle={{ padding: 16, paddingBottom: Math.max(28, insets.bottom + 78), gap: 12, maxWidth: 560, width: "100%", alignSelf: "center" }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
          {LANGS.map((l) => (
            <Pressable key={l.code} onPress={() => void setLang(l.code)} accessibilityRole="radio" accessibilityState={{ selected: lang === l.code }} style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, backgroundColor: lang === l.code ? ROTO.signal : ROTO.tar, minHeight: 44, justifyContent: "center" }}>
              <Text style={{ color: lang === l.code ? ROTO.signalInk : ROTO.white, fontWeight: "700" }}>{l.label}</Text>
            </Pressable>
          ))}
        </View>

        {!session?.user ? (
          <Link href="/(drawer)" asChild>
            <Pressable style={{ backgroundColor: ROTO.tar, borderWidth: 1, borderColor: ROTO.signal, padding: 14, borderRadius: ROTO.radius, alignItems: "center", minHeight: 52, justifyContent: "center" }}>
              <Text style={{ color: ROTO.white, fontWeight: "700" }}>{t.signInPrompt}</Text>
            </Pressable>
          </Link>
        ) : (
          <View>
            <Text style={{ color: fg, textAlign: "center", fontWeight: "600" }}>{session.user.email}</Text>
            <Text style={{ color: muted, textAlign: "center", fontSize: 13 }}>
              {(sosQuery.data ?? []).length} SOS contacts
            </Text>
          </View>
        )}

        <View style={{ alignItems: "center" }}>
          <Text maxFontSizeMultiplier={1.5} style={{ color: fg, fontSize: 44, textAlign: "center", ...numerals }}>
            {recording ? km.toFixed(1) : maxLean > 0 ? maxLean.toFixed(0) + "°" : "—"}
          </Text>
          <Text style={{ color: muted, textAlign: "center", fontSize: 13 }}>
            {recording ? `${elapsedMin.toFixed(0)} min, ${avgKmh.toFixed(0)} km/h` : maxLean > 0 ? `${t.lastRide} ${t.maxLean}` : t.ready}
          </Text>
          {recording && (
            <Text style={{ color: ROTO.danger, textAlign: "center", fontSize: 13, fontWeight: "700" }}>● {t.rec}</Text>
          )}
        </View>
        {wx && (
          <Text style={{ color: ROTO.signal, textAlign: "center" }}>
            {wx.temp.toFixed(0)}°C · {t.rainLabel} {wx.rain.toFixed(1)}mm · {t.windLabel} {wx.wind.toFixed(0)}km/h
          </Text>
        )}
        {route && (
          <Pressable onPress={() => setRoute(null)} hitSlop={12}>
            <Text style={{ color: fg, textAlign: "center", fontWeight: "600" }}>{route.name}</Text>
            <Text style={{ color: muted, textAlign: "center", fontSize: 13 }}>
              {route.engine} · {route.km.toFixed(0)}km · {t.dismiss}
            </Text>
          </Pressable>
        )}

        <Animated.View style={[{ flex: 1 }, pressStyle]}>
          <Pressable
            onPress={() => void toggle()}
            onPressIn={pressIn}
            onPressOut={pressOut}
            style={{
              backgroundColor: recording ? ROTO.danger : ROTO.signal,
              padding: 20,
              borderRadius: ROTO.radius,
              alignItems: "center",
              shadowColor: recording ? undefined : ROTO.signal,
              shadowOpacity: recording ? 0 : 0.35,
              shadowRadius: 18,
            }}
          >
            <Text style={{ color: recording ? ROTO.white : ROTO.signalInk, fontSize: 20, fontWeight: "800", letterSpacing: 1 }}>
              {recording ? t.stop : t.startRide}
            </Text>
          </Pressable>
        </Animated.View>

        <View style={{ gap: 8 }}>
          <Text style={{ color: fg, fontSize: 13, fontWeight: "800", letterSpacing: 1 }}>
            Plan
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Btn onPress={() => void loop()} disabled={busy !== null} color={ROTO.tar} label={t.loop}>
              <BtnText>{busy === "loop" ? "…" : t.loop}</BtnText>
            </Btn>
            <Btn onPress={() => void loadCurated()} disabled={busy !== null} color={ROTO.tar} label={t.routes}>
              <BtnText>{busy === "routes" ? "…" : t.routes}</BtnText>
            </Btn>
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Btn onPress={() => void importGpx()} disabled={busy !== null} color={ROTO.tar} label={t.import}>
              <BtnText>{busy === "import" ? "…" : t.import}</BtnText>
            </Btn>
            <Btn onPress={() => void reportHazard()} disabled={busy !== null} color={ROTO.tar} label={t.hazard}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="warning" size={18} color={ROTO.signal} />
                <BtnText>{t.hazard}</BtnText>
              </View>
            </Btn>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ color: fg, fontSize: 13, fontWeight: "800", letterSpacing: 1 }}>
            Group
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Btn
              onPress={() => void share()}
              disabled={busy !== null}
              color={groupId ? ROTO.live : ROTO.tar}
              label={t.shareLive}
            >
              <BtnText>{busy === "share" ? "…" : groupId ? `LIVE ${groupCode} (${memberFeatures.length})` : t.shareLive}</BtnText>
            </Btn>
            {!groupId && (
              <View style={{ flex: 1, flexDirection: "row", gap: 8, alignItems: "center" }}>
                <TextInput
                  value={joinCode}
                  onChangeText={setJoinCode}
                  placeholder={t.code}
                  autoCapitalize="characters"
                  maxLength={6}
                  placeholderTextColor={muted}
                  accessibilityLabel={t.code}
                  style={{ flex: 1, backgroundColor: bg, borderWidth: 1, borderColor: muted, color: fg, padding: 14, borderRadius: ROTO.radius, fontWeight: "700", minHeight: 52 }}
                />
                <Pressable
                  onPress={() =>
                    void joinGroup
                      .mutateAsync({ code: joinCode.trim().toUpperCase() })
                      .then((g) => {
                        setGroupId(g.id);
                        setGroupCode(joinCode.trim().toUpperCase());
                        setJoinCode("");
                      })
                      .catch(() => toast.show({ variant: "danger", label: t.failedJoin }))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={t.join}
                  style={{ backgroundColor: ROTO.tar, padding: 16, borderRadius: ROTO.radius, minHeight: 52, justifyContent: "center" }}
                >
                  <Text style={{ color: ROTO.white, fontWeight: "700" }}>{t.join}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ color: fg, fontSize: 13, fontWeight: "800", letterSpacing: 1 }}>
            Ride
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Btn onPress={() => crash()} disabled={busy !== null} color={ROTO.danger} label={t.sos}>
              <BtnText>{t.sos}</BtnText>
            </Btn>
            <Btn onPress={() => void run("offline", () => downloadLkRegion("colombo").then(() => {}), t.failedRoute)} disabled={busy !== null} color={ROTO.tar} label={t.offlineCmb}>
              <BtnText>{busy === "offline" ? "…" : t.offlineCmb}</BtnText>
            </Btn>
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <Btn onPress={() => void flipSaver()} disabled={busy !== null} color={saver ? ROTO.go : ROTO.tar} label={saver ? t.saverOn : t.saver}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name={saver ? "battery-charging" : "battery-half"} size={18} color={ROTO.white} />
                <BtnText>{saver ? t.saverOn : t.saver}</BtnText>
              </View>
            </Btn>
            <Btn onPress={() => void setHomeHere()} disabled={busy !== null} color={ROTO.tar} label={t.home}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="home-outline" size={18} color={ROTO.white} />
                <BtnText>{busy === "home" ? "…" : `${t.home}${zones.length ? ` (${zones.length})` : ""}`}</BtnText>
              </View>
            </Btn>
          </View>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Pressable onPress={() => void syncQueued().catch(() => undefined)} hitSlop={12}>
            <Text style={{ color: ROTO.sky }}>{t.syncQueued}</Text>
          </Pressable>
          <Pressable onPress={() => setHud(true)} hitSlop={12}>
            <Text style={{ color: ROTO.sky, fontWeight: "700" }}>{t.rideHud}</Text>
          </Pressable>
        </View>
        <Text style={{ color: muted, fontSize: 11, textAlign: "right" }}>{t.attribution}</Text>
      </ScrollView>
    </View>
  );
}
