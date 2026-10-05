// OSM POI + closure import (plan §4.14, §4.15). Upserts `pois` rows by osmId with
// source='osm' and refreshes `closures` rows with source='osm'.
//
// Inputs are GeoJSONSeq files written by tiles/scripts/extract-pois.{sh,ps1} (pyosmium, one
// pass over the pbf). That writer emits {"@id","@type","tags","geometry"}; `osmium export -f
// geojsonseq` puts the same keys under `properties`, so both are read.
//
//   npx tsx src/seed/import-osm-pois.ts <pois.geojsonseq> [closures.geojsonseq]
//   npx tsx src/seed/import-osm-pois.ts ../../tiles/data/pois.geojsonseq ../../tiles/data/closures.geojsonseq
//
// Run from roto-app/packages/db; DATABASE_URL comes from the shell, not from .env.
// Safe to run twice: POIs upsert on the unique osm_id, closures are replaced in one
// transaction (`delete where source='osm'` + insert). source='seed' and source='user' rows
// are never read, updated or deleted - the POI upsert additionally carries
// `do update ... where source = 'osm'`, and the closure delete is scoped to source='osm'.
// ponytail: one-shot script, not a cron - the nightly refresh runs on the Valhalla VPS / CI
// (plan D7) and calls the protected import endpoint; this file is the manual equivalent.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { closures, hazards } from "../schema/hazards";
import { pois } from "../schema/pois";

type Tags = Record<string, string>;
type LonLat = [number, number];

const AMENITY_KIND: Record<string, string> = {
  fuel: "fuel",
  charging_station: "ev",
  hospital: "hospital",
  police: "police",
  restaurant: "food",
  cafe: "food",
  fast_food: "food",
};

const TOURISM_KIND: Record<string, string> = {
  hotel: "hotel",
  motel: "hotel",
  guest_house: "hotel",
  hostel: "hotel",
  camp_site: "camp",
  viewpoint: "viewpoint",
};

const SHOP_KIND: Record<string, string> = {
  motorcycle: "dealer",
  motorcycle_repair: "service",
};

// Meta allowlist: small routing/display-relevant subset, not the whole OSM tag soup.
const META_KEYS = new Set([
  "operator",
  "brand",
  "fee",
  "cuisine",
  "takeaway",
  "delivery",
  "beds",
  "rooms",
  "stars",
  "shop",
  "self_service",
  "capacity",
  "wheelchair",
  "internet_access",
  "outdoor_seating",
  "smoking",
  "addr:city",
  "addr:street",
  "addr:suburb",
  "camera:type",
  "direction",
]);

function pickMeta(tags: Tags): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags)) {
    if (META_KEYS.has(k) || k.startsWith("socket:") || k.startsWith("fuel:") || k.startsWith("charge:")) {
      meta[k] = v;
    }
  }
  return meta;
}

function kindFor(tags: Tags): string | null {
  // Speed cameras first: highway=speed_camera nodes and type=enforcement areas are the most
  // specific tag on the object, whatever else it carries.
  if (tags.highway === "speed_camera" || tags.type === "enforcement") return "speed_camera";
  if (tags.amenity && AMENITY_KIND[tags.amenity]) return AMENITY_KIND[tags.amenity]!;
  if (tags.tourism && TOURISM_KIND[tags.tourism]) return TOURISM_KIND[tags.tourism]!;
  if (tags.shop && SHOP_KIND[tags.shop]) return SHOP_KIND[tags.shop]!;
  return null;
}

function centroidOfRing(ring: LonLat[]): LonLat | null {
  // Shoelace centroid; a degenerate (zero-area) ring falls back to the mean vertex, which is
  // what a bbox centre would give for a straight polygon.
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    x += (x1 + x2) * cross;
    y += (y1 + y2) * cross;
  }
  if (twiceArea === 0) {
    const sum = ring.reduce((a, c) => [a[0] + c[0], a[1] + c[1]] as LonLat, [0, 0]);
    return [sum[0] / ring.length, sum[1] / ring.length];
  }
  return [x / (3 * twiceArea), y / (3 * twiceArea)];
}

function largestRing(polygons: LonLat[][]): LonLat[] | null {
  let best: LonLat[] | null = null;
  for (const poly of polygons) {
    if (!poly.length) continue;
    if (!best || poly.length > best.length) best = poly;
  }
  return best;
}

/**
 * One point for any GeoJSON geometry. Node POIs come through as Point; LK also maps fuel
 * stations, hospitals and speed-camera enforcement areas as ways/relations, and a POI row
 * needs a single lat/lon. Areas are reduced to their largest ring's centroid and flagged in
 * `meta` so a caller can tell an exact node position from a derived one.
 */
function representativePoint(geometry: { type?: string; coordinates?: unknown }): {
  point: LonLat;
  derived: boolean;
} | null {
  const coords = geometry.coordinates;
  if (!Array.isArray(coords) || !coords.length) return null;
  const asPoint = (v: unknown): LonLat | null =>
    Array.isArray(v) &&
    v.length >= 2 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
      ? [v[0] as number, v[1] as number]
      : null;
  const firstPoint = (): LonLat | null => {
    for (const c of coords as unknown[]) {
      const p = asPoint(c);
      if (p) return p;
    }
    return null;
  };

  switch (geometry.type) {
    case "Point": {
      const p = asPoint(coords);
      return p ? { point: p, derived: false } : null;
    }
    case "MultiPoint":
    case "LineString": {
      const p = firstPoint();
      return p ? { point: p, derived: true } : null;
    }
    case "MultiLineString": {
      const longest = (coords as unknown[])
        .filter(Array.isArray)
        .reduce<unknown[] | null>((a, l) => (l.length > (a?.length ?? 0) ? l : a), null);
      const p = longest ? asPoint(longest[Math.floor(longest.length / 2)]) : null;
      return p ? { point: p, derived: true } : null;
    }
    case "Polygon":
    case "MultiPolygon": {
      const polygons: LonLat[][] =
        geometry.type === "Polygon" ? [coords as unknown as LonLat[]] : (coords as LonLat[][]);
      const ring = largestRing(polygons);
      if (!ring) return null;
      const centroid = centroidOfRing(ring);
      return centroid ? { point: centroid, derived: true } : null;
    }
    default:
      return null;
  }
}

type Feature = {
  "@id"?: string;
  "@type"?: string;
  id?: string;
  type?: string;
  tags?: Tags;
  properties?: Tags & { tags?: Tags; "@id"?: string };
  geometry?: { type?: string; coordinates?: unknown };
};

/** `db.execute` on node-postgres hands back the raw pg QueryResult, not an array. */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return (result as { rows?: T[] } | null)?.rows ?? [];
}

function rowCountOf(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  const r = result as { rowCount?: number; rows?: unknown[] } | null;
  return r?.rowCount ?? r?.rows?.length ?? 0;
}

async function countBy(where: ReturnType<typeof sql>): Promise<number> {
  const [row] = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int as n from ${pois} ${where}`));
  return row?.n ?? 0;
}

async function* readJsonSeq(path: string): AsyncGenerator<Feature> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Number.POSITIVE_INFINITY });
  for await (const line of rl) {
    if (!line.trim()) continue;
    yield JSON.parse(line) as Feature;
  }
}

function tagsOf(feature: Feature): { tags: Tags; osmId: string | null } {
  const props = feature.properties ?? {};
  const tags: Tags = { ...props, ...(feature.tags ?? {}), ...(props.tags ?? {}) };
  const osmId = tags["@id"] ?? props["@id"] ?? feature["@id"] ?? feature.id ?? null;
  delete tags["@id"];
  return { tags, osmId: osmId ? String(osmId).replace(/^(osm:)?/, "") : null };
}

const poiInput = process.argv[2];
if (!poiInput) {
  console.error(
    "usage: npx tsx src/seed/import-osm-pois.ts <pois.geojsonseq> [closures.geojsonseq]",
  );
  process.exit(1);
}
const closureInput = process.argv[3];

const db = drizzle(process.env.DATABASE_URL || "");
const BATCH = 500;

const perKind = new Map<string, number>();
let inserted = 0;
let updated = 0;
let protectedRows = 0;
let skipped = 0;
let unnamed = 0;
let derived = 0;
let batch: (typeof pois.$inferInsert)[] = [];

async function flush() {
  if (!batch.length) return;
  const rows = batch.splice(0);
  // xmax = 0 on the returned row means the insert branch ran, anything else the update branch.
  const returned = await db
    .insert(pois)
    .values(rows)
    .onConflictDoUpdate({
      target: pois.osmId,
      set: {
        kind: sql`excluded.kind`,
        nameEn: sql`excluded.name_en`,
        nameSi: sql`excluded.name_si`,
        nameTa: sql`excluded.name_ta`,
        lat: sql`excluded.lat`,
        lon: sql`excluded.lon`,
        geom: sql`excluded.geom`,
        brand: sql`excluded.brand`,
        phone: sql`excluded.phone`,
        hours: sql`excluded.hours`,
        meta: sql`excluded.meta`,
        updatedAt: new Date(),
      },
      // Belt and braces: a row that is not ours is left exactly as it is.
      setWhere: sql`${pois.source} = 'osm'`,
    })
    .returning({ isNew: sql<boolean>`xmax = 0` });
  for (const row of returned) {
    if (row.isNew) inserted++;
    else updated++;
  }
  protectedRows += rows.length - returned.length;
}

for await (const feature of readJsonSeq(poiInput)) {
  const { tags, osmId } = tagsOf(feature);
  const kind = kindFor(tags);
  const where = representativePoint(feature.geometry ?? {});
  if (!kind || !where || !osmId) {
    skipped++;
    continue;
  }
  const [lon, lat] = where.point;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    skipped++;
    continue;
  }
  const nameEn = tags["name"] ?? tags["operator"] ?? tags["brand"] ?? kind;
  if (!tags["name"]) unnamed++;
  if (where.derived) derived++;
  const meta = pickMeta(tags);
  if (where.derived) meta["point"] = "centroid";
  perKind.set(kind, (perKind.get(kind) ?? 0) + 1);
  batch.push({
    kind,
    nameEn,
    // Every rider-facing name carries si/ta when OSM has it; callers pick by language.
    nameSi: tags["name:si"] ?? null,
    nameTa: tags["name:ta"] ?? null,
    lat,
    lon,
    geom: sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`,
    osmId,
    brand: tags["brand"] ?? tags["operator"] ?? null,
    source: "osm",
    verified: false,
    phone: tags["phone"] ?? tags["contact:phone"] ?? null,
    hours: tags["opening_hours"] ?? null,
    meta,
  });
  if (batch.length >= BATCH) await flush();
}
await flush();

const osmOnly = sql`where ${pois.source} = 'osm'`;
const siNames = await countBy(sql`${osmOnly} and ${pois.nameSi} is not null`);
const taNames = await countBy(sql`${osmOnly} and ${pois.nameTa} is not null`);
const totalOsm = await countBy(osmOnly);

console.log(`pois: ${inserted} inserted, ${updated} updated, ${protectedRows} left untouched (not source='osm')`);
console.log(`pois: ${skipped} skipped (no osmId, unknown kind, or unusable geometry), ${derived} placed on a derived (area) point`);
console.log("pois by kind:");
for (const [kind, n] of [...perKind.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${kind.padEnd(14)} ${n}`);
}
console.log(`pois with source='osm': ${totalOsm}, of which a si name: ${siNames}, a ta name: ${taNames}`);

if (closureInput) {
  // `closures` has no osm id column, so the OSM rows are replaced wholesale inside one
  // transaction. Scoped to source='osm': user and holiday closures are never touched.
  const rows: {
  geom: unknown;
  reason: string | null;
  note: string | null;
  source: string;
}[] = [];
  let closureSkipped = 0;
  for await (const feature of readJsonSeq(closureInput)) {
    const { tags } = tagsOf(feature);
    const geometry = feature.geometry;
    if (!geometry?.type || !Array.isArray(geometry.coordinates) || !geometry.coordinates.length) {
      closureSkipped++;
      continue;
    }
    const construction = tags["construction"];
    const reason =
      construction && construction !== "yes"
        ? construction
        : (tags["closure:reason"] ?? tags["note"] ?? "road construction (OSM highway=construction)");
    rows.push({
      geom: sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326)`,
      reason: reason.slice(0, 500),
      note: tags["start_date"] ? `from ${tags["start_date"]}` : null,
      source: "osm",
    });
  }
  await db.transaction(async (tx) => {
    const removed = await tx.execute(
      sql`delete from ${closures} where ${closures.source} = 'osm' returning id`,
    );
    const removedCount = rowCountOf(removed);
    for (let i = 0; i < rows.length; i += BATCH) {
      await tx.insert(closures).values(rows.slice(i, i + BATCH) as (typeof closures.$inferInsert)[]);
    }
    console.log(
      `closures: ${rows.length} inserted from OSM highway=construction, ${removedCount} stale osm rows removed`,
    );
  });
  if (closureSkipped) console.log(`closures: ${closureSkipped} skipped (no geometry)`);
}

const hazardRows = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int as n from ${hazards}`));
console.log(`hazards: ${hazardRows[0]?.n ?? 0} rows total`);
process.exit(0);
