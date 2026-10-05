// Shared geo/route types for web, native and the API. Pure data shapes only — no logic here.

/** `{lat, lon}` — used at API boundaries (tRPC inputs/outputs, DB rows). */
export type LatLon = { lat: number; lon: number };

/** `[lon, lat]` — GeoJSON coordinate order, used for every line/geometry. */
export type LonLat = [number, number];

export type WaypointKind = "break" | "via" | "through";

export type Waypoint = {
  lat: number;
  lon: number;
  kind?: WaypointKind;
  name?: string;
  /** Degrees 0-360. Set on the first waypoint when rerouting mid-ride. */
  heading?: number;
};

export type Lang = "en" | "si" | "ta";

export type RideMode = "fast" | "balanced" | "curvy" | "extra";

/** curvy value (0..1) each mode maps to when the UI offers presets instead of a raw slider. */
export const RIDE_MODE_CURVY: Record<RideMode, number> = {
  fast: 0,
  balanced: 0.35,
  curvy: 0.7,
  extra: 1,
};

export type AvoidOptions = {
  tolls?: boolean;
  ferries?: boolean;
  unpaved?: boolean;
  /** Highways are already banned outright for motorcycles (LK expressway ban) — this only affects trunk/primary preference. */
  highways?: boolean;
};

export type RouteEngine = "valhalla" | "brouter" | "osrm" | "gps";

/**
 * Valhalla maneuver `type` values (numeric, from the Valhalla turn-by-turn API reference).
 * Valhalla is the canonical engine: BRouter/OSRM maneuvers are normalized into this set on the way in.
 */
export const ManeuverType = {
  None: 0,
  Start: 1,
  StartRight: 2,
  StartLeft: 3,
  Destination: 4,
  DestinationRight: 5,
  DestinationLeft: 6,
  Becomes: 7,
  Continue: 8,
  SlightRight: 9,
  Right: 10,
  SharpRight: 11,
  UturnRight: 12,
  UturnLeft: 13,
  SharpLeft: 14,
  Left: 15,
  SlightLeft: 16,
  RampStraight: 17,
  RampRight: 18,
  RampLeft: 19,
  ExitRight: 20,
  ExitLeft: 21,
  StayStraight: 22,
  StayRight: 23,
  StayLeft: 24,
  Merge: 25,
  RoundaboutEnter: 26,
  RoundaboutExit: 27,
  FerryEnter: 28,
  FerryExit: 29,
  Transit: 30,
  TransitTransfer: 31,
  TransitRemainOn: 32,
  TransitConnectionStart: 33,
  TransitConnectionTransfer: 34,
  TransitConnectionDestination: 35,
  PostTransitConnectionDestination: 36,
  MergeRight: 37,
  MergeLeft: 38,
  ElevatorEnter: 39,
  StepsEnter: 40,
  EscalatorEnter: 41,
  BuildingEnter: 42,
  BuildingExit: 43,
} as const;

export type ManeuverTypeValue = (typeof ManeuverType)[keyof typeof ManeuverType];

export type Maneuver = {
  /** Valhalla maneuver type number (see `ManeuverType`). */
  type: number;
  /** English instruction as returned by the engine (Valhalla/OSRM). Always present, even when empty capability. */
  instruction: string;
  /** Valhalla `verbal_pre_transition_instruction` — English voice prefers this over `instruction`. */
  verbalPre?: string;
  /** Valhalla `verbal_post_transition_instruction`. */
  verbalPost?: string;
  streets: string[];
  lengthKm: number;
  timeS: number;
  beginIdx: number;
  endIdx: number;
  /** Roundabout exit ordinal (1-based) when `type` is RoundaboutEnter/Exit. */
  exitCount?: number;
  /** Highway exit number/sign, when present. */
  exitNumber?: string;
};

export type ElevationProfile = {
  /** Cumulative distance in meters, aligned 1:1 with `heightM`. */
  distM: number[];
  heightM: number[];
};

export type RouteCapabilities = {
  maneuvers: boolean;
  elevation: boolean;
  speedLimits: boolean;
  surface: boolean;
};

export type RouteResult = {
  coords: LonLat[];
  km: number;
  min: number;
  engine: RouteEngine;
  maneuvers: Maneuver[];
  elevation?: ElevationProfile;
  capabilities: RouteCapabilities;
};

/** One GPS fix recorded during a ride. Kept compact for local DB storage and sync. */
export type RideSample = {
  /** ms since epoch. */
  t: number;
  lon: number;
  lat: number;
  /** m/s. */
  spd?: number;
  /** meters. */
  ele?: number;
  /** degrees, DeviceMotion gamma-derived lean angle. */
  lean?: number;
};

export type PlanOptions = {
  waypoints: Waypoint[];
  /** 0 (fastest) .. 1 (most twisty). */
  curvy: number;
  avoid?: AvoidOptions;
  /** Degrees 0-360, applied to the first waypoint (reroute-with-heading). */
  heading?: number;
  /** 0-2 alternates; only honored when there are exactly two locations. */
  alternates?: number;
  elevation?: boolean;
  lang?: Lang;
};

export type RoundTripOptions = {
  center: LatLon;
  /** Target loop distance, km, 5..600. */
  km: number;
  /** Compass degrees 0-359, or omitted for "any". */
  direction?: number;
  curvy: number;
  avoid?: AvoidOptions;
  seed?: number;
};
