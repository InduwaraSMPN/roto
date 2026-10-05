// Cross-app route/waypoint/maneuver shapes live in @roto-app/core/types (A1) so web, native and
// the API agree on one contract. This file only adds shapes private to the engine chain itself.
import type { RouteResult } from "@roto-app/core/types";

export type {
  AvoidOptions,
  Lang,
  LatLon,
  Maneuver,
  PlanOptions,
  RouteCapabilities,
  RouteEngine,
  RouteResult,
  RoundTripOptions,
  Waypoint,
} from "@roto-app/core/types";

/** What one engine call returns before `capabilities` is filled in by the caller (index.ts). */
export type EngineResult = Omit<RouteResult, "capabilities">;
