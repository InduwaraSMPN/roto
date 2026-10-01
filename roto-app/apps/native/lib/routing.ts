// Thin re-export of @roto-app/core/types (A1). The bespoke native `RouteResult` (just
// `{coords, km, min, engine, steps?}`) is gone — the app now uses the same `RouteResult` shape
// the server's route router returns (`{coords, km, min, engine, maneuvers, elevation?,
// capabilities}`), so `trpc.route.plan`/`roundTrip` results need no reshaping before going into
// state. See packages/api/src/lib/routing.ts for the matching server-side re-export shim.
export {
  ManeuverType,
  RIDE_MODE_CURVY,
} from "@roto-app/core/types";
export type {
  AvoidOptions,
  ElevationProfile,
  Lang,
  LatLon,
  LonLat,
  Maneuver,
  ManeuverTypeValue,
  PlanOptions,
  RideMode,
  RideSample,
  RouteCapabilities,
  RouteEngine,
  RouteResult,
  RoundTripOptions,
  Waypoint,
  WaypointKind,
} from "@roto-app/core/types";
