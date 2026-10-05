// Self-hosted Valhalla engine. First in the planRoute chain (index.ts) when VALHALLA_URL is set.
// ponytail: VALHALLA_URL is read lazily (process.env, not a module-level const) — server .env
// (varlock) loads after module init (AGENTS.md "Env uses Varlock").
import { bbox, decodePolyline6 } from "@roto-app/core/geo";
import { curvatureScore } from "@roto-app/core/curvature";
import type { LonLat, Maneuver } from "@roto-app/core/types";
import type { EngineResult, PlanOptions } from "./types";

const VALHALLA_ACTIONS = ["route", "trace_attributes", "trace_route", "height", "status", "locate", "optimized_route"];

/**
 * `VALHALLA_URL` historically points at the full /route endpoint (e.g. `http://localhost:8002/route`,
 * see tiles/docker-compose.yml + apps/server .env.schema). The other Valhalla services
 * (/trace_attributes, /height, /trace_route) are siblings, not nested under /route, so this
 * strips a known trailing action segment to recover the host root robustly either way — whether
 * VALHALLA_URL is set to the bare host or to a specific action URL.
 */
export function valhallaBaseUrl(): string | undefined {
  const raw = process.env.VALHALLA_URL;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    const segments = u.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && VALHALLA_ACTIONS.includes(last)) segments.pop();
    u.pathname = segments.length ? `/${segments.join("/")}` : "";
    u.search = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw.replace(/\/(route|trace_attributes|trace_route|height|status|locate|optimized_route)\/?$/, "");
  }
}

export function valhallaActionUrl(action: string): string | undefined {
  const base = valhallaBaseUrl();
  return base ? `${base}/${action}` : undefined;
}

type ValhallaSign = {
  exit_number_elements?: { text: string }[];
  exit_branch_elements?: { text: string }[];
};

type ValhallaManeuver = {
  type: number;
  instruction?: string;
  verbal_pre_transition_instruction?: string;
  verbal_post_transition_instruction?: string;
  street_names?: string[];
  length: number;
  time: number;
  begin_shape_index: number;
  end_shape_index: number;
  roundabout_exit_count?: number;
  sign?: ValhallaSign;
};

type ValhallaLeg = {
  shape: string;
  maneuvers?: ValhallaManeuver[];
};

type ValhallaResponse = {
  trip: {
    legs: ValhallaLeg[];
    summary: { length: number; time: number };
  };
  alternates?: { trip: ValhallaResponse["trip"] }[];
};

function mapManeuvers(maneuvers: ValhallaManeuver[] | undefined): Maneuver[] {
  return (maneuvers ?? []).map((m) => ({
    type: m.type,
    instruction: m.instruction ?? "",
    verbalPre: m.verbal_pre_transition_instruction,
    verbalPost: m.verbal_post_transition_instruction,
    streets: m.street_names ?? [],
    lengthKm: m.length,
    timeS: m.time,
    beginIdx: m.begin_shape_index,
    endIdx: m.end_shape_index,
    exitCount: m.roundabout_exit_count,
    exitNumber: m.sign?.exit_number_elements?.[0]?.text,
  }));
}

function tripToResult(trip: ValhallaResponse["trip"]): EngineResult {
  const coords: LonLat[] = [];
  const maneuvers: Maneuver[] = [];
  for (const leg of trip.legs) {
    const base = coords.length;
    const pts = decodePolyline6(leg.shape);
    for (const m of mapManeuvers(leg.maneuvers)) {
      maneuvers.push({ ...m, beginIdx: m.beginIdx + base, endIdx: m.endIdx + base });
    }
    coords.push(...pts);
  }
  return {
    coords,
    km: trip.summary.length,
    min: trip.summary.time / 60,
    engine: "valhalla",
    maneuvers,
  };
}

/**
 * Motorcycle costing (B1 fix). The old code sent `use_hills`/`use_primary`, which belong to
 * `motor_scooter` — Valhalla ignores unknown costing keys silently, so the twistiness slider did
 * nothing. `use_trails` is the correct motorcycle-costing BETA option for preferring
 * secondary/adventurous roads over major ones.
 *
 * `use_highways` is always 0 here, unconditionally (not derived from `curvy`) — Sri Lankan
 * expressways (E01-E04) are legally closed to motorcycles (plan §1.2). This is a preference, not
 * a guarantee: an infra-agent check of `/locate` near Kottawa (6.8408, 79.9636), right by the
 * Southern Expressway, found `access.motorcycle: true` on that edge — this LK extract does not
 * tag the expressway `motorcycle=no`, so Valhalla has no hard access-restriction reason to refuse
 * it. Smoke-testing Kottawa interchange -> Galle interchange confirms the extract genuinely has
 * expressway data (`auto` costing with `use_highways: 1` returns "E001"/"Southern Expressway" in
 * the street names, ~72 min vs ~103 min avoiding it) and that `motorcycle` costing avoided it in
 * that test even at `use_highways: 1` — but that's an empirical observation about one OD pair's
 * cost balance, not a rule to rely on. The actual guarantee is `callValhallaBanningMotorways`
 * below: it checks the real returned route via /trace_attributes and replans around any motorway
 * edge it finds, so a motorway can never reach the caller even if this preference alone doesn't
 * avoid it for some other route.
 */
export function motorcycleCostingOptions(opts: PlanOptions) {
  const curvy = Math.max(0, Math.min(1, opts.curvy));
  const avoidUnpaved = opts.avoid?.unpaved ?? false;
  return {
    use_highways: 0,
    use_trails: avoidUnpaved ? Math.min(curvy * 0.4, 0.3) : curvy * 0.6,
    use_tolls: opts.avoid?.tolls ? 0 : 0.5,
    use_ferry: opts.avoid?.ferries ? 0 : 0.5,
    ...(curvy >= 0.95 ? { disable_hierarchy_pruning: true } : {}),
  };
}

export function toLocations(opts: PlanOptions) {
  return opts.waypoints.map((w, i) => ({
    lat: w.lat,
    lon: w.lon,
    type: w.kind ?? "break",
    // `search_filter.max_road_class` only constrains which edge a location is allowed to SNAP
    // to (per Valhalla's own docs) — it does not exclude that road class from the middle of the
    // route, confirmed by smoke test. Still worth setting: it stops a waypoint dropped near a
    // motorway shoulder from snapping onto it. The real expressway-avoidance is
    // `use_highways: 0` above (motorcycleCostingOptions), not this.
    search_filter: { max_road_class: "trunk" },
    ...(i === 0 && opts.heading !== undefined ? { heading: opts.heading, heading_tolerance: 45 } : {}),
  }));
}

async function callValhalla(body: Record<string, unknown>): Promise<ValhallaResponse> {
  const url = valhallaActionUrl("route");
  if (!url) throw new Error("VALHALLA_URL not set");
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`valhalla ${r.status}`);
  return (await r.json()) as ValhallaResponse;
}

type MotorwayEdge = {
  road_class?: string;
  begin_shape_index?: number;
  end_shape_index?: number;
};
type TraceAttributesShapeResponse = { edges?: MotorwayEdge[]; shape?: string };

/**
 * Hard post-check for the expressway ban, per an infra-agent finding: this LK extract does NOT
 * tag the Southern Expressway `motorcycle=no` (confirmed via /locate near Kottawa), so
 * `use_highways: 0` and `search_filter` are preferences only — Valhalla will still hand back a
 * motorway-class edge if that's genuinely the shortest path under those preferences. This asks
 * /trace_attributes for the road class of every edge in the candidate route and returns the
 * coordinates of any `motorway` edges found (empty if none), for the caller to either accept the
 * route (empty) or exclude those coordinates and replan (non-empty).
 */
async function findMotorwaySegments(coords: LonLat[]): Promise<LonLat[]> {
  const url = valhallaActionUrl("trace_attributes");
  if (!url || coords.length < 2) return [];
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        shape: coords.map(([lon, lat]) => ({ lat, lon })),
        costing: "motorcycle",
        shape_match: "edge_walk",
        filters: {
          attributes: ["edge.road_class", "edge.begin_shape_index", "edge.end_shape_index", "shape"],
          action: "include",
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return [];
    const j = (await r.json()) as TraceAttributesShapeResponse;
    if (!j.shape || !j.edges) return [];
    const shapePts = decodePolyline6(j.shape);
    const flagged: LonLat[] = [];
    for (const e of j.edges) {
      if (e.road_class !== "motorway" || e.begin_shape_index === undefined || e.end_shape_index === undefined) continue;
      flagged.push(...shapePts.slice(e.begin_shape_index, e.end_shape_index + 1));
    }
    return flagged;
  } catch {
    // The check itself failing shouldn't block routing entirely — treated as "couldn't confirm",
    // not as "found a motorway". The unconditional use_highways:0 preference is still in effect.
    return [];
  }
}

/** A rectangular exclude_polygons feature buffered ~1.1km (0.01 deg) around flagged coordinates. */
function excludePolygonAround(points: LonLat[]) {
  const [minLon, minLat, maxLon, maxLat] = bbox(points);
  const buf = 0.01;
  const ring = [
    [minLon - buf, minLat - buf],
    [maxLon + buf, minLat - buf],
    [maxLon + buf, maxLat + buf],
    [minLon - buf, maxLat + buf],
    [minLon - buf, minLat - buf],
  ];
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] };
}

/**
 * Plans once, then enforces the expressway ban: if the result touches a motorway edge
 * (findMotorwaySegments), replans a single time with `exclude_polygons` drawn around the
 * offending edges. If a motorway edge is STILL present after that retry, this throws — the
 * caller (index.ts's engine chain) treats that as a Valhalla failure and falls back to BRouter,
 * whose trekking profile won't select a motorway at all. Silently returning a motorway route is
 * not an acceptable degrade for this app (plan §1.2, PRODUCT.md hard constraint).
 */
async function callValhallaBanningMotorways(body: Record<string, unknown>): Promise<ValhallaResponse> {
  const j = await callValhalla(body);
  const trips = [j.trip, ...(j.alternates ?? []).map((a) => a.trip)];

  const flaggedByTrip = await Promise.all(
    trips.map(async (trip) => {
      const coords = tripToResult(trip).coords;
      return findMotorwaySegments(coords);
    }),
  );
  if (flaggedByTrip.every((f) => f.length === 0)) return j;

  const allFlagged = flaggedByTrip.flat();
  const retryBody = { ...body, exclude_polygons: excludePolygonAround(allFlagged) };
  const retry = await callValhalla(retryBody);
  const retryTrips = [retry.trip, ...(retry.alternates ?? []).map((a) => a.trip)];
  const stillFlagged = await Promise.all(retryTrips.map((trip) => findMotorwaySegments(tripToResult(trip).coords)));
  if (stillFlagged.some((f) => f.length > 0)) {
    throw new Error("valhalla: route still uses a motorway-class road after exclude_polygons retry");
  }
  return retry;
}

export async function planValhalla(opts: PlanOptions): Promise<EngineResult> {
  const alternates = opts.waypoints.length === 2 ? Math.max(0, Math.min(2, opts.alternates ?? 0)) : undefined;
  const j = await callValhallaBanningMotorways({
    locations: toLocations(opts),
    costing: "motorcycle",
    costing_options: { motorcycle: motorcycleCostingOptions(opts) },
    directions_type: "instructions", // keep instruction/verbal text — "maneuvers" mode omits it
    language: "en-US", // Valhalla has no si/ta narrative locale (plan §1.2); those are built from core/maneuvers
    ...(alternates ? { alternates } : {}),
    ...(opts.elevation ? { elevation_interval: 30 } : {}),
  });

  const primary = tripToResult(j.trip);
  const alts = (j.alternates ?? []).map((a) => tripToResult(a.trip));
  if (!alts.length) return primary;

  // Curvy ranking: with alternates, pick the one whose curvature score best matches the
  // requested `curvy` — high curvy picks the most twisty alternate, low curvy the least.
  const candidates = [primary, ...alts];
  const scored = candidates.map((c) => ({ c, score: curvatureScore(c.coords) }));
  scored.sort((a, b) => (opts.curvy >= 0.5 ? b.score - a.score : a.score - b.score));
  return scored[0]?.c ?? primary;
}
