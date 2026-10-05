// Per-segment road attributes (speed limit, surface, road class) via Valhalla /trace_attributes.
// Only available when VALHALLA_URL is set — capabilities.speedLimits/surface reflect that so
// callers (native HUD badge, web planner strip) know to hide the UI rather than show nothing.
import type { LonLat } from "@roto-app/core/types";
import { valhallaActionUrl } from "./valhalla";

export type RouteAttributeSegment = {
  speedLimitKph?: number;
  surface?: string;
  unpaved?: boolean;
  roadClass?: string;
  lengthKm?: number;
};

export type RouteAttributes = {
  segments: RouteAttributeSegment[];
  capabilities: { speedLimits: boolean; surface: boolean };
};

type ValhallaEdge = {
  speed_limit?: number;
  surface?: string;
  unpaved?: boolean;
  road_class?: string;
  length?: number;
};

type TraceAttributesResponse = { edges?: ValhallaEdge[] };

// ponytail: tiny in-process LRU, not Redis — a single server instance's cache is enough for the
// planner (repeated hovers over the same route) and disappears on restart with no correctness cost.
const CACHE_MAX = 50;
const cache = new Map<string, RouteAttributes>();

function hashCoords(coords: LonLat[]): string {
  let h = 2166136261;
  for (const c of coords) {
    const s = `${c[0].toFixed(5)},${c[1].toFixed(5)};`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return `${coords.length}:${(h >>> 0).toString(36)}`;
}

function rememberInCache(key: string, value: RouteAttributes) {
  cache.set(key, value);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export async function routeAttributes(coords: LonLat[]): Promise<RouteAttributes> {
  if (coords.length < 2) return { segments: [], capabilities: { speedLimits: false, surface: false } };

  const key = hashCoords(coords);
  const cached = cache.get(key);
  if (cached) return cached;

  const url = valhallaActionUrl("trace_attributes");
  if (!url) return { segments: [], capabilities: { speedLimits: false, surface: false } };

  const body = {
    shape: coords.map(([lon, lat]) => ({ lat, lon })),
    costing: "motorcycle",
    shape_match: "edge_walk",
    filters: {
      attributes: ["edge.speed_limit", "edge.surface", "edge.unpaved", "edge.road_class", "edge.length"],
      action: "include",
    },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`valhalla trace_attributes ${r.status}`);
  const j = (await r.json()) as TraceAttributesResponse;

  const segments: RouteAttributeSegment[] = (j.edges ?? []).map((e) => ({
    speedLimitKph: e.speed_limit,
    surface: e.surface,
    unpaved: e.unpaved,
    roadClass: e.road_class,
    lengthKm: e.length,
  }));
  const result: RouteAttributes = {
    segments,
    capabilities: {
      speedLimits: segments.some((s) => s.speedLimitKph !== undefined),
      surface: segments.some((s) => s.surface !== undefined),
    },
  };
  rememberInCache(key, result);
  return result;
}
