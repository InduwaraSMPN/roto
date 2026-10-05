// Map-matching a recorded GPS track onto the road network, via Valhalla /trace_route
// (shape_match: map_snap). Used for server-side ride post-processing (plan §4.10 `matched` flag)
// — returns null when Valhalla isn't reachable, since there's no meaningful fallback engine for
// map matching.
import { decodePolyline6 } from "@roto-app/core/geo";
import type { LonLat } from "@roto-app/core/types";
import { valhallaActionUrl } from "./valhalla";

type TraceRouteResponse = {
  trip?: {
    legs: { shape: string }[];
    summary: { length: number; time: number };
  };
};

export type MatchResult = { coords: LonLat[]; km: number; min: number };

export async function matchRoute(coords: LonLat[]): Promise<MatchResult | null> {
  if (coords.length < 2) return null;
  const url = valhallaActionUrl("trace_route");
  if (!url) return null;

  const body = {
    shape: coords.map(([lon, lat]) => ({ lat, lon })),
    costing: "motorcycle",
    shape_match: "map_snap",
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as TraceRouteResponse;
  if (!j.trip) return null;

  const matched: LonLat[] = [];
  for (const leg of j.trip.legs) matched.push(...decodePolyline6(leg.shape));
  return { coords: matched, km: j.trip.summary.length, min: j.trip.summary.time / 60 };
}
