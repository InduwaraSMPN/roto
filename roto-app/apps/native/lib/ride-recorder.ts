import * as Location from "expo-location";
import * as Network from "expo-network";
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

export function useRideRecorder(onCrash: () => void) {
  const [recording, setRecording] = useState(false);
  const [km, setKm] = useState(0);
  const coords = useRef<[number, number][]>([]);
  const sub = useRef<Location.LocationSubscription | null>(null);
  const stopCrash = useRef<(() => void) | null>(null);

  const start = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") throw new Error("location denied");
    coords.current = [];
    setKm(0);
    stopCrash.current = startCrashWatch(onCrash);
    sub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 10 },
      (loc) => {
        setKm((k) => k + haversineKm(coords.current, loc.coords));
        coords.current.push([loc.coords.longitude, loc.coords.latitude]);
      },
    );
    setRecording(true);
  };

  const stop = async (): Promise<RouteResult & { id: string }> => {
    sub.current?.remove();
    sub.current = null;
    stopCrash.current?.();
    stopCrash.current = null;
    setRecording(false);
    const route: RouteResult = { coords: coords.current, km, min: 0, engine: "gps" };
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    await enqueueRide({ id, name: `Ride ${new Date().toLocaleDateString()}`, distanceKm: km, gpx: toGpx(route) });
    return { ...route, id };
  };

  const online = async () => (await Network.getNetworkStateAsync().catch(() => null))?.isConnected ?? true;

  return { recording, km, start, stop, online };
}
