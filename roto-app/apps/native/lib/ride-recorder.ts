import * as Location from "expo-location";
import * as Network from "expo-network";
import { DeviceMotion } from "expo-sensors";
import * as SecureStore from "expo-secure-store";
import { useRef, useState } from "react";

import type { LonLat, RideSample } from "@roto-app/core/types";
import { coordsToGpx } from "./gpx";
import {
  clearBufferedFixes,
  isBackgroundLocationAvailable,
  readBufferedFixes,
  RIDE_TASK,
  subscribeFixes,
  type RideFix,
} from "./location-task";
import { insideAny, trimEnds, type Zone } from "./privacy";
import { enqueueRide } from "./ride-queue";
import { CRASH_G_KEY, setCrashLowRate, startCrashWatch, updateCrashSpeed } from "./safety";

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

export type RecordedRide = {
  id: string;
  km: number;
  coords: LonLat[];
  gpx: string;
  samples: RideSample[];
  startedAt: number;
  endedAt: number;
  durationS: number;
  movingS: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  maxLean: number;
};

/** SecureStore flag: "0" disables auto-pause, anything else (default) enables it. */
export const AUTO_PAUSE_KEY = "roto-auto-pause";

const PAUSE_BELOW_MS = 1.5;
const RESUME_ABOVE_MS = 3;
const PAUSE_AFTER_MS = 15_000;

type NormFix = { lon: number; lat: number; speed: number | null; heading: number | null; t: number };

export function useRideRecorder(
  onCrash: () => void,
  onLocation?: (lon: number, lat: number, heading: number, speedKmh: number) => void,
  opts?: { lowPower?: boolean },
) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [background, setBackground] = useState(false);
  const [km, setKm] = useState(0);
  const [elapsedMin, setElapsedMin] = useState(0);
  const [maxLean, setMaxLean] = useState(0);
  const coords = useRef<[number, number][]>([]);
  const samples = useRef<RideSample[]>([]);
  const startedAt = useRef(0);
  const leanPeak = useRef(0);
  const motionSub = useRef<{ remove: () => void } | null>(null);
  const fgSub = useRef<Location.LocationSubscription | null>(null);
  const unsubFixes = useRef<(() => void) | null>(null);
  const stopCrash = useRef<(() => void) | null>(null);
  const pauseTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoPause = useRef(true);
  const isPaused = useRef(false);
  const stillSince = useRef(0);
  const lastFixAt = useRef(0);
  const lastSpeed = useRef(0);
  const kmRef = useRef(0);

  const setPausedBoth = (next: boolean) => {
    isPaused.current = next;
    setPaused(next);
    if (!next) stillSince.current = 0;
  };

  const handleFix = (fix: NormFix) => {
    lastFixAt.current = Date.now();
    lastSpeed.current = fix.speed ?? 0;
    const speedKmh = (fix.speed ?? 0) * 3.6;
    updateCrashSpeed(speedKmh);

    // Auto-pause (plan §4.10): speed < 1.5 m/s for 15 s pauses distance + moving time;
    // resumes above 3 m/s. Paused fixes still append coords/samples (spd ~ 0 keeps them out
    // of movingS naturally) so the samples/coords alignment that trimEnds relies on holds.
    if (autoPause.current && !isPaused.current && (fix.speed ?? 0) < PAUSE_BELOW_MS) {
      if (!stillSince.current) stillSince.current = Date.now();
      else if (Date.now() - stillSince.current > PAUSE_AFTER_MS) setPausedBoth(true);
    } else if ((fix.speed ?? 0) >= PAUSE_BELOW_MS) {
      stillSince.current = 0;
    }
    if (autoPause.current && isPaused.current && (fix.speed ?? 0) > RESUME_ABOVE_MS) {
      setPausedBoth(false);
    }

    if (!isPaused.current) {
      setKm((k) => k + haversineKm(coords.current, { latitude: fix.lat, longitude: fix.lon }));
      kmRef.current += haversineKm(coords.current, { latitude: fix.lat, longitude: fix.lon });
      coords.current.push([fix.lon, fix.lat]);
    } else {
      coords.current.push([fix.lon, fix.lat]);
    }
    samples.current.push({
      t: fix.t,
      lon: fix.lon,
      lat: fix.lat,
      spd: fix.speed ?? undefined,
      lean: leanPeak.current || undefined,
    });
    onLocation?.(fix.lon, fix.lat, fix.heading ?? 0, speedKmh);
  };

  // ponytail: foreground-first ordering doubles as the background-permission explanation flow —
  // the OS foreground dialog (with the app.json usage strings) always comes before the
  // background upgrade prompt, and a denial just means foreground-only recording, never an
  // error. A dedicated explainer screen can be added later without changing this contract.
  const ensureBackgroundPermission = async (): Promise<boolean> => {
    try {
      const current = await Location.getBackgroundPermissionsAsync();
      if (current.granted) return true;
      if (!current.canAskAgain) return false;
      const req = await Location.requestBackgroundPermissionsAsync();
      return req.granted;
    } catch {
      return false;
    }
  };

  const startRideTask = async (lowPower: boolean): Promise<void> => {
    if (!isBackgroundLocationAvailable()) throw new Error("background-unavailable");
    await Location.startLocationUpdatesAsync(RIDE_TASK, {
      accuracy: lowPower ? Location.Accuracy.Balanced : Location.Accuracy.High,
      distanceInterval: lowPower ? 50 : 10,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      foregroundService: {
        notificationTitle: "Roto is recording your ride",
        notificationBody: "GPS and crash watch stay on until you press STOP.",
        killServiceOnDestroy: false,
      },
    });
  };

  const start = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") throw new Error("location denied");
    const bgGranted = await ensureBackgroundPermission();
    coords.current = [];
    samples.current = [];
    kmRef.current = 0;
    setKm(0);
    setElapsedMin(0);
    setMaxLean(0);
    leanPeak.current = 0;
    stillSince.current = 0;
    lastFixAt.current = Date.now();
    lastSpeed.current = 0;
    setPausedBoth(false);
    startedAt.current = Date.now();
    autoPause.current = (await SecureStore.getItemAsync(AUTO_PAUSE_KEY).catch(() => null)) !== "0";
    const thresholdG = Number(await SecureStore.getItemAsync(CRASH_G_KEY).catch(() => null)) || 4;
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
    setCrashLowRate(opts?.lowPower ?? false);
    stopCrash.current = startCrashWatch(onCrash, thresholdG);
    await clearBufferedFixes();
    let useTask = false;
    if (bgGranted) {
      try {
        await startRideTask(opts?.lowPower ?? false);
        useTask = true;
      } catch {
        useTask = false;
      }
    }
    setBackground(useTask);
    if (useTask) {
      unsubFixes.current = subscribeFixes((fix: RideFix) =>
        handleFix({ lon: fix.lon, lat: fix.lat, speed: fix.speed, heading: fix.heading, t: fix.t }),
      );
    } else {
      // Foreground fallback (background permission denied, or expo-task-manager not installed
      // yet): same fix pipeline, dies with the screen off — the task path above is the upgrade.
      fgSub.current = await Location.watchPositionAsync(
        opts?.lowPower
          ? { accuracy: Location.Accuracy.Balanced, distanceInterval: 50 }
          : { accuracy: Location.Accuracy.High, distanceInterval: 10 },
        (loc) => {
          const { longitude, latitude, heading, speed } = loc.coords;
          handleFix({ lon: longitude, lat: latitude, speed, heading, t: loc.timestamp ?? Date.now() });
        },
      );
    }
    // No fixes at all for 15 s while apparently slow (tunnel, doze): pause on the timer too.
    pauseTimer.current = setInterval(() => {
      if (!autoPause.current || isPaused.current) return;
      if (Date.now() - lastFixAt.current > PAUSE_AFTER_MS && lastSpeed.current < PAUSE_BELOW_MS) {
        setPausedBoth(true);
      }
    }, 5000);
    setRecording(true);
  };

  // B12: the full ride (gpx/samples/times/stats) travels together — the old code only
  // returned coords/km and dropped everything else on the online stop path. Privacy zones
  // are trimmed here, on the device, before anything is queued or synced.
  const stop = async (zones?: Zone[]): Promise<RecordedRide> => {
    if (pauseTimer.current) clearInterval(pauseTimer.current);
    pauseTimer.current = null;
    unsubFixes.current?.();
    unsubFixes.current = null;
    if (await Location.hasStartedLocationUpdatesAsync(RIDE_TASK).catch(() => false)) {
      await Location.stopLocationUpdatesAsync(RIDE_TASK).catch(() => undefined);
    }
    fgSub.current?.remove();
    fgSub.current = null;
    motionSub.current?.remove();
    motionSub.current = null;
    stopCrash.current?.();
    stopCrash.current = null;
    setRecording(false);
    setPausedBoth(false);
    const endedAt = Date.now();
    const min = (endedAt - startedAt.current) / 60000;
    setElapsedMin(min);
    setMaxLean(leanPeak.current);

    // Killed-app recovery: merge task-buffered fixes newer than our last sample (dedupe by
    // timestamp — everything already seen via subscription is skipped). Pause state from
    // before the kill is unknowable, so recovered fixes count as moving when spd > 1.
    try {
      const buffered = await readBufferedFixes();
      const lastT = samples.current.length ? samples.current[samples.current.length - 1]?.t ?? 0 : 0;
      const fresh = buffered
        .filter((f) => f.t > lastT && f.t >= startedAt.current && f.t <= endedAt)
        .sort((a, b) => a.t - b.t);
      for (const f of fresh) {
        kmRef.current += haversineKm(coords.current, { latitude: f.lat, longitude: f.lon });
        coords.current.push([f.lon, f.lat]);
        samples.current.push({ t: f.t, lon: f.lon, lat: f.lat, spd: f.speed ?? undefined });
      }
      await clearBufferedFixes();
    } catch {
      // Recovery is best-effort; the subscribed samples are the ride.
    }

    let trimmedCoords: LonLat[] = coords.current;
    let trimmedSamples: RideSample[] = samples.current;
    if (zones?.length) {
      trimmedCoords = trimEnds(coords.current, zones);
      // Keep samples aligned with coords: drop the same number of leading/trailing
      // points that fell inside a privacy zone.
      const dropStart = coords.current.length - trimmedCoords.length > 0 ? coords.current.findIndex(([lon, lat]) => !insideAny(lon, lat, zones)) : 0;
      if (trimmedCoords.length === 0) {
        trimmedSamples = [];
      } else if (dropStart > 0 || trimmedCoords.length < coords.current.length) {
        const startIdx = Math.max(0, dropStart);
        trimmedSamples = samples.current.slice(startIdx, startIdx + trimmedCoords.length);
      }
    }

    const durationS = Math.max(0, Math.round((endedAt - startedAt.current) / 1000));
    let movingS = durationS;
    let maxSpeedKmh = 0;
    if (trimmedSamples.length > 1) {
      let movingMs = 0;
      for (let i = 1; i < trimmedSamples.length; i++) {
        const prev = trimmedSamples[i - 1];
        const cur = trimmedSamples[i];
        if (!prev || !cur) continue;
        const spd = cur.spd ?? 0;
        if (spd * 3.6 > maxSpeedKmh) maxSpeedKmh = spd * 3.6;
        if (spd > 1) movingMs += cur.t - prev.t;
      }
      const firstSpd = (trimmedSamples[0]?.spd ?? 0) * 3.6;
      if (firstSpd > maxSpeedKmh) maxSpeedKmh = firstSpd;
      if (movingMs > 0) movingS = Math.round(movingMs / 1000);
    }
    const hours = durationS / 3600;
    const avgSpeedKmh = hours > 0 ? kmRef.current / hours : 0;

    const name = `Ride ${new Date(startedAt.current).toLocaleDateString()}`;
    const gpx = coordsToGpx(trimmedCoords, name);
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    await enqueueRide({
      id,
      name,
      distanceKm: kmRef.current,
      gpx,
      samples: trimmedSamples,
      startedAt: startedAt.current,
      endedAt,
      durationS,
      movingS,
      maxSpeedKmh,
      avgSpeedKmh,
      maxLean: leanPeak.current,
    });
    return {
      id,
      km: kmRef.current,
      coords: trimmedCoords,
      gpx,
      samples: trimmedSamples,
      startedAt: startedAt.current,
      endedAt,
      durationS,
      movingS,
      maxSpeedKmh,
      avgSpeedKmh,
      maxLean: leanPeak.current,
    };
  };

  const online = async () => (await Network.getNetworkStateAsync().catch(() => null))?.isConnected ?? true;
  const avgKmh = elapsedMin > 0.05 ? km / (elapsedMin / 60) : 0;

  return { recording, paused, background, km, elapsedMin, avgKmh, maxLean, start, stop, online };
}
