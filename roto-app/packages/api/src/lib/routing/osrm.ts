// Public OSRM demo server, last resort in the engine chain (index.ts). No motorcycle profile —
// "driving" is the closest available on the demo server (motorcycle/bike profiles aren't hosted
// there), so this is a distance/shape-only fallback in practice; maneuvers still map through so
// the HUD has *something* even in a total Valhalla+BRouter outage.
import { ManeuverType } from "@roto-app/core/types";
import type { Maneuver } from "@roto-app/core/types";
import type { EngineResult, LatLon } from "./types";

const OSRM = "https://router.project-osrm.org/route/v1/driving";
const USER_AGENT = "roto-app/0.1 (+https://roto.lk)";

type OsrmManeuver = { type: string; modifier?: string; exit?: number; location: [number, number] };
type OsrmStep = { maneuver: OsrmManeuver; name?: string; distance: number; duration: number };
type OsrmLeg = { steps?: OsrmStep[] };
type OsrmRoute = {
  geometry: { coordinates: [number, number][] };
  distance: number;
  duration: number;
  legs?: OsrmLeg[];
};
type OsrmResponse = { routes?: OsrmRoute[] };

export function mapType(m: OsrmManeuver): number {
  const mod = m.modifier ?? "";
  switch (m.type) {
    case "depart":
      return ManeuverType.Start;
    case "arrive":
      return ManeuverType.Destination;
    case "merge":
      return mod.includes("left") ? ManeuverType.MergeLeft : ManeuverType.MergeRight;
    case "on ramp":
      return mod.includes("left") ? ManeuverType.RampLeft : ManeuverType.RampRight;
    case "off ramp":
      return mod.includes("left") ? ManeuverType.ExitLeft : ManeuverType.ExitRight;
    case "roundabout":
    case "rotary":
    case "roundabout turn":
      return ManeuverType.RoundaboutEnter;
    case "exit roundabout":
    case "exit rotary":
      return ManeuverType.RoundaboutExit;
    case "fork":
      return mod.includes("left") ? ManeuverType.StayLeft : ManeuverType.StayRight;
    case "turn":
      switch (mod) {
        case "uturn":
          return ManeuverType.UturnLeft;
        case "sharp left":
          return ManeuverType.SharpLeft;
        case "left":
          return ManeuverType.Left;
        case "slight left":
          return ManeuverType.SlightLeft;
        case "slight right":
          return ManeuverType.SlightRight;
        case "right":
          return ManeuverType.Right;
        case "sharp right":
          return ManeuverType.SharpRight;
        default:
          return ManeuverType.Continue;
      }
    default:
      return ManeuverType.Continue;
  }
}

function mapSteps(steps: OsrmStep[] | undefined): Maneuver[] {
  return (steps ?? []).map((s) => ({
    type: mapType(s.maneuver),
    instruction: `${s.maneuver.type}${s.maneuver.modifier ? ` ${s.maneuver.modifier}` : ""}${s.name ? ` onto ${s.name}` : ""}`.trim(),
    streets: s.name ? [s.name] : [],
    lengthKm: s.distance / 1000,
    timeS: s.duration,
    beginIdx: 0,
    endIdx: 0,
    exitCount: s.maneuver.exit,
  }));
}

export async function planOsrm(points: LatLon[]): Promise<EngineResult> {
  const coord = points.map((p) => `${p.lon},${p.lat}`).join(";");
  // B14: request steps + identify the client + bound the wait — the old fallback sent none of these.
  const url = `${OSRM}/${coord}?overview=full&geometries=geojson&steps=true`;
  const r = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`osrm ${r.status}`);
  const j = (await r.json()) as OsrmResponse;
  const route = j.routes?.[0];
  if (!route) throw new Error("osrm: no route");
  const maneuvers = (route.legs ?? []).flatMap((l) => mapSteps(l.steps));
  return {
    coords: route.geometry.coordinates,
    km: route.distance / 1000,
    min: route.duration / 60,
    engine: "osrm",
    maneuvers,
  };
}
