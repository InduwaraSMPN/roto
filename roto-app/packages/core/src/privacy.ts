// ponytail: trim ends (like ESR) — a zone in the MIDDLE of a ride is kept, only start/end masked.
// Ported from apps/native/lib/privacy.ts so web and native share one implementation (A1).
import { haversineM } from "./geo";
import type { LonLat } from "./types";

export type Zone = { lat: number; lon: number; radiusM: number };

export const insideAny = (lon: number, lat: number, zones: Zone[]): boolean =>
  zones.some((z) => haversineM(lon, lat, z.lon, z.lat) <= z.radiusM);

/** Trims leading/trailing points that fall inside any zone. A zone crossed mid-route is left alone. */
export function trimEnds(coords: LonLat[], zones: Zone[]): LonLat[] {
  if (!zones.length || coords.length < 2) return coords;
  let start = 0;
  let end = coords.length;
  while (start < end) {
    const p = coords[start];
    if (!p || !insideAny(p[0], p[1], zones)) break;
    start++;
  }
  while (end > start + 1) {
    const p = coords[end - 1];
    if (!p || !insideAny(p[0], p[1], zones)) break;
    end--;
  }
  return coords.slice(start, end);
}

/**
 * Optional mid-ride masking (§4.17): replaces points inside any zone with the zone center,
 * instead of only trimming the ends. Used when a rider wants a fuel stop or home mid-route
 * hidden from a shared/exported track, at the cost of a visible "teleport" in the line.
 */
export function maskInside(coords: LonLat[], zones: Zone[]): LonLat[] {
  if (!zones.length) return coords;
  return coords.map((p) => {
    if (!p) return p;
    const hit = zones.find((z) => haversineM(p[0], p[1], z.lon, z.lat) <= z.radiusM);
    return hit ? ([hit.lon, hit.lat] as LonLat) : p;
  });
}
