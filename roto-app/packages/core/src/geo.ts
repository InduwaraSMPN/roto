// Pure geo math: distance, bearing, projection, simplification, polyline decoding.
// No dependencies, no I/O. All angles in degrees unless noted; all distances in meters
// unless the function name says otherwise (e.g. lineLengthKm).
import type { LonLat } from "./types";

const EARTH_R_M = 6371000;
const DEG = Math.PI / 180;

const toRad = (deg: number) => deg * DEG;
const toDeg = (rad: number) => rad / DEG;

/** Great-circle distance between two lon/lat points, in meters. */
export function haversineM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_M * Math.asin(Math.sqrt(Math.min(1, s)));
}

/** Initial bearing from point 1 to point 2, degrees 0..360. */
export function bearing(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Point at `distM` meters from (lon, lat) along `bearingDeg` (0=north, 90=east). */
export function destination(lon: number, lat: number, bearingDeg: number, distM: number): LonLat {
  const delta = distM / EARTH_R_M;
  const theta = toRad(bearingDeg);
  const phi1 = toRad(lat);
  const lambda1 = toRad(lon);
  const phi2 = Math.asin(Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta));
  const lambda2 =
    lambda1 +
    Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(phi1), Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2));
  return [toDeg(lambda2), toDeg(phi2)];
}

/**
 * Local equirectangular projection to meters, centered on (lon0, lat0). Good to well under
 * 1% error for the short (<50 km) segments this module is used on — a full geodesic isn't
 * needed for nearest-point-on-line or curvature radius work.
 */
function projectM(lon: number, lat: number, lon0: number, lat0: number): { x: number; y: number } {
  const cosLat0 = Math.cos(toRad(lat0));
  return {
    x: toRad(lon - lon0) * EARTH_R_M * cosLat0,
    y: toRad(lat - lat0) * EARTH_R_M,
  };
}

function unprojectM(x: number, y: number, lon0: number, lat0: number): LonLat {
  const cosLat0 = Math.cos(toRad(lat0));
  return [lon0 + toDeg(x / (EARTH_R_M * cosLat0)), lat0 + toDeg(y / EARTH_R_M)];
}

/** Distance from a point to a segment, in meters, plus the fraction `t` (0..1) along the segment of the closest point. */
export function pointToSegmentM(
  lon: number,
  lat: number,
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): { distM: number; t: number; point: LonLat } {
  const lat0 = (lat1 + lat2) / 2;
  const lon0 = (lon1 + lon2) / 2;
  const p = projectM(lon, lat, lon0, lat0);
  const a = projectM(lon1, lat1, lon0, lat0);
  const b = projectM(lon2, lat2, lon0, lat0);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  let t = lenSq > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  const distM = Math.hypot(p.x - cx, p.y - cy);
  return { distM, t, point: unprojectM(cx, cy, lon0, lat0) };
}

export type NearestOnLine = {
  /** Index of the segment start (coords[index] -> coords[index + 1]). */
  index: number;
  distM: number;
  point: LonLat;
  /** Fraction (0..1) along that segment. */
  t: number;
  /** Cumulative meters from the start of the line to the projected point. */
  alongM: number;
};

/** Nearest point on a polyline to (lon, lat). O(n) — fine for route-length lines at 1 Hz. */
export function nearestOnLine(coords: LonLat[], lon: number, lat: number): NearestOnLine | null {
  if (coords.length < 2) return null;
  let best: NearestOnLine | null = null;
  let cumulative = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    if (!a || !b) continue;
    const segLenM = haversineM(a[0], a[1], b[0], b[1]);
    const hit = pointToSegmentM(lon, lat, a[0], a[1], b[0], b[1]);
    if (!best || hit.distM < best.distM) {
      best = { index: i, distM: hit.distM, point: hit.point, t: hit.t, alongM: cumulative + hit.t * segLenM };
    }
    cumulative += segLenM;
  }
  return best;
}

/** Total length of a polyline, in kilometers. */
export function lineLengthKm(coords: LonLat[]): number {
  let m = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    if (a && b) m += haversineM(a[0], a[1], b[0], b[1]);
  }
  return m / 1000;
}

/** `[minLon, minLat, maxLon, maxLat]`. */
export function bbox(coords: LonLat[]): [number, number, number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const c of coords) {
    if (!c) continue;
    const [lon, lat] = c;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

// ponytail: 20-line polyline decoder, not a new dep — moved from packages/api/src/lib/routing.ts.
/** Decodes a Google/Valhalla-style encoded polyline (default precision 6, i.e. polyline6). */
export function decodePolyline6(str: string, precision = 6): LonLat[] {
  let lat = 0;
  let lon = 0;
  let i = 0;
  const out: LonLat[] = [];
  const f = 10 ** precision;
  while (i < str.length) {
    let b = 0;
    let shift = 0;
    let res = 0;
    do {
      b = str.charCodeAt(i++) - 63;
      res |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += res & 1 ? ~(res >> 1) : res >> 1;
    b = 0;
    shift = 0;
    res = 0;
    do {
      b = str.charCodeAt(i++) - 63;
      res |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lon += res & 1 ? ~(res >> 1) : res >> 1;
    out.push([lon / f, lat / f]);
  }
  return out;
}

/** Perpendicular distance in meters from a point to the infinite line through a/b (used by simplify). */
function perpendicularDistM(p: LonLat, a: LonLat, b: LonLat): number {
  return pointToSegmentM(p[0], p[1], a[0], a[1], b[0], b[1]).distM;
}

/** Douglas-Peucker line simplification. `toleranceM` is the max perpendicular deviation allowed. */
export function simplify(coords: LonLat[], toleranceM = 5): LonLat[] {
  if (coords.length <= 2) return coords;
  const keep = new Uint8Array(coords.length);
  keep[0] = 1;
  keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length) {
    const next = stack.pop();
    if (!next) break;
    const [start, end] = next;
    const a = coords[start];
    const b = coords[end];
    if (!a || !b || end - start < 2) continue;
    let maxDist = -1;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const p = coords[i];
      if (!p) continue;
      const d = perpendicularDistM(p, a, b);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > toleranceM && maxIdx > -1) {
      keep[maxIdx] = 1;
      stack.push([start, maxIdx], [maxIdx, end]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}
