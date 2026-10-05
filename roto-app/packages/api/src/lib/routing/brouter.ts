// Public BRouter fallback, used when VALHALLA_URL is unset or Valhalla is unreachable (D1: prod
// runs without a hosted Valhalla for now). No true motorcycle profile exists on the public
// server, so "trekking" is the closest fit — this engine's `capabilities.maneuvers` is false
// unless `timode=3` voice hints turn out to carry usable turn data (see the TODO below).
import type { EngineResult, LatLon } from "./types";

const BROUTER = "https://brouter.de/brouter";

type BrouterFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "LineString"; coordinates: [number, number][] };
};

type BrouterResponse = { features: BrouterFeature[] };

export async function planBrouter(points: LatLon[]): Promise<EngineResult> {
  const lonlats = points.map((p) => `${p.lon},${p.lat}`).join("|");
  // ponytail: timode=3 (voice hints) is requested but not parsed into maneuvers yet — BRouter's
  // voice-hint geometry needs a bespoke turn-angle-to-instruction mapping. Until that's built,
  // BRouter routes carry no maneuvers and the caller should treat capabilities.maneuvers=false.
  const url = `${BROUTER}?lonlats=${lonlats}&profile=trekking&alternativeidx=0&format=geojson&timode=3`;
  const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`brouter ${r.status}`);
  const j = (await r.json()) as BrouterResponse;
  const f = j.features?.[0];
  if (!f) throw new Error("brouter empty");
  return {
    coords: f.geometry.coordinates,
    km: Number(f.properties?.["track-length"] ?? 0) / 1000,
    min: Number(f.properties?.["total-time"] ?? 0) / 60,
    engine: "brouter",
    maneuvers: [],
  };
}
