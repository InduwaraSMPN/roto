// Elephant-corridor hazard seeds (plan §5.2/§4.15). Permanent `animal_elephant` zones
// (expiresAt NULL) on stretches where night crossings are routine. Coordinates are
// approximate corridor midpoints — the note on every row says to verify on a device pass
// before trusting them for voice alerts.
//
// Run from roto-app/packages/db (DATABASE_URL comes from the shell, not from .env):
//   npx tsx src/seed/hazards.lk.ts
// ponytail: one-shot seed; corridor edits after verification go through hazards.report/vote,
// not another seed edit.
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { hazards } from "../schema/hazards";

const CORRIDORS = [
  {
    name: "Habarana–Dambulla (A6, Habarana forest stretch)",
    lat: 8.02,
    lon: 80.773,
  },
  {
    name: "Minneriya (A11, Habarana–Polonnaruwa, park boundary)",
    lat: 8.03,
    lon: 80.899,
  },
  {
    name: "Buttala–Kataragama (Yala buffer zone)",
    lat: 6.47,
    lon: 81.29,
  },
  {
    name: "Udawalawe (A18, Thanamalwila road, reservoir stretch)",
    lat: 6.44,
    lon: 80.895,
  },
] as const;

const db = drizzle(process.env.DATABASE_URL || "");
const existing = await db
  .select({ id: hazards.id })
  .from(hazards)
  .where(sql`${hazards.kind} = 'animal_elephant'`)
  .limit(1);
if (existing.length) {
  console.log("elephant corridors already seeded, skipping");
  process.exit(0);
}
for (const c of CORRIDORS) {
  await db.insert(hazards).values({
    kind: "animal_elephant",
    lat: c.lat,
    lon: c.lon,
    geom: sql`ST_SetSRID(ST_MakePoint(${c.lon}, ${c.lat}), 4326)`,
    note: `${c.name} — approx corridor midpoint, verify on device pass`,
    reporterId: null,
    expiresAt: null,
    status: "active",
  });
}
console.log(`seeded ${CORRIDORS.length} elephant corridors`);
process.exit(0);
