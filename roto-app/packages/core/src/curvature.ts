// Curvature scoring, ported from the bucket/weight approach of adamfranco/curvature
// (circumradius per 3-point window; https://github.com/adamfranco/curvature).
// Used to: rank Valhalla alternates by curvy preference, rank round-trip loop candidates,
// and drive the native corner assistant (upcomingCurves).
import { bearing, haversineM } from "./geo";
import type { LonLat } from "./types";

/** Circumradius (meters) of the triangle through three points, via side lengths a/b/c (Heron's-style formula). */
function circumRadiusM(a: number, b: number, c: number): number {
  if (!(a > 0 && b > 0 && c > 0)) return 10000;
  const divider = Math.sqrt(Math.abs((a + b + c) * (b + c - a) * (c + a - b) * (a + b - c)));
  if (divider === 0) return 10000;
  return (a * b * c) / divider;
}

// ponytail: bucket edges (1750/175/100/30) are from the plan's adamfranco/curvature research;
// the upstream repo's exact weight table for radius < 30m wasn't independently re-verified
// (only the circumradius formula in radiusmath.py was), so the <30 weight is our extrapolation
// of the doubling pattern. Revisit against curvature.py's highway/level tables if scores look off.
const CURVATURE_BUCKETS: { minRadiusM: number; weight: number }[] = [
  { minRadiusM: 1750, weight: 0 },
  { minRadiusM: 175, weight: 1 },
  { minRadiusM: 100, weight: 2 },
  { minRadiusM: 30, weight: 4 },
  { minRadiusM: 0, weight: 6 },
];

function weightForRadius(radiusM: number): number {
  for (const bucket of CURVATURE_BUCKETS) {
    if (radiusM >= bucket.minRadiusM) return bucket.weight;
  }
  return 0;
}

export type CornerSegment = {
  /** Index of the middle point of the 3-point window. */
  index: number;
  radiusM: number;
  weight: number;
  /** Length (m) attributed to this window: half the distance to each neighbor. */
  lengthM: number;
};

/** Per-point curvature weight along a line. Straight lines (radius >= 1750m) get 0. */
export function curvatureSegments(coords: LonLat[]): CornerSegment[] {
  const out: CornerSegment[] = [];
  for (let i = 1; i < coords.length - 1; i++) {
    const p0 = coords[i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    if (!p0 || !p1 || !p2) continue;
    const a = haversineM(p1[0], p1[1], p2[0], p2[1]);
    const b = haversineM(p0[0], p0[1], p2[0], p2[1]);
    const c = haversineM(p0[0], p0[1], p1[0], p1[1]);
    const radiusM = circumRadiusM(a, b, c);
    const weight = weightForRadius(radiusM);
    out.push({ index: i, radiusM, weight, lengthM: (a + c) / 2 });
  }
  return out;
}

/**
 * Total curvature score for a line: sum of (segment length x weight). Split points where a
 * straight run exceeds 2.4 km are not enforced here (that's a route-splitting concern, not
 * scoring) — callers wanting per-corner splits should use `segmentCorners`.
 */
export function curvatureScore(coords: LonLat[]): number {
  return curvatureSegments(coords).reduce((sum, s) => sum + s.lengthM * s.weight, 0);
}

const STRAIGHT_SPLIT_M = 2400;

export type Corner = {
  startIdx: number;
  endIdx: number;
  /** Peak lean-worthiness of the corner: the smallest radius seen inside it. */
  minRadiusM: number;
  lengthM: number;
  /** Corner direction: sign of the net heading change, "left" | "right" | "straight". */
  direction: "left" | "right" | "straight";
};

/**
 * Splits a line into corners vs straights (straights > STRAIGHT_SPLIT_M dropped), used by the
 * native ride-detail lean/g charts (segmentCorners over recorded samples) and the corner
 * assistant's "upcoming curve" lookups.
 */
export function segmentCorners(coords: LonLat[]): Corner[] {
  const segs = curvatureSegments(coords);
  const corners: Corner[] = [];
  let current: { start: number; end: number; minR: number; lenM: number } | null = null;
  let straightRunM = 0;

  const flush = () => {
    if (!current) return;
    const a = coords[current.start];
    const b = coords[current.end];
    let direction: Corner["direction"] = "straight";
    if (a && b) {
      const brg = bearing(a[0], a[1], b[0], b[1]);
      // crude turn-side heuristic from endpoint bearing vs entry bearing
      const entry = coords[Math.max(0, current.start - 1)];
      if (entry) {
        const inBrg = bearing(entry[0], entry[1], a[0], a[1]);
        const delta = ((brg - inBrg + 540) % 360) - 180;
        direction = delta > 3 ? "right" : delta < -3 ? "left" : "straight";
      }
    }
    corners.push({ startIdx: current.start, endIdx: current.end, minRadiusM: current.minR, lengthM: current.lenM, direction });
    current = null;
  };

  for (const s of segs) {
    if (s.weight > 0) {
      straightRunM = 0;
      if (!current) current = { start: s.index, end: s.index, minR: s.radiusM, lenM: 0 };
      current.end = s.index;
      current.minR = Math.min(current.minR, s.radiusM);
      current.lenM += s.lengthM;
    } else {
      straightRunM += s.lengthM;
      if (current && straightRunM > STRAIGHT_SPLIT_M) flush();
      else if (current) current.lenM += s.lengthM;
    }
  }
  flush();
  return corners;
}

/**
 * Corners ahead of the rider within `aheadM`, for the predictive corner assistant.
 * `fromIdx` is the current nearest-line index (from `geo.nearestOnLine`).
 */
export function upcomingCurves(coords: LonLat[], fromIdx: number, aheadM: number): Corner[] {
  const corners = segmentCorners(coords);
  let cumulative = 0;
  const distAt = new Map<number, number>();
  for (let i = fromIdx; i < coords.length - 1; i++) {
    distAt.set(i, cumulative);
    const a = coords[i];
    const b = coords[i + 1];
    if (a && b) cumulative += haversineM(a[0], a[1], b[0], b[1]);
  }
  return corners.filter((c) => {
    if (c.startIdx < fromIdx) return false;
    const d = distAt.get(c.startIdx);
    return d !== undefined && d <= aheadM;
  });
}
