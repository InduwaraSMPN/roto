// Round-trip ("loop") generation. B15 fix: the old roundTripPoints used a flat km/111 degrees-
// per-km approximation for BOTH lat and lon, which is wrong for longitude (a degree of longitude
// shrinks by cos(latitude)) — loops came out as ovals and the total distance was off. `destination`
// from core/geo is the proper spherical formula and needs no manual cos(lat) correction at all.
import { destination } from "@roto-app/core/geo";
import { curvatureScore } from "@roto-app/core/curvature";
import type { EngineResult, LatLon, PlanOptions, RoundTripOptions } from "./types";

/** Deterministic PRNG (mulberry32) so a `seed` reproduces the same "random" starting bearing. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A closed triangle loop: center -> 3 points at `legKm` along `bearings` -> back to center. */
export function roundTripPoints(center: LatLon, legKm: number, bearings: number[]): LatLon[] {
  const legM = legKm * 1000;
  return [
    center,
    ...bearings.map((b) => {
      const [lon, lat] = destination(center.lon, center.lat, b, legM);
      return { lat, lon };
    }),
    center,
  ];
}

export type RoundTripResult<T extends EngineResult = EngineResult> = { best: T; alternatives: T[] };

const CONCURRENCY = 3;

/**
 * Plans `n` rotated triangle-loop candidates around `center`, ranks them by curvature score for
 * the requested `curvy`, and returns the best plus the rest as "Shuffle" alternatives. Each
 * candidate is planned through `planFn` (the same engine chain as regular planning — Valhalla ->
 * BRouter -> OSRM — injected by index.ts to avoid a circular import). Generic over `T` so a
 * `planFn` returning the full `RouteResult` (with `capabilities`) keeps that shape on the way out,
 * instead of widening to the bare `EngineResult`.
 */
export async function roundTripCandidates<T extends EngineResult>(
  opts: RoundTripOptions,
  planFn: (o: PlanOptions) => Promise<T>,
  n = 6,
): Promise<RoundTripResult<T>> {
  const { center, km, curvy, avoid, direction, seed } = opts;
  const rand = mulberry32(seed ?? Math.floor(Math.random() * 2 ** 31));
  const baseBearing = direction ?? rand() * 360;
  const legKm = km / 3;

  const candidatePoints = Array.from({ length: n }, (_, i) => {
    const rotate = baseBearing + (i * 360) / n;
    const bearings = [rotate, rotate + 120, rotate + 240].map((b) => ((b % 360) + 360) % 360);
    return roundTripPoints(center, legKm, bearings);
  });

  const results: (T | null)[] = [];
  for (let i = 0; i < candidatePoints.length; i += CONCURRENCY) {
    const batch = candidatePoints.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((points) =>
        planFn({ waypoints: points.map((p) => ({ lat: p.lat, lon: p.lon })), curvy, avoid }).catch(() => null),
      ),
    );
    results.push(...batchResults);
  }

  const scored = results
    .map((result) => (result ? { result, score: curvatureScore(result.coords) } : null))
    .filter((x): x is { result: T; score: number } => x !== null);

  if (!scored.length) throw new Error("Could not plan any round-trip candidate");
  scored.sort((a, b) => (curvy >= 0.5 ? b.score - a.score : a.score - b.score));

  const [bestEntry, ...rest] = scored;
  // scored.length > 0 was just checked, so bestEntry is defined; this satisfies noUncheckedIndexedAccess.
  const best = bestEntry ?? scored[0];
  if (!best) throw new Error("Could not plan any round-trip candidate");
  return { best: best.result, alternatives: rest.map((r) => r.result) };
}
