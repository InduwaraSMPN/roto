import { Camera, GeoJSONSource, Layer } from "@maplibre/maplibre-react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { Link } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { MotoMap } from "@/components/moto-map";
import { speak, type Lang } from "@/lib/i18n";
import { downloadLkRegion } from "@/lib/maps";
import { clearQueued, listQueued } from "@/lib/ride-queue";
import { haversineKm, useRideRecorder } from "@/lib/ride-recorder";
import type { RouteResult } from "@/lib/routing";
import { sosAlert } from "@/lib/safety";
import { authClient } from "@/lib/auth-client";
import { parseGpxTrack } from "@/lib/gpx";
import { fetchWx, type Wx } from "@/lib/weather";
import { queryClient, trpc } from "@/utils/trpc";

const COLOMBO: [number, number] = [79.8612, 6.9271];
const lang: Lang = "en";

export default function RideMap() {
  const poisQuery = useQuery(trpc.rides.pois.queryOptions({}));
  const { data: session } = authClient.useSession();
  const sosQuery = useQuery({ ...trpc.rides.sosList.queryOptions(), enabled: !!session?.user });
  const createRide = useMutation(trpc.rides.create.mutationOptions());
  const reportPoi = useMutation(trpc.rides.reportPoi.mutationOptions());
  const [route, setRoute] = useState<(RouteResult & { name: string }) | null>(null);
  const [wx, setWx] = useState<Wx | null>(null);
  const lastFix = useRef<[number, number]>(COLOMBO);
  const announced = useRef(0);
  const rainWarned = useRef(false);
  const createGroup = useMutation(trpc.groups.create.mutationOptions());
  const joinGroup = useMutation(trpc.groups.join.mutationOptions());
  const pushPosition = useMutation(trpc.groups.updatePosition.mutationOptions());
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupCode, setGroupCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const sharing = !!groupId && !!session?.user;
  const membersQuery = useQuery({
    ...trpc.groups.members.queryOptions({ groupId: groupId ?? "" }),
    enabled: sharing,
    refetchInterval: sharing ? 5000 : false,
  });

  const crash = () => {
    speak(lang, "crash");
    const phones = (sosQuery.data ?? []).map((c) => c.phone);
    void sosAlert(phones, "Roto SOS: rider may have crashed. Last location shared in app.");
  };
  // ponytail: next unannounced step within 120m → speak once; off-route ignored v1
  const follow = (lon: number, lat: number) => {
    const steps = route?.steps;
    if (!steps?.length || announced.current >= steps.length) return;
    const s = steps[announced.current];
    if (!s) return;
    const d = haversineKm([[s.lon, s.lat]], { latitude: lat, longitude: lon });
    if (d < 0.12) {
      announced.current += 1;
      Speech.speak(s.instruction, { language: "en-LK" });
    }
  };

  const { recording, km, elapsedMin, avgKmh, start, stop, online } = useRideRecorder(crash, (lon, lat) => {
    lastFix.current = [lon, lat];
    if (groupId) pushPosition.mutate({ groupId, lon, lat });
    follow(lon, lat);
  });

  useEffect(() => {
    fetchWx(COLOMBO[1], COLOMBO[0]).then((w) => {
      setWx(w);
      if (w && w.rain > 2 && !rainWarned.current) {
        rainWarned.current = true;
        speak(lang, "rain");
      }
    });
  }, []);

  const loop = async () => {
    const [lon, lat] = lastFix.current;
    try {
      const r = await queryClient.fetchQuery(
        trpc.route.roundTrip.queryOptions({ center: { lat, lon }, km: 60, curvy: 0.7 }),
      );
      announced.current = 0;
      setRoute({ ...r, name: "Loop 60km" });
    } catch {
      // offline or logged out of nothing — roundTrip is public; offline keeps old route
    }
  };

  const importGpx = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true }).catch(() => null);
    const uri = picked && picked.assets?.[0]?.uri;
    if (!uri) return;
    try {
      const xml = await FileSystem.readAsStringAsync(uri);
      const coords = parseGpxTrack(xml);
      if (coords.length < 2) return;
      let km = 0;
      for (let i = 1; i < coords.length; i++) km += haversineKm([coords[i - 1]], { latitude: coords[i][1], longitude: coords[i][0] });
      announced.current = 0;
      setRoute({ coords, km, min: 0, engine: "gpx", name: "Imported GPX" });
    } catch {
      // unreadable file — ignore
    }
  };

  const reportHazard = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({});
      await reportPoi.mutateAsync({ kind: "hazard", name: "Hazard report", lat: loc.coords.latitude, lon: loc.coords.longitude });
      poisQuery.refetch();
    } catch {
      // logged out or no fix — ignore
    }
  };

  const share = async () => {
    if (groupId) {
      setGroupId(null);
      return;
    }
    const g = await createGroup.mutateAsync({ name: `Ride ${new Date().toLocaleDateString()}` }).catch(() => null);
    if (g) {
      setGroupId(g.id);
      setGroupCode(g.code);
    }
  };

  const syncQueued = async () => {
    if (!(await online())) return 0;
    const queued = await listQueued();
    const done: string[] = [];
    for (const q of queued) {
      try {
        await createRide.mutateAsync({ name: q.name, distanceKm: q.distanceKm, gpx: q.gpx ?? undefined });
        done.push(q.id);
      } catch {
        break;
      }
    }
    await clearQueued(done);
    return done.length;
  };

  const toggle = async () => {
    if (recording) {
      const r = await stop();
      if (await online()) {
        try {
          await createRide.mutateAsync({ name: `Ride ${new Date().toLocaleDateString()}`, distanceKm: r.km, gpx: undefined });
          await clearQueued([r.id]);
        } catch {
          // stays queued, syncs next stop
        }
      }
    } else {
      await start().catch(() => undefined);
    }
  };

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

  return (
    <View style={{ flex: 1 }}>
      <MotoMap>
        <Camera center={COLOMBO} zoom={12} />
        <GeoJSONSource id="pois" data={{ type: "FeatureCollection", features }}>
          <Layer id="poi-dots" source="pois" type="circle" paint={{ "circle-radius": 7, "circle-color": "#e11d48" }} />
          <Layer
            id="poi-labels"
            source="pois"
            type="symbol"
            layout={{ "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.2] }}
          />
        </GeoJSONSource>
        <GeoJSONSource id="members" data={{ type: "FeatureCollection", features: memberFeatures }}>
          <Layer id="member-dots" source="members" type="circle" paint={{ "circle-radius": 8, "circle-color": "#2563eb" }} />
          <Layer
            id="member-labels"
            source="members"
            type="symbol"
            layout={{ "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.2] }}
          />
        </GeoJSONSource>
        <GeoJSONSource id="route" data={{ type: "FeatureCollection", features: route ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.coords } }] : [] }}>
          <Layer id="route-line" source="route" type="line" paint={{ "line-color": "#e11d48", "line-width": 4 }} />
        </GeoJSONSource>
      </MotoMap>
      <View style={{ position: "absolute", bottom: 28, left: 16, right: 16, gap: 12 }}>
        {!session?.user ? (
          <Link href="/(drawer)" asChild>
            <Pressable style={{ backgroundColor: "#1e3a8a", padding: 12, borderRadius: 12, alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>Sign in on Home for sync + SOS contacts</Text>
            </Pressable>
          </Link>
        ) : (
          <Text style={{ color: "#93c5fd", textAlign: "center" }}>
            {session.user.email} · {(sosQuery.data ?? []).length} SOS contacts
          </Text>
        )}
        <Text style={{ color: "#fff", fontSize: 18, textAlign: "center" }}>
          {recording ? `${km.toFixed(1)} km · ${elapsedMin.toFixed(0)} min · ${avgKmh.toFixed(0)} km/h ● REC` : "Ready"}
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
          <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700" }}>{recording ? "STOP" : "START RIDE"}</Text>
        </Pressable>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable
            onPress={() => void share().catch(() => undefined)}
            style={{ flex: 1, backgroundColor: groupId ? "#1d4ed8" : "#334155", padding: 16, borderRadius: 14, alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
              {groupId ? `LIVE ${groupCode} (${memberFeatures.length})` : "SHARE LIVE"}
            </Text>
          </Pressable>
          {!groupId && (
            <View style={{ flex: 1, flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TextInput
                value={joinCode}
                onChangeText={setJoinCode}
                placeholder="CODE"
                autoCapitalize="characters"
                maxLength={6}
                style={{ flex: 1, backgroundColor: "#fff", padding: 14, borderRadius: 14, fontWeight: "700" }}
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
                    .catch(() => undefined)
                }
                style={{ backgroundColor: "#334155", padding: 16, borderRadius: 14 }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>JOIN</Text>
              </Pressable>
            </View>
          )}
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable
            onPress={() => void loop().catch(() => undefined)}
            style={{ flex: 1, backgroundColor: "#065f46", padding: 16, borderRadius: 14, alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>LOOP 60</Text>
          </Pressable>
          <Pressable
            onPress={() => void importGpx().catch(() => undefined)}
            style={{ flex: 1, backgroundColor: "#334155", padding: 16, borderRadius: 14, alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>IMPORT</Text>
          </Pressable>
          <Pressable
            onPress={() => void reportHazard().catch(() => undefined)}
            style={{ flex: 1, backgroundColor: "#92400e", padding: 16, borderRadius: 14, alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>⚠ HAZARD</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable
            onPress={() => crash()}
            style={{ flex: 1, backgroundColor: "#7f1d1d", padding: 16, borderRadius: 14, alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>SOS 119</Text>
          </Pressable>
          <Pressable
            onPress={() => void downloadLkRegion("colombo").catch(() => undefined)}
            style={{ flex: 1, backgroundColor: "#1e3a8a", padding: 16, borderRadius: 14, alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>OFFLINE CMB</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => void syncQueued().catch(() => undefined)}>
          <Text style={{ color: "#93c5fd", textAlign: "center" }}>Sync queued rides</Text>
        </Pressable>
      </View>
    </View>
  );
}
