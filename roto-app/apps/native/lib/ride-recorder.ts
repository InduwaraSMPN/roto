import * as Location from "expo-location";
import * as Network from "expo-network";
import { DeviceMotion } from "expo-sensors";
import { useRef, useState } from "react";

import { enqueueRide } from "./ride-queue";
import { toGpx, type RouteResult } from "./routing";
import { startCrashWatch } from "./safety";

// ponytail: 10m GPS filter + local queue; server sync happens on stop when online
export function haversineKm(a: [number, number][], b: { latitude: number; longitude: number }): number {
  if (!a.length) return 0;
  const [lon1, lat1] = a[a.length - 1];
  const R = 6371;
  const dLat = ((b.latitude - lat1) * Math.PI) / 180;
  const dLon = ((b.longitude - lon1) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function useRideRecorder(
  onCrash: () => void,
  onLocation?: (lon: number, lat: number, heading: number, speedKmh: number) => void,
  opts?: { lowPower?: boolean },
) {
  const [recording, setRecording] = useState(false);
  const [km, setKm] = useState(0);
  const [elapsedMin, setElapsedMin] = useState(0);
  const [maxLean, setMaxLean] = useState(0);
  const coords = useRef<[number, number][]>([]);
  const startedAt = useRef(0);
  const leanPeak = useRef(0);
  const motionSub = useRef<{ remove: () => void } | null>(null);
  const sub = useRef<Location.LocationSubscription | null>(null);
  const stopCrash = useRef<(() => void) | null>(null);

  const start = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") throw new Error("location denied");
    coords.current = [];
    setKm(0);
    setElapsedMin(0);
    setMaxLean(0);
    leanPeak.current = 0;
    startedAt.current = Date.now();
    // ponytail: 1Hz roll sampling, peak only — corner graphs need map-matching later.
    // low-power: IMU off (GPS crash watch stays on — safety is never saver-gated)
    if (!opts?.lowPower) {
      try {
        DeviceMotion.setUpdateInterval(1000);
        motionSub.current = DeviceMotion.addListener((m) => {
          const g = Math.abs(((m.rotation?.gamma ?? 0) * 180) / Math.PI);
          if (g > leanPeak.current && g < 80) leanPeak.current = Math.round(g * 10) / 10;
        });
      } catch {
        // no IMU — lean stays 0
      }
    }
    stopCrash.current = startCrashWatch(onCrash);
    sub.current = await Location.watchPositionAsync(
      opts?.lowPower
        ? { accuracy: Location.Accuracy.Balanced, distanceInterval: 50 }
        : { accuracy: Location.Accuracy.High, distanceInterval: 10 },
      (loc) => {
        setKm((k) => k + haversineKm(coords.current, loc.coords));
        coords.current.push([loc.coords.longitude, loc.coords.latitude]);
        onLocation?.(loc.coords.longitude, loc.coords.latitude, loc.coords.heading ?? 0, (loc.coords.speed ?? 0) * 3.6);
      },
    );
    setRecording(true);
  };

  const stop = async (trim?: (c: [number, number][]) => [number, number][]): Promise<RouteResult & { id: string; maxLean: number }> => {
    sub.current?.remove();
    sub.current = null;
    motionSub.current?.remove();
    motionSub.current = null;
    stopCrash.current?.();
    stopCrash.current = null;
    setRecording(false);
    const min = (Date.now() - startedAt.current) / 60000;
    setElapsedMin(min);
    setMaxLean(leanPeak.current);
    const trimmed = trim ? trim(coords.current) : coords.current;
    const route: RouteResult = { coords: trimmed, km, min, engine: "gps" };
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    await enqueueRide({ id, name: `Ride ${new Date().toLocaleDateString()}`, distanceKm: km, maxLean: leanPeak.current, gpx: toGpx(route) });
    return { ...route, id, maxLean: leanPeak.current };
  };

  const online = async () => (await Network.getNetworkStateAsync().catch(() => null))?.isConnected ?? true;
  const avgKmh = elapsedMin > 0.05 ? km / (elapsedMin / 60) : 0;

  return { recording, km, elapsedMin, avgKmh, maxLean, start, stop, online };
}
