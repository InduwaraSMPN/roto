// ponytail: one-shot generator — geometry from OUR Valhalla, needs VALHALLA_URL set
// run: VALHALLA_URL=http://localhost:8002/route DATABASE_URL=... npx tsx src/seed/curated.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { planRoute } from "@roto-app/api/lib/routing";
import { curatedRoutes } from "../schema/curated";

const ROUTES: { nameEn: string; region: string; difficulty: string; from: { lat: number; lon: number }; to: { lat: number; lon: number } }[] = [
  { nameEn: "Kandy → Nuwara Eliya hill run", region: "hill-country", difficulty: "hard", from: { lat: 7.2906, lon: 80.6337 }, to: { lat: 6.9497, lon: 80.7891 } },
  { nameEn: "Colombo → Galle coastal", region: "south-coast", difficulty: "easy", from: { lat: 6.9271, lon: 79.8612 }, to: { lat: 6.0535, lon: 80.221 } },
  { nameEn: "Nuwara Eliya → Ella highlands", region: "hill-country", difficulty: "hard", from: { lat: 6.9497, lon: 80.7891 }, to: { lat: 6.8667, lon: 81.0466 } },
  { nameEn: "Dambulla → Anuradhapura heritage", region: "cultural-triangle", difficulty: "medium", from: { lat: 7.856, lon: 80.6491 }, to: { lat: 8.3114, lon: 80.4037 } },
  { nameEn: "Ella → Wellawaya valley", region: "hill-country", difficulty: "medium", from: { lat: 6.8667, lon: 81.0466 }, to: { lat: 6.7367, lon: 81.1046 } },
];

const db = drizzle(process.env.DATABASE_URL || "");
const existing = await db.select({ id: curatedRoutes.id }).from(curatedRoutes).limit(1);
if (existing.length) {
  console.log("curated already seeded, skipping");
  process.exit(0);
}
for (const r of ROUTES) {
  const planned = await planRoute([r.from, r.to], 0.8);
  await db.insert(curatedRoutes).values({
    nameEn: r.nameEn,
    region: r.region,
    difficulty: r.difficulty,
    distanceKm: Math.round(planned.km * 10) / 10,
    coords: planned.coords,
  });
  console.log(`seeded ${r.nameEn}: ${planned.engine} ${planned.km.toFixed(0)}km`);
}
process.exit(0);
