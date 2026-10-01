"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { curvatureScore } from "@roto-app/core/curvature";
import { lineLengthKm, simplify } from "@roto-app/core/geo";
import { coordsToGpx } from "@roto-app/core/gpx";
import { STR } from "@roto-app/core/i18n";
import { trimEnds, type Zone } from "@roto-app/core/privacy";
import {
  RIDE_MODE_CURVY,
  type AvoidOptions,
  type Lang,
  type LonLat,
  type Maneuver,
  type RideMode,
  type RouteCapabilities,
  type RouteResult,
  type Waypoint,
} from "@roto-app/core/types";
import { planStrings } from "@/i18n/plan";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

const LANG_KEY = "roto-plan-lang";
const COLOMBO = { lat: 6.9271, lon: 79.8612 };
const KANDY = { lat: 7.2906, lon: 80.6337 };

const STATIC_PRESETS: { id: string; label: string; points: Waypoint[] }[] = [
  { id: "colombo-kandy", label: "Colombo → Kandy", points: [COLOMBO, KANDY] },
  {
    id: "galle-loop",
    label: "Galle loop",
    points: [
      { lat: 6.0535, lon: 80.221 },
      { lat: 6.1, lon: 80.3 },
      { lat: 6.0535, lon: 80.221 },
    ],
  },
  {
    id: "ella",
    label: "Ella",
    points: [
      { lat: 6.8667, lon: 81.0466 },
      { lat: 6.9, lon: 81.1 },
    ],
  },
];

/** Route the map + panels render. Imports get empty maneuvers/capabilities. */
export type ShownRoute = {
  coords: LonLat[];
  km: number;
  min: number;
  engine: string;
  maneuvers: Maneuver[];
  elevation?: { distM: number[]; heightM: number[] };
  capabilities: RouteCapabilities;
  label: string;
};

export type AlternativeOption = { coords: LonLat[]; km: number; min: number; curve: number };

const NO_CAPS: RouteCapabilities = { maneuvers: false, elevation: false, speedLimits: false, surface: false };

function toShown(r: RouteResult, label: string): ShownRoute {
  return {
    coords: r.coords,
    km: r.km,
    min: r.min,
    engine: r.engine,
    maneuvers: r.maneuvers,
    elevation: r.elevation,
    capabilities: r.capabilities,
    label,
  };
}

function nearestMode(curvy: number): RideMode {
  const modes: RideMode[] = ["fast", "balanced", "curvy", "extra"];
  let best: RideMode = "curvy";
  let bestDist = Infinity;
  for (const m of modes) {
    const d = Math.abs(RIDE_MODE_CURVY[m] - curvy);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}

/** Even-sample a long line down to `max` points (server also simplifies, this keeps payloads tiny). */
function sampleWaypoints(points: Waypoint[], max = 25): Waypoint[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: Waypoint[] = [];
  for (let i = 0; i < max; i++) {
    const p = points[Math.min(Math.round(i * step), points.length - 1)];
    if (p) out.push(i === 0 || i === max - 1 ? p : { lat: p.lat, lon: p.lon, kind: "via" as const });
  }
  return out;
}

function readLang(): Lang {
  if (typeof window === "undefined") return "en";
  const v = window.localStorage.getItem(LANG_KEY);
  return v === "si" || v === "ta" ? v : "en";
}

export function usePlanner() {
  const [lang, setLangState] = useState<Lang>(readLang);
  const [waypoints, setWaypoints] = useState<Waypoint[]>(STATIC_PRESETS[0]?.points ?? [COLOMBO, KANDY]);
  const [mode, setModeState] = useState<RideMode>("curvy");
  const [curvy, setCurvyState] = useState(RIDE_MODE_CURVY.curvy);
  const [avoid, setAvoid] = useState<AvoidOptions>({});
  const [loopKm, setLoopKm] = useState(60);
  const [loopDirection, setLoopDirection] = useState<number | undefined>(undefined);
  const [loopSeed, setLoopSeed] = useState(1);
  const [loopIdx, setLoopIdx] = useState(0);
  const [source, setSource] = useState<"plan" | "loop" | "import">("plan");
  const [imported, setImported] = useState<{ coords: LonLat[]; label: string } | null>(null);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [autoPlan, setAutoPlan] = useState(false);

  const t = useMemo(() => ({ ...STR[lang], ...planStrings[lang] }), [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(LANG_KEY, l);
    } catch {
      // Private-mode storage — language just won't persist.
    }
  }, []);
  const setMode = useCallback((m: RideMode) => {
    setModeState(m);
    setCurvyState(RIDE_MODE_CURVY[m]);
  }, []);
  const setCurvy = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    setCurvyState(clamped);
    setModeState(nearestMode(clamped));
  }, []);

  // ponytail: explicit Plan/Loop buttons, not auto-plan on every drag — hill-country
  // riders on metered data shouldn't fire a routing request per marker nudge.
  const planInput = useMemo(
    () => ({
      waypoints: sampleWaypoints(waypoints),
      curvy,
      avoid,
      alternates: waypoints.length === 2 ? 2 : 0,
      elevation: true,
      lang,
    }),
    [waypoints, curvy, avoid, lang],
  );
  const planQuery = useQuery({ ...trpc.route.plan.queryOptions(planInput), enabled: false });

  const loopCenter = waypoints[0] ?? COLOMBO;
  const loopQuery = useQuery({
    ...trpc.route.roundTrip.queryOptions({
      center: { lat: loopCenter.lat, lon: loopCenter.lon },
      km: loopKm,
      ...(loopDirection === undefined ? {} : { direction: loopDirection }),
      curvy,
      avoid,
      seed: loopSeed,
    }),
    enabled: false,
  });

  const curatedList = useQuery(trpc.curated.list.queryOptions({}));
  const curatedGet = useQuery({
    ...trpc.curated.get.queryOptions({ id: presetId ?? "" }),
    enabled: presetId !== null,
  });
  // The curated.list contract is now paginated ({items, nextCursor}); tolerate the old plain array too.
  const curatedRows = Array.isArray(curatedList.data) ? curatedList.data : (curatedList.data?.items ?? []);

  const { data: session } = authClient.useSession();
  const zonesQuery = useQuery({ ...trpc.privacy.list.queryOptions(), enabled: !!session?.user });

  // Curated pick (or ?route=<id> deep link from home) replaces the waypoint list.
  useEffect(() => {
    const coords = curatedGet.data?.coords as LonLat[] | undefined;
    if (presetId !== null && coords && coords.length >= 2) {
      setWaypoints(sampleWaypoints(coords.map(([lon, lat]) => ({ lat, lon }))));
      setSource("plan");
    }
  }, [curatedGet.data, presetId]);

  const plan = useCallback(() => {
    setSource("plan");
    setImported(null);
    void planQuery.refetch();
  }, [planQuery]);

  // Bulk loads (import link, snap-to-roads) must plan AFTER the new waypoints land in
  // the query key — refetching synchronously would send the stale list.
  useEffect(() => {
    if (autoPlan) {
      setAutoPlan(false);
      void planQuery.refetch();
    }
  }, [autoPlan, planQuery]);

  const drawLoop = useCallback(() => {
    setSource("loop");
    setImported(null);
    setLoopIdx(0);
    void loopQuery.refetch();
  }, [loopQuery]);

  const shuffle = useCallback(() => {
    setLoopSeed((s) => s + 1);
    setLoopIdx(0);
    void loopQuery.refetch();
  }, [loopQuery]);

  const showLoop = useCallback((i: number) => {
    setLoopIdx(i);
    setSource("loop");
    setImported(null);
  }, []);

  const loopOptions: AlternativeOption[] = useMemo(() => {
    if (!loopQuery.data) return [];
    return [loopQuery.data.best, ...loopQuery.data.alternatives].map((r) => ({
      coords: r.coords,
      km: r.km,
      min: r.min,
      curve: curvatureScore(r.coords),
    }));
  }, [loopQuery.data]);

  const planLabel =
    curatedRows.find((r) => r.id === presetId)?.nameEn ??
    STATIC_PRESETS.find((p) => p.id === presetId)?.label ??
    `${waypoints.length} stops`;

  const shown: ShownRoute | null = useMemo(() => {
    if (source === "import" && imported) {
      return {
        coords: imported.coords,
        km: lineLengthKm(imported.coords),
        min: 0,
        engine: "import",
        maneuvers: [],
        elevation: undefined,
        capabilities: NO_CAPS,
        label: imported.label,
      };
    }
    if (source === "loop" && loopQuery.data) {
      const all = [loopQuery.data.best, ...loopQuery.data.alternatives];
      const r = all[Math.min(loopIdx, all.length - 1)];
      if (r) return toShown(r, `${loopKm} km loop`);
    }
    if (planQuery.data) return toShown(planQuery.data, planLabel);
    return null;
  }, [source, imported, loopQuery.data, loopIdx, loopKm, planQuery.data, planLabel]);

  // Elevation fallback: plan asks for elevation inline, but imports and older
  // results have none — fetch it so the chart still renders.
  const attrCoords = useMemo(() => {
    const c = shown?.coords ?? [];
    return c.length > 1000 ? simplify(c, 50) : c;
  }, [shown]);
  const attrsQuery = useQuery({
    ...trpc.route.attributes.queryOptions({ coords: attrCoords.length >= 2 ? attrCoords : [[0, 0], [0, 1]] }),
    enabled: attrCoords.length >= 2,
  });
  const elevQuery = useQuery({
    ...trpc.route.elevation.queryOptions({ coords: attrCoords.length >= 2 ? attrCoords : [[0, 0], [0, 1]] }),
    enabled: attrCoords.length >= 2 && !shown?.elevation,
  });
  const elevation = shown?.elevation ?? elevQuery.data?.profile;

  const zones: Zone[] = useMemo(
    () => (zonesQuery.data ?? []).map((z) => ({ lat: z.lat, lon: z.lon, radiusM: z.radiusM })),
    [zonesQuery.data],
  );
  const trimmedCoords = useMemo(() => (shown ? trimEnds(shown.coords, zones) : []), [shown, zones]);

  const downloadGpx = useCallback(() => {
    if (!shown) return;
    const xml = coordsToGpx(trimmedCoords, shown.label, "track");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([xml], { type: "application/gpx+xml" }));
    a.download = "roto-ride.gpx";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, [shown, trimmedCoords]);

  const useImported = useCallback((coords: LonLat[], label: string) => {
    if (coords.length < 2) return;
    setImported({ coords, label });
    setSource("import");
  }, []);

  const clearImported = useCallback(() => {
    setImported(null);
    setSource("plan");
  }, []);

  /** Imported line → routable waypoints (≤25 samples) → plan for turns + stats. */
  const snapImported = useCallback(() => {
    if (!imported) return;
    const sampled = simplify(imported.coords, 200);
    const step = Math.max(1, Math.ceil(sampled.length / 25));
    const pts = sampled.filter((_, i) => i % step === 0 || i === sampled.length - 1);
    if (pts.length >= 2) {
      setWaypoints(pts.map(([lon, lat]) => ({ lat, lon, kind: "via" as const })));
      setImported(null);
      setSource("plan");
      setAutoPlan(true);
    }
  }, [imported]);

  /** Google-Maps-link waypoints → waypoint list → plan. */
  const loadWaypoints = useCallback((points: { lat: number; lon: number }[]) => {
    if (points.length < 2) return;
    setWaypoints(sampleWaypoints(points.map((p) => ({ ...p }))));
    setImported(null);
    setSource("plan");
    setAutoPlan(true);
  }, []);

  const insertWaypoint = useCallback((index: number, p: { lat: number; lon: number }) => {
    setWaypoints((w) => {
      if (w.length >= 500) return w;
      const next = [...w];
      next.splice(Math.max(0, Math.min(index, next.length)), 0, { ...p, kind: "via" as const });
      return next;
    });
  }, []);

  const moveWaypoint = useCallback((from: number, to: number) => {
    setWaypoints((w) => {
      const next = [...w];
      const [item] = next.splice(from, 1);
      if (!item) return w;
      next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
      return next;
    });
  }, []);

  const removeWaypoint = useCallback((index: number) => {
    setWaypoints((w) => (w.length <= 1 ? w : w.filter((_, i) => i !== index)));
  }, []);

  const renameWaypoint = useCallback((index: number, name: string) => {
    setWaypoints((w) => w.map((p, i) => (i === index ? { ...p, name: name || undefined } : p)));
  }, []);

  const setWaypointCoord = useCallback((index: number, p: { lat: number; lon: number }) => {
    setWaypoints((w) => w.map((q, i) => (i === index ? { ...q, ...p } : q)));
  }, []);

  const toggleAvoid = useCallback((key: keyof AvoidOptions) => {
    setAvoid((a) => ({ ...a, [key]: !a[key] }));
  }, []);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setWaypoints((w) => {
          const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          return w.length ? [{ ...here }, ...w.slice(1)] : [here];
        }),
      () => {
        // No permission — leave the start where it is; the error surfaces via the plan call.
      },
      { timeout: 8000 },
    );
  }, []);

  const busy = planQuery.isFetching || loopQuery.isFetching;
  const error = planQuery.error ?? loopQuery.error ?? null;

  return {
    t,
    lang,
    setLang,
    waypoints,
    insertWaypoint,
    moveWaypoint,
    removeWaypoint,
    renameWaypoint,
    setWaypointCoord,
    useMyLocation,
    mode,
    setMode,
    curvy,
    setCurvy,
    avoid,
    toggleAvoid,
    loopKm,
    setLoopKm,
    loopDirection,
    setLoopDirection,
    loopIdx,
    setLoopIdx,
    showLoop,
    loopOptions,
    plan: planQuery,
    loop: loopQuery,
    doPlan: plan,
    drawLoop,
    shuffle,
    source,
    shown,
    elevation,
    elevLoading: elevQuery.isFetching,
    attrs: attrsQuery.data ?? null,
    attrsLoading: attrsQuery.isFetching,
    imported,
    useImported,
    clearImported,
    snapImported,
    loadWaypoints,
    trimmedCoords,
    downloadGpx,
    busy,
    error,
    curatedList,
    curatedRows,
    presetId,
    setPresetId,
    staticPresets: STATIC_PRESETS,
    session,
  };
}

export type Planner = ReturnType<typeof usePlanner>;
