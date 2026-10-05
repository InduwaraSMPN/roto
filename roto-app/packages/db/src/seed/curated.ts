// ponytail: one-shot generator — geometry from OUR Valhalla, needs VALHALLA_URL set
// run: VALHALLA_URL=http://localhost:8002/route DATABASE_URL=... npx tsx src/seed/curated.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { planRoute } from "@roto-app/api/lib/routing";
import { curatedRoutes } from "../schema/curated";
import { LK_CLASSICS } from "./curated.lk";

const db = drizzle(process.env.DATABASE_URL || "");
const existing = await db.select({ id: curatedRoutes.id }).from(curatedRoutes).limit(1);
if (existing.length) {
  console.log("curated already seeded, skipping");
  process.exit(0);
}
for (const r of LK_CLASSICS) {
  const planned = await planRoute([r.from, ...(r.via ?? []), r.to], r.curvy);
  // tags/bestSeason ride along in curated.lk.ts until the §4.9 migration adds those columns;
  // only currently-typed columns are inserted so this keeps compiling either way.
  await db.insert(curatedRoutes).values({
    nameEn: r.nameEn,
    nameSi: r.nameSi,
    nameTa: r.nameTa,
    region: r.region,
    difficulty: r.difficulty,
    distanceKm: Math.round(planned.km * 10) / 10,
    coords: planned.coords,
  });
  console.log(`seeded ${r.nameEn}: ${planned.engine} ${planned.km.toFixed(0)}km`);
}
process.exit(0);
