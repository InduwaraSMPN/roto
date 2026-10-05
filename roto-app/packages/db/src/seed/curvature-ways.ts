// Twisty-roads layer builder (plan §5.5). Scores OSM highway ways with core/curvature and
// upserts road_curvature(osmWayId, name, score, geom) for the martin `curvature` vector
// layer (styled >=300 fun, >=1000 best) and the curvy-bias job (§4.1).
//
// Input is the GeoJSONSeq written by tiles/scripts/extract-pois.{sh,ps1} (ways.geojsonseq:
// highway=primary|secondary|tertiary|unclassified ways with geometry).
//
//   npx tsx src/seed/curvature-ways.ts <ways.geojsonseq> [--dry-run] [--min-score=N]
//
// Run from roto-app/packages/db; DATABASE_URL comes from the shell, not from .env.
// Safe to run twice: every way upserts on the primary key osm_way_id.
//
// ponytail: only ways above MIN_SCORE (default 300, the plan's "fun" style threshold) are
// stored, so the table and the tiles stay small; lower it with --min-score=N to widen the
// layer. curvatureScore is an absolute sum of length x weight, not a per-km rate, so a long
// winding road outscores a short vicious one - fine for a layer, wrong for ranking.
// ponytail: road_curvature has a single `name` column (fixed by migration 0017), so si/ta
// road names from OSM have nowhere to go and are only counted in the run report. They need
// name_si/name_ta columns to be rider-facing; see the return notes.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { curvatureScore } from "@roto-app/core/curvature";
import { roadCurvature } from "../schema/curvature";

type LonLat = [number, number];

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const minScore = Number(args.find((a) => a.startsWith("--min-score="))?.split("=")[1] ?? 300);

if (!input) {
  console.error("usage: npx tsx src/seed/curvature-ways.ts <ways.geojsonseq> [--dry-run] [--min-score=N]");
  process.exit(1);
}
if (!Number.isFinite(minScore) || minScore < 0) {
  console.error(`--min-score must be a non-negative number, got ${minScore}`);
  process.exit(1);
}

const db = drizzle(process.env.DATABASE_URL || "");
const BATCH = 500;

const BUCKETS: [number, number][] = [
  [0, 100],
  [100, 300],
  [300, 600],
  [600, 1000],
  [1000, Number.POSITIVE_INFINITY],
];

function bucketOf(score: number): number {
  return BUCKETS.findIndex(([lo, hi]) => score >= lo && score < hi);
}

function coordAt(c: unknown): LonLat | null {
  if (!Array.isArray(c) || c.length < 2) return null;
  const [lon, lat] = c as [unknown, unknown];
  if (typeof lon !== "number" || typeof lat !== "number") return null;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return [lon, lat];
}

/**
 * One LineString per way. A way whose node refs have a gap is written as a MultiLineString by
 * the extractor, and the column is `geometry(LineString,4326)`; keeping the highest-scoring
 * part keeps the twisty stretch (which is what the layer is for) and drops the rest.
 */
function bestPart(geometry: { type?: string; coordinates?: unknown }): LonLat[] | null {
  const coords = geometry.coordinates;
  if (!Array.isArray(coords)) return null;
  if (geometry.type === "LineString") {
    const line = coords.map(coordAt).filter((c): c is LonLat => c !== null);
    return line.length >= 2 ? line : null;
  }
  if (geometry.type !== "MultiLineString") return null;
  let best: LonLat[] | null = null;
  let bestScore = -1;
  for (const part of coords as unknown[]) {
    const line = (part as unknown[]).map(coordAt).filter((c): c is LonLat => c !== null);
    if (line.length < 2) continue;
    const score = curvatureScore(line);
    if (score > bestScore) {
      bestScore = score;
      best = line;
    }
  }
  return best;
}

type Feature = {
  "@id"?: string;
  id?: string;
  tags?: Record<string, string>;
  properties?: Record<string, string> & { tags?: Record<string, string>; "@id"?: string };
  geometry?: { type?: string; coordinates?: unknown };
};

let upserted = 0;
let kept = 0;
let tooStraight = 0;
let unreadable = 0;
let multiPart = 0;
let keptPoints = 0;
let named = 0;
let namedSi = 0;
let namedTa = 0;
const histogram = new Array<number>(BUCKETS.length).fill(0);
const top: { id: string; name: string | null; score: number }[] = [];
let batch: (typeof roadCurvature.$inferInsert)[] = [];

async function flush() {
  if (!batch.length) return;
  const rows = batch.splice(0);
  await db
    .insert(roadCurvature)
    .values(rows)
    .onConflictDoUpdate({
      target: roadCurvature.osmWayId,
      set: { name: sql`excluded.name`, score: sql`excluded.score`, geom: sql`excluded.geom` },
    });
  upserted += rows.length;
  kept += rows.length;
}

const rl = createInterface({ input: createReadStream(input), crlfDelay: Number.POSITIVE_INFINITY });
for await (const line of rl) {
  if (!line.trim()) continue;
  let feature: Feature;
  try {
    feature = JSON.parse(line) as Feature;
  } catch {
    unreadable++;
    continue;
  }
  const props = feature.properties ?? {};
  const tags = { ...props, ...(feature.tags ?? {}), ...(props.tags ?? {}) };
  const osmWayId = String(feature["@id"] ?? props["@id"] ?? feature.id ?? "")
    .replace(/^(osm:)?/, "")
    .trim();
  const part = bestPart(feature.geometry ?? {});
  if (!osmWayId || !part) {
    unreadable++;
    continue;
  }
  if (feature.geometry?.type === "MultiLineString") multiPart++;
  const score = curvatureScore(part);
  histogram[bucketOf(score)] = (histogram[bucketOf(score)] ?? 0) + 1;
  if (score < minScore) {
    tooStraight++;
    continue;
  }
  const name = tags["name"] ?? tags["official_name"] ?? tags["ref"] ?? null;
  if (name) named++;
  if (tags["name:si"]) namedSi++;
  if (tags["name:ta"]) namedTa++;
  keptPoints += part.length;
  top.push({ id: osmWayId, name, score: Math.round(score) });
  if (dryRun) {
    kept++;
    continue;
  }
  batch.push({
    osmWayId,
    name,
    score,
    geom: sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify({ type: "LineString", coordinates: part })}), 4326)`,
  });
  if (batch.length >= BATCH) await flush();
}
if (!dryRun) await flush();

const label = dryRun ? " (dry run, nothing written)" : "";
console.log(`curvature: ${kept} ways at or above score ${minScore}${label}, ${tooStraight} below it, ${unreadable} skipped (no id or no geometry)`);
if (!dryRun) console.log(`curvature: ${upserted} rows upserted into road_curvature`);
console.log(`curvature: ${multiPart} multi-part ways (kept the highest-scoring segment), ${keptPoints} vertices kept`);
console.log("score distribution of all ways read:");
for (const [i, [lo, hi]] of BUCKETS.entries()) {
  const n = histogram[i] ?? 0;
  console.log(`  ${lo === 0 ? "   0" : String(lo).padStart(4)} .. ${hi === Number.POSITIVE_INFINITY ? "  inf" : String(hi).padEnd(5)} ${n}`);
}
console.log(`names: ${named} of the kept ways, name:si on ${namedSi}, name:ta on ${namedTa} (road_curvature has no si/ta columns)`);
if (top.length) {
  console.log("top 10 by score:");
  for (const t of top.sort((a, b) => b.score - a.score).slice(0, 10)) {
    console.log(`  ${String(t.score).padStart(7)}  ${t.id.padEnd(18)} ${t.name ?? "(unnamed)"}`);
  }
}
process.exit(0);
