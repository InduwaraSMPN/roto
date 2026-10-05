// Shared geo filter helpers for the POI / hazards / closures routers (plan §4.14, §4.15).
// PostGIS has been on since migration 0007; lat/lon columns stay the source of truth and every
// geom write is derived from them (ST_SetSRID(ST_MakePoint(lon, lat), 4326)).
// Conventions: geometry inputs are [lon, lat] (GeoJSON order); API inputs are { lat, lon }.
// Distances in meters go to PostGIS geography; the lat/lon bbox prefilters below only narrow
// the candidate set so the GIST index is used before the exact ST_DWithin check runs.
// ponytail: rows with NULL geom still match the bbox prefilter (pre-backfill safety) —
// migration 0008 backfilled geom, so this fallback costs one OR and keeps old rows visible.
import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/** [minLon, minLat, maxLon, maxLat]. */
export type Bbox = readonly [number, number, number, number];

/** GeoJSON-order coordinate. */
export type LonLat = readonly [number, number];

export function kmToDegLat(km: number): number {
  return km / 111.32;
}

export function kmToDegLon(km: number, atLat: number): number {
  const cos = Math.cos((atLat * Math.PI) / 180);
  return km / (111.32 * Math.max(cos, 0.2));
}

/** Tight bbox around a coordinate list, optionally padded by padDeg degrees. */
export function routeBbox(coords: readonly LonLat[], padDeg = 0): Bbox {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon - padDeg, minLat - padDeg, maxLon + padDeg, maxLat + padDeg];
}

/** "LINESTRING(lon lat, ...)" at 6dp (~0.1 m) for ST_GeomFromText(..., 4326). */
export function routeLineWkt(coords: readonly LonLat[]): string {
  const pts = coords.map(([lon, lat]) => `${lon.toFixed(6)} ${lat.toFixed(6)}`);
  return `LINESTRING(${pts.join(", ")})`;
}

/**
 * Evenly spaced indices into a list of `count` items, capped at `max`, always
 * including the first and last index. Used to fit long routes into the
 * alongRoute coord caps before sending (clients downsample; server re-checks).
 */
export function downsampleIndices(count: number, max: number): number[] {
  if (count <= 0 || max <= 0) return [];
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  if (max === 1) return [0];
  const out: number[] = [];
  for (let i = 0; i < max; i++) {
    out.push(Math.min(count - 1, Math.round((i * (count - 1)) / (max - 1))));
  }
  return [...new Set(out)];
}

/** Plain lat/lon bbox filter (no PostGIS needed). */
export function bboxWhere(latCol: SQLWrapper, lonCol: SQLWrapper, bbox: Bbox): SQL {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return sql`(${lonCol} >= ${minLon} AND ${lonCol} <= ${maxLon} AND ${latCol} >= ${minLat} AND ${latCol} <= ${maxLat})`;
}

/** ST_Intersects filter for tables with only a geom column (closures). */
export function bboxIntersects(geomCol: SQLWrapper, bbox: Bbox): SQL {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return sql`ST_Intersects(${geomCol}, ST_MakeEnvelope(${minLon}, ${minLat}, ${maxLon}, ${maxLat}, 4326))`;
}

function pointGeog(lon: number, lat: number): SQL {
  return sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography`;
}

/** "Within km of a point": degree-bbox prefilter + exact geography ST_DWithin. */
export function nearWhere(
  geomCol: SQLWrapper,
  latCol: SQLWrapper,
  lonCol: SQLWrapper,
  point: { lat: number; lon: number },
  km: number,
): SQL {
  const dLat = kmToDegLat(km);
  const dLon = kmToDegLon(km, point.lat);
  const pre = bboxWhere(latCol, lonCol, [point.lon - dLon, point.lat - dLat, point.lon + dLon, point.lat + dLat]);
  const meters = km * 1000;
  return sql`(${pre} AND (${geomCol} IS NULL OR ST_DWithin(${geomCol}::geography, ${pointGeog(point.lon, point.lat)}, ${meters})))`;
}

/** "Within bufferM of a route line": route-bbox prefilter + exact geography ST_DWithin. */
export function alongRouteWhere(
  geomCol: SQLWrapper,
  latCol: SQLWrapper,
  lonCol: SQLWrapper,
  coords: readonly LonLat[],
  bufferM: number,
): SQL {
  const padDeg = Math.max(kmToDegLat(bufferM / 1000), kmToDegLon(bufferM / 1000, 8));
  const pre = bboxWhere(latCol, lonCol, routeBbox(coords, padDeg));
  const line = sql`ST_GeomFromText(${routeLineWkt(coords)}, 4326)::geography`;
  return sql`(${pre} AND (${geomCol} IS NULL OR ST_DWithin(${geomCol}::geography, ${line}, ${bufferM})))`;
}

/** KNN ordering by distance to a point (GIST-backed `<->`; NULL geom sorts last). */
export function nearOrder(geomCol: SQLWrapper, lon: number, lat: number): SQL {
  return sql`${geomCol} <-> ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`;
}
