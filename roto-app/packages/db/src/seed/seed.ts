// ponytail: one-shot seed, run: DATABASE_URL=... npx tsx src/seed/seed.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { pois } from "../schema/pois";
import { SEED_POIS } from "./pois.lk";

const db = drizzle(process.env.DATABASE_URL || "");
const existing = await db.select({ id: pois.id }).from(pois).limit(1);
if (existing.length) {
  console.log("pois already seeded,", existing.length > 0 ? "skipping" : "");
  process.exit(0);
}
await db.insert(pois).values(
  SEED_POIS.map((p) => ({ kind: p.kind, nameEn: p.nameEn, lat: p.lat, lon: p.lon, meta: { ...p.meta } })),
);
console.log(`seeded ${SEED_POIS.length} pois`);
process.exit(0);
