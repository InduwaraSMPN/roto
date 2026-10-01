// Turn-by-turn navigation engine wiring (plan §4.3) + car/remote outputs (§4.5, §4.18).
//
// The pure state machine (progress, off-route, announce thresholds) lives here in the hook;
// geometry comes from @roto-app/core (nearestOnLine, upcomingCurves, speakManeuver). Voice goes
// through lib/voice.ts so si/ta fall back when the device lacks those voices. Reroute uses
// `route.reroute` with heading (debounced 15 s); offline it degrades to a "return to route"
// arrow until the network is back.
//
// Side outputs, all guarded: roto-car trip pushes (maneuver text plus the remaining polyline, so
// the head unit can draw its map surface) when a head unit is connected, media-key mapping when the
// module is available, keep-awake only while navigating (never while pocket-recording — that is
// ride-recorder's domain and it stays dark).
import * as Network from "expo-network";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useCallback, useEffect, useRef, useState } from "react";

import { bearing, haversineM, lineLengthKm, nearestOnLine } from "@roto-app/core/geo";
import { upcomingCurves } from "@roto-app/core/curvature";
import { speakManeuver } from "@roto-app/core/maneuvers";
import type { LonLat, Maneuver } from "@roto-app/core/types";

import RotoCar from "@/modules/roto-car";
import RotoMediaKeys from "@/modules/roto-media-keys";
import { interpolate, STR, type Lang } from "@/lib/i18n";
import type { RouteResult } from "@/lib/routing";
import { say } from "@/lib/voice";
import { queryClient, trpc } from "@/utils/trpc";

export type NavRoute = {
  coords: LonLat[];
  maneuvers: Maneuver[];
  km: number;
  min: number;
  name?: string;
};

export type NavFix = { lon: number; lat: number; heading: number; speedKmh: number };

export type NavHud = { instr: string; distM: number; arrowDeg: number; speed: number };

export type UseNavigationOpts = {
  route: NavRoute | null;
  lang: Lang;
  enabled: boolean;
  curvy?: number;
  onHud?: (hud: NavHud) => void;
  onRouteUpdate?: (route: RouteResult) => void;
  onSos?: () => void;
  onToggleHud?: () => void;
  onHazard?: () => void;
};

const OFF_ROUTE_M = 40;
const OFF_ROUTE_FIXES = 3;
const OFF_ROUTE_MIN_KMH = 5;
const REROUTE_MIN_MS = 15_000;
const ARRIVE_M = 30;
const CURVE_AHEAD_M = 400;
const CURVE_RADIUS_M = 100;
/** Points sent to the car map surface per update. ponytail: the car draws a schematic line, so a
 *  few hundred samples are indistinguishable from the full geometry and this keeps a few thousand
 *  numbers off the JS/native bridge on every tick. Raise it only if the car ever gets real tiles. */
const CAR_PATH_POINTS = 240;

function normalizeDeg(deg: number): number {
  return Math.round(((deg + 540) % 360) - 180);
}

export function useNavigation(opts: UseNavigationOpts) {
  const [navigating, setNavigating] = useState(false);
  const [offRoute, setOffRoute] = useState(false);
  const [remainingKm, setRemainingKm] = useState(0);
  const [etaMin, setEtaMin] = useState(0);
  const [nextInstr, setNextInstr] = useState("");

  const routeRef = useRef(opts.route);
  routeRef.current = opts.route;
  const langRef = useRef(opts.lang);
  langRef.current = opts.lang;
  const enabledRef = useRef(opts.enabled);
  enabledRef.current = opts.enabled;
  const cbRef = useRef(opts);
  cbRef.current = opts;

  const navigatingRef = useRef(false);
  const maneuverIdx = useRef(0);
  const announced = useRef(new Set<string>());
  const curveWarned = useRef(new Set<number>());
  const offRouteStreak = useRef(0);
  const offRouteRef = useRef(false);
  const lastRerouteAt = useRef(0);
  const lastSpoken = useRef<{ text: string; lang: Lang } | null>(null);
  const routeLenM = useRef(0);
  const keySub = useRef<{ remove(): void } | null>(null);

  const setOffRouteBoth = useCallback((next: boolean) => {
    offRouteRef.current = next;
    setOffRoute(next);
    if (!next) offRouteStreak.current = 0;
  }, []);

  const resetProgress = useCallback(() => {
    maneuverIdx.current = 0;
    announced.current = new Set();
    curveWarned.current = new Set();
    offRouteStreak.current = 0;
    setOffRouteBoth(false);
  }, [setOffRouteBoth]);

  const speak = useCallback((text: string) => {
    const lang = langRef.current;
    lastSpoken.current = { text, lang };
    say(text, lang);
  }, []);

  /** Flat `[lon, lat, …]` polyline of the route still ahead, decimated to `CAR_PATH_POINTS`. */
  const carPath = useCallback((coords: LonLat[], from: number): number[] => {
    const ahead = coords.slice(Math.max(0, from));
    if (ahead.length < 2) return [];
    const step = Math.max(1, Math.ceil(ahead.length / CAR_PATH_POINTS));
    const out: number[] = [];
    for (let i = 0; i < ahead.length; i += step) {
      const p = ahead[i];
      if (p) out.push(p[0], p[1]);
    }
    const last = ahead[ahead.length - 1];
    if (last) out.push(last[0], last[1]);
    return out;
  }, []);

  const pushToCar = useCallback(
    (m: Maneuver, fix: NavFix, from: number, remaining: number, eta: number, instr: string, target: LonLat) => {
      try {
        if (!RotoCar.isAvailable() || !RotoCar.isConnected()) return;
        const route = routeRef.current;
        RotoCar.updateTrip({
          maneuverType: m.type,
          instruction: instr,
          distanceM: Math.round(haversineM(fix.lon, fix.lat, target[0], target[1])),
          street: m.streets[0],
          remainingKm: Math.round(remaining * 10) / 10,
          etaMin: Math.round(eta),
          lat: fix.lat,
          lon: fix.lon,
          path: route ? carPath(route.coords, from) : undefined,
          mnvLat: target[1],
          mnvLon: target[0],
        });
      } catch {
        // The car display is a mirror — never let it break navigation.
      }
    },
    [carPath],
  );

  const attemptReroute = useCallback(
    async (fix: NavFix) => {
      const now = Date.now();
      if (now - lastRerouteAt.current < REROUTE_MIN_MS) return;
      lastRerouteAt.current = now;
      const route = routeRef.current;
      if (!route || route.coords.length < 2) return;
      const online = (await Network.getNetworkStateAsync().catch(() => null))?.isConnected ?? true;
      if (!online) return;
      const dest = route.coords[route.coords.length - 1];
      if (!dest) return;
      try {
        const fresh = await queryClient.fetchQuery(
          trpc.route.reroute.queryOptions({
            from: { lat: fix.lat, lon: fix.lon },
            heading: ((fix.heading % 360) + 360) % 360,
            remaining: [{ lat: dest[1], lon: dest[0] }],
            curvy: cbRef.current.curvy ?? 0.5,
            lang: langRef.current,
          }),
        );
        routeLenM.current = lineLengthKm(fresh.coords) * 1000;
        resetProgress();
        cbRef.current.onRouteUpdate?.(fresh);
      } catch {
        // Offline or server unreachable — the "return to route" arrow stays up.
      }
    },
    [resetProgress],
  );

  const update = useCallback(
    (fix: NavFix) => {
      const route = routeRef.current;
      const lang = langRef.current;
      if (!navigatingRef.current || !enabledRef.current || !route || route.coords.length < 2) return;
      const t = STR[lang];
      const nearest = nearestOnLine(route.coords, fix.lon, fix.lat);
      if (!nearest) return;

      // Off-route: > 40 m for 3 consecutive fixes above 5 km/h (plan §4.3).
      if (nearest.distM > OFF_ROUTE_M && fix.speedKmh > OFF_ROUTE_MIN_KMH) offRouteStreak.current += 1;
      else offRouteStreak.current = 0;
      if (offRouteStreak.current >= OFF_ROUTE_FIXES && !offRouteRef.current) {
        setOffRouteBoth(true);
        void attemptReroute(fix);
      }

      const remaining = Math.max(0, routeLenM.current / 1000 - nearest.alongM / 1000);
      const eta = (remaining / Math.max(fix.speedKmh, 25)) * 60;
      setRemainingKm(remaining);
      setEtaMin(eta);

      if (offRouteRef.current) {
        const arrowDeg = normalizeDeg(bearing(fix.lon, fix.lat, nearest.point[0], nearest.point[1]) - fix.heading);
        const hud: NavHud = { instr: t.returnToRoute, distM: Math.round(nearest.distM), arrowDeg, speed: Math.round(fix.speedKmh) };
        setNextInstr(hud.instr);
        cbRef.current.onHud?.(hud);
        return;
      }

      // Compass mode: routes without maneuvers (GPX, curated) get an arrow, no voice.
      if (!route.maneuvers.length) {
        const ahead = route.coords[Math.min(nearest.index + 8, route.coords.length - 1)];
        const arrowDeg = ahead ? normalizeDeg(bearing(fix.lon, fix.lat, ahead[0], ahead[1]) - fix.heading) : 0;
        const hud: NavHud = { instr: "", distM: 0, arrowDeg, speed: Math.round(fix.speedKmh) };
        cbRef.current.onHud?.(hud);
        return;
      }

      while (
        maneuverIdx.current < route.maneuvers.length &&
        nearest.index >= (route.maneuvers[maneuverIdx.current]?.endIdx ?? Number.MAX_SAFE_INTEGER)
      ) {
        maneuverIdx.current += 1;
      }
      const m = route.maneuvers[maneuverIdx.current];
      if (!m) {
        setNextInstr(t.mnvArrive);
        return;
      }
      const target = route.coords[m.beginIdx];
      if (!target) return;
      const distM = haversineM(fix.lon, fix.lat, target[0], target[1]);
      const text = speakManeuver(m, lang, distM);
      const instr = m.instruction || text;

      // Speed-scaled pre-announce: 1 km / 300 m / at-turn above 60 km/h, else 400 m / 100 m.
      const thresholds = fix.speedKmh > 60 ? [1000, 300] : [400, 100];
      for (const th of thresholds) {
        const key = `${maneuverIdx.current}:${th}`;
        if (distM <= th && !announced.current.has(key)) {
          announced.current.add(key);
          speak(text);
        }
      }
      if (distM < ARRIVE_M) {
        for (const th of thresholds) announced.current.add(`${maneuverIdx.current}:${th}`);
        speak(speakManeuver(m, lang, 0));
        maneuverIdx.current += 1;
      }

      // Predictive corner assistant (§4.11): radius < 100 m within 400 m, once per corner.
      try {
        for (const c of upcomingCurves(route.coords, nearest.index, CURVE_AHEAD_M)) {
          if (c.minRadiusM >= CURVE_RADIUS_M || c.startIdx <= nearest.index || c.direction === "straight") continue;
          if (curveWarned.current.has(c.startIdx)) continue;
          curveWarned.current.add(c.startIdx);
          const pt = route.coords[c.startIdx];
          const aheadM = pt ? Math.round(haversineM(fix.lon, fix.lat, pt[0], pt[1])) : CURVE_AHEAD_M;
          speak(
            interpolate(t.navCurveAhead, {
              dir: c.direction === "left" ? t.navDirLeft : t.navDirRight,
              dist: aheadM > 950 ? `${(aheadM / 1000).toFixed(1)} km` : `${aheadM} m`,
            }),
          );
        }
      } catch {
        // Curvature is advisory — never break the maneuver flow.
      }

      const arrowDeg = normalizeDeg(bearing(fix.lon, fix.lat, target[0], target[1]) - fix.heading);
      const hud: NavHud = { instr, distM: Math.round(distM), arrowDeg, speed: Math.round(fix.speedKmh) };
      setNextInstr(instr);
      cbRef.current.onHud?.(hud);
      pushToCar(m, fix, nearest.index, remaining, eta, instr, target);
    },
    [attemptReroute, pushToCar, setOffRouteBoth, speak],
  );

  const repeat = useCallback(() => {
    const last = lastSpoken.current;
    if (last) say(last.text, last.lang);
  }, []);

  const start = useCallback(
    (destinationName?: string) => {
      const route = routeRef.current;
      if (!route || navigatingRef.current) return;
      navigatingRef.current = true;
      routeLenM.current = lineLengthKm(route.coords) * 1000;
      resetProgress();
      setRemainingKm(route.km);
      setEtaMin(route.min);
      void activateKeepAwakeAsync("roto-nav").catch(() => undefined);
      try {
        if (RotoCar.isAvailable() && RotoCar.isConnected()) {
          const dest = route.coords[route.coords.length - 1];
          RotoCar.startNavigation({
            destinationName: destinationName ?? "Roto route",
            destLat: dest?.[1],
            destLon: dest?.[0],
          });
        }
      } catch {
        // Car mirror is best-effort.
      }
      try {
        if (RotoMediaKeys.isAvailable()) {
          void RotoMediaKeys.start().catch(() => undefined);
          keySub.current?.remove();
          keySub.current = RotoMediaKeys.addKeyListener(({ key, longPress }) => {
            const cb = cbRef.current;
            if (key === "play_pause") {
              if (longPress) cb.onSos?.();
              else repeat();
            } else if (key === "next") cb.onHazard?.();
            else if (key === "previous") cb.onToggleHud?.();
          });
        }
      } catch {
        // No remote — the screen buttons remain.
      }
      setNavigating(true);
    },
    [repeat, resetProgress],
  );

  const stop = useCallback(() => {
    if (!navigatingRef.current) return;
    navigatingRef.current = false;
    try {
      keySub.current?.remove();
    } catch {
      // Listener cleanup is best-effort.
    }
    keySub.current = null;
    try {
      if (RotoMediaKeys.isAvailable()) void RotoMediaKeys.stop().catch(() => undefined);
    } catch {
      // Best-effort teardown.
    }
    try {
      if (RotoCar.isAvailable()) RotoCar.stopNavigation();
    } catch {
      // Best-effort teardown.
    }
    void deactivateKeepAwake("roto-nav").catch(() => undefined);
    setNavigating(false);
    setOffRouteBoth(false);
  }, [setOffRouteBoth]);

  // Car head-unit events: Stop / Repeat / SOS action strip (§4.5). Subscribing is safe when
  // the module is missing — addListener returns a no-op subscription there.
  useEffect(() => {
    const connected = RotoCar.addListener("connected", () => {
      if (navigatingRef.current) {
        try {
          const route = routeRef.current;
          const dest = route?.coords[route.coords.length - 1];
          RotoCar.startNavigation({
            destinationName: route?.name ?? "Roto route",
            destLat: dest?.[1],
            destLon: dest?.[0],
          });
        } catch {
          // Best-effort — the phone HUD keeps working.
        }
      }
    });
    const action = RotoCar.addListener("action", ({ id }) => {
      const cb = cbRef.current;
      if (id === "stop") stop();
      else if (id === "repeat") repeat();
      else if (id === "sos") cb.onSos?.();
    });
    return () => {
      try {
        connected.remove();
        action.remove();
      } catch {
        // Best-effort teardown.
      }
      if (navigatingRef.current) {
        navigatingRef.current = false;
        void deactivateKeepAwake("roto-nav").catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A fresh route object (loop shuffle, curated load, reroute result) restarts progress.
  const routeIdentity = opts.route ? `${opts.route.coords.length}:${opts.route.coords[0]?.join(",")}` : "";
  useEffect(() => {
    if (navigatingRef.current) resetProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeIdentity]);

  return { navigating, offRoute, remainingKm, etaMin, nextInstr, start, stop, update, repeat };
}
