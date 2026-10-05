// Engine chain: self-hosted Valhalla (motorcycle costing, maneuvers, best data) -> public
// BRouter (no motorcycle profile, no maneuvers) -> public OSRM demo (last resort). A failure at
// each stage falls through silently, same as the original module. D1: prod has no hosted
// Valhalla, so most routes there run in the BRouter/OSRM degraded path — callers must read
// `capabilities` and hide features accordingly (no reroute-with-heading, no speed limits, no
// surface, no server map matching; elevation still works there via the Open-Meteo fallback).
import { elevationProfile } from "./elevation";
import { planBrouter } from "./brouter";
import { roundTripCandidates } from "./loops";
import { planOsrm } from "./osrm";
import { planValhalla } from "./valhalla";
import type { EngineResult, LatLon, PlanOptions, RouteCapabilities, RouteResult, RoundTripOptions, Waypoint } from "./types";

export type { PlanOptions, RoundTripOptions, RouteResult, EngineResult } from "./types";
export { roundTripPoints } from "./loops";
export { routeAttributes } from "./attributes";
export type { RouteAttributes, RouteAttributeSegment } from "./attributes";
export { elevationProfile } from "./elevation";
export { matchRoute } from "./match";
export type { MatchResult } from "./match";
export { valhallaActionUrl, valhallaBaseUrl } from "./valhalla";

function capabilitiesFor(engine: EngineResult["engine"]): RouteCapabilities {
  switch (engine) {
    case "valhalla":
      return { maneuvers: true, elevation: false, speedLimits: true, surface: true };
    case "osrm":
      return { maneuvers: true, elevation: false, speedLimits: false, surface: false };
    default:
      return { maneuvers: false, elevation: false, speedLimits: false, surface: false };
  }
}

async function runChain(opts: PlanOptions): Promise<RouteResult> {
  let result: EngineResult | null = null;

  if (process.env.VALHALLA_URL) {
    try {
      result = await planValhalla(opts);
    } catch {
      result = null; // down/unset Valhalla (e.g. prod, D1) -> BRouter -> OSRM below
    }
  }
  if (!result) {
    try {
      result = await planBrouter(opts.waypoints);
    } catch {
      result = null; // fall through to OSRM demo
    }
  }
  if (!result) {
    result = await planOsrm(opts.waypoints);
  }

  let capabilities = capabilitiesFor(result.engine);
  capabilities = { ...capabilities, maneuvers: result.maneuvers.length > 0 && capabilities.maneuvers };

  let elevation: RouteResult["elevation"];
  if (opts.elevation) {
    try {
      const { profile } = await elevationProfile(result.coords);
      elevation = profile;
      capabilities = { ...capabilities, elevation: true };
    } catch {
      // no elevation source reachable — capabilities.elevation stays false
    }
  }

  return { ...result, capabilities, elevation };
}

export function planRoute(opts: PlanOptions): Promise<RouteResult>;
/** @deprecated legacy positional form kept for packages/db/src/seed/curated.ts — prefer the PlanOptions overload. */
export function planRoute(points: LatLon[], curvy?: number): Promise<RouteResult>;
export function planRoute(a: PlanOptions | LatLon[], curvy = 0.5): Promise<RouteResult> {
  const opts: PlanOptions = Array.isArray(a)
    ? { waypoints: a.map((p): Waypoint => ({ lat: p.lat, lon: p.lon })), curvy }
    : a;
  return runChain(opts);
}

export async function planRoundTrip(opts: RoundTripOptions): Promise<{ best: RouteResult; alternatives: RouteResult[] }> {
  return roundTripCandidates(opts, runChain);
}
