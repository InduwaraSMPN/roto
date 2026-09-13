import { Camera, GeoJSONSource, Layer } from "@maplibre/maplibre-react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";

import { MotoMap } from "@/components/moto-map";
import { speak, type Lang } from "@/lib/i18n";
import { downloadLkRegion } from "@/lib/maps";
import { clearQueued, listQueued } from "@/lib/ride-queue";
import { useRideRecorder } from "@/lib/ride-recorder";
import { sosAlert } from "@/lib/safety";
import { trpc } from "@/utils/trpc";

const COLOMBO: [number, number] = [79.8612, 6.9271];
const lang: Lang = "en";

export default function RideMap() {
  const poisQuery = useQuery(trpc.rides.pois.queryOptions({}));
  const sosQuery = useQuery(trpc.rides.sosList.queryOptions());
  const createRide = useMutation(trpc.rides.create.mutationOptions());

  const crash = () => {
    speak(lang, "crash");
    const phones = (sosQuery.data ?? []).map((c) => c.phone);
    void sosAlert(phones, "Roto SOS: rider may have crashed. Last location shared in app.");
  };
  const { recording, km, start, stop, online } = useRideRecorder(crash);

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
      </MotoMap>
      <View style={{ position: "absolute", bottom: 28, left: 16, right: 16, gap: 12 }}>
        <Text style={{ color: "#fff", fontSize: 18, textAlign: "center" }}>{recording ? `${km.toFixed(1)} km ● REC` : "Ready"}</Text>
        <Pressable
          onPress={() => void toggle()}
          style={{ backgroundColor: recording ? "#dc2626" : "#16a34a", padding: 20, borderRadius: 16, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700" }}>{recording ? "STOP" : "START RIDE"}</Text>
        </Pressable>
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
