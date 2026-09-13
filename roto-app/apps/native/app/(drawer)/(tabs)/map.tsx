import { Camera, GeoJSONSource, Layer } from "@maplibre/maplibre-react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as Speech from "expo-speech";
import { Link } from "expo-router";
import { useToast, useThemeColor } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MotoMap } from "@/components/moto-map";
import { LANGS, speak, useLang } from "@/lib/i18n";
import { downloadLkRegion } from "@/lib/maps";
import { clearQueued, listQueued } from "@/lib/ride-queue";
import { haversineKm, useRideRecorder } from "@/lib/ride-recorder";
import type { RouteResult } from "@/lib/routing";
import { sosAlert } from "@/lib/safety";
import { authClient } from "@/lib/auth-client";
import { parseGpxTrack } from "@/lib/gpx";
import { insideAny, trimEnds, type Zone } from "@/lib/privacy";
import { fetchWx, type Wx } from "@/lib/weather";
import { queryClient, trpc } from "@/utils/trpc";

const COLOMBO: [number, number] = [79.8612, 6.9271];

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

  const crash = () => {
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

  const features = (poisQuery.data ?? []).map((p) => ({
    type: "Feature" as const,
    properties: { name: p.nameEn, kind: p.kind },
    geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
  }));
  const memberFeatures = (membersQuery.data ?? []).map((m) => ({
    type: "Feature" as const,
    properties: { name: m.name ?? "rider" },
    geometry: { type: "Point" as const, coordinates: [m.lon, m.lat] },
  }));

  const Btn = ({ onPress, color, children, grow = true }: { onPress: () => void; color: string; children: React.ReactNode; grow?: boolean }) => (
    <Pressable
      onPress={onPress}
      disabled={busy !== null}
      style={{ flex: grow ? 1 : undefined, backgroundColor: color, padding: 16, borderRadius: 14, alignItems: "center", opacity: busy !== null ? 0.6 : 1 }}
    >
      {children}
    </Pressable>
  );
  const BtnText = ({ children }: { children: React.ReactNode }) => (
    <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{children}</Text>
  );

  if (hud) {
    return (
      <Pressable onPress={() => setHud(false)} style={{ flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center", gap: 16, padding: 24, paddingTop: insets.top + 24 }}>
        <Text style={{ color: "#fff", fontSize: 64, fontWeight: "800" }}>{hudInfo.speed}</Text>
        <Text style={{ color: "#888", fontSize: 18 }}>km/h</Text>
        <Text style={{ color: "#4ade80", fontSize: 72, transform: [{ rotate: `${hudInfo.arrowDeg}deg` }] }}>▲</Text>
        <Text style={{ color: "#fff", fontSize: 22, textAlign: "center" }}>{hudInfo.instr || t.noRouteHud}</Text>
        <Text style={{ color: "#fcd34d", fontSize: 28, fontWeight: "700" }}>
          {hudInfo.distM > 950 ? `${(hudInfo.distM / 1000).toFixed(1)} km` : `${hudInfo.distM} m`}
        </Text>
        <Text style={{ color: "#555", marginTop: 24 }}>{t.tapExitHud}</Text>
      </Pressable>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <MotoMap>
        <Camera center={COLOMBO} zoom={12} />
        <GeoJSONSource id="pois" data={{ type: "FeatureCollection", features }}>
          <Layer id="poi-dots" source="pois" type="circle" paint={{ "circle-radius": 7, "circle-color": "#e11d48" }} />
          <Layer id="poi-labels" source="pois" type="symbol" layout={{ "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.2] }} />
        </GeoJSONSource>
        <GeoJSONSource id="members" data={{ type: "FeatureCollection", features: memberFeatures }}>
          <Layer id="member-dots" source="members" type="circle" paint={{ "circle-radius": 8, "circle-color": "#2563eb" }} />
          <Layer id="member-labels" source="members" type="symbol" layout={{ "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.2] }} />
        </GeoJSONSource>
        <GeoJSONSource
          id="route"
          data={{ type: "FeatureCollection", features: route ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.coords } }] : [] }}
        >
          <Layer id="route-line" source="route" type="line" paint={{ "line-color": "#e11d48", "line-width": 4 }} />
        </GeoJSONSource>
      </MotoMap>

      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: Math.max(28, insets.bottom + 78), gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
          {LANGS.map((l) => (
            <Pressable key={l.code} onPress={() => void setLang(l.code)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: lang === l.code ? "#1d4ed8" : "#334155" }}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>{l.label}</Text>
            </Pressable>
          ))}
        </View>

        {!session?.user ? (
          <Link href="/(drawer)" asChild>
            <Pressable style={{ backgroundColor: "#1e3a8a", padding: 12, borderRadius: 12, alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>{t.signInPrompt}</Text>
            </Pressable>
          </Link>
        ) : (
          <Text style={{ color: muted, textAlign: "center" }}>
            {session.user.email} · {(sosQuery.data ?? []).length} SOS
          </Text>
        )}

        <Text style={{ color: fg, fontSize: 18, textAlign: "center", fontWeight: "600" }}>
          {recording ? `${km.toFixed(1)} km · ${elapsedMin.toFixed(0)} min · ${avgKmh.toFixed(0)} km/h ● ${t.rec}` : maxLean > 0 ? `${t.lastRide} · ${t.maxLean} ${maxLean.toFixed(0)}°` : t.ready}
        </Text>
        {wx && (
          <Text style={{ color: "#fcd34d", textAlign: "center" }}>
            {wx.temp.toFixed(0)}°C · rain {wx.rain.toFixed(1)}mm · wind {wx.wind.toFixed(0)}km/h
          </Text>
        )}
        {route && (
          <Pressable onPress={() => setRoute(null)}>
            <Text style={{ color: "#fda4af", textAlign: "center" }}>
              {route.name} · {route.engine} · {route.km.toFixed(0)}km ✕
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => void toggle()}
          style={{ backgroundColor: recording ? "#dc2626" : "#16a34a", padding: 20, borderRadius: 16, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700" }}>{recording ? t.stop : t.startRide}</Text>
        </Pressable>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Btn onPress={() => void loop()} color="#065f46">
            <BtnText>{busy === "loop" ? "…" : t.loop}</BtnText>
          </Btn>
          <Btn onPress={() => void loadCurated()} color="#065f46">
            <BtnText>{busy === "routes" ? "…" : t.routes}</BtnText>
          </Btn>
          <Btn onPress={() => void importGpx()} color="#334155">
            <BtnText>{busy === "import" ? "…" : t.import}</BtnText>
          </Btn>
          <Btn onPress={() => void reportHazard()} color="#92400e">
            <BtnText>⚠</BtnText>
          </Btn>
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Btn onPress={() => void share()} color={groupId ? "#1d4ed8" : "#334155"}>
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
                style={{ flex: 1, backgroundColor: bg, borderWidth: 1, borderColor: muted, color: fg, padding: 14, borderRadius: 14, fontWeight: "700" }}
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
                style={{ backgroundColor: "#334155", padding: 16, borderRadius: 14 }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>{t.join}</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Btn onPress={() => crash()} color="#7f1d1d">
            <BtnText>{t.sos}</BtnText>
          </Btn>
          <Btn onPress={() => void run("offline", () => downloadLkRegion("colombo").then(() => {}), t.failedRoute)} color="#1e3a8a">
            <BtnText>{busy === "offline" ? "…" : t.offlineCmb}</BtnText>
          </Btn>
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Btn onPress={() => void flipSaver()} color={saver ? "#065f46" : "#334155"}>
            <BtnText>{saver ? t.saverOn : `🔋 ${t.saver}`}</BtnText>
          </Btn>
          <Btn onPress={() => void setHomeHere()} color="#334155">
            <BtnText>{busy === "home" ? "…" : `⌂ ${t.home}${zones.length ? ` (${zones.length})` : ""}`}</BtnText>
          </Btn>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Pressable onPress={() => void syncQueued().catch(() => undefined)}>
            <Text style={{ color: "#93c5fd" }}>{t.syncQueued}</Text>
          </Pressable>
          <Pressable onPress={() => setHud(true)}>
            <Text style={{ color: "#4ade80", fontWeight: "700" }}>{t.rideHud}</Text>
          </Pressable>
        </View>
        <Text style={{ color: muted, fontSize: 11, textAlign: "right" }}>{t.attribution}</Text>
      </View>
    </View>
  );
}
