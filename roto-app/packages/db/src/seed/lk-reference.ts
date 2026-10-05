// Local LK reference data: Poya days and the standing challenges.
//
// The rider-facing source of truth for holidays is Calendarific (server cron, plan §5.2), so
// this file does NOT invent public holidays and does not overwrite what the cron wrote. It
// only fills the two things that are ours to define:
//   1. Poya days for the year, computed locally with core/holidays (Meeus full moons). The
//      cron is the authority; these rows exist so the planner can say "Poya day" offline and
//      so a rider who has never synced still gets the warning. core/holidays itself notes the
//      Meeus calculation can drift by a day near midnight — re-running the cron corrects it.
//   2. The standing challenges, including the monthly 500 km the plan asks for as seeded.
//
// Run from packages/db:  npx tsx src/seed/lk-reference.ts
// Safe to run repeatedly — every write is an upsert keyed on a stable natural key.
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { fullMoonsUtc } from "@roto-app/core/holidays";

import { challenges } from "../schema/challenges";
import { holidays } from "../schema/holidays";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required (apps/server/.env)");

const client = new pg.Client({ connectionString: url });
await client.connect();
const db = drizzle(client);

const year = Number(process.env.LK_SEED_YEAR ?? new Date().getUTCFullYear());
const months = [
  "ජනවාරි",
  "පෙබරවාරි",
  "මාර්තු",
  "අප්‍රේල්",
  "මැයි",
  "ජූනි",
  "ජූලි",
  "අගෝස්තු",
  "සැප්තැම්බර්",
  "ඔක්තෝබර්",
  "නොවැම්බර්",
  "දෙසැම්බර්",
] as const;

// Poya: one row per full moon. `isPoya` in core compares against the same Meeus dates, so
// the row and the runtime check agree with each other.
const fullMoons = fullMoonsUtc(year);
const poyaRows = fullMoons.map((d) => {
  const iso = d.toISOString().slice(0, 10);
  return {
    date: iso,
    nameEn: "Poya Full Moon Poya Day",
    nameSi: "පූජා දින",
    nameTa: "පූජා දිනය",
    kind: "poya",
    // Overwritten by the Calendarific cron when it runs, which is the authoritative source.
    source: "meeus-offline",
  };
});

// Challenges: the standing monthly 500 km plus a quarterly distance one. km tallies are
// derived on ride sync (challenges router), so only the definition rows are seeded.
const challengeRows = Array.from({ length: 12 }, (_, i) => {
  const start = new Date(Date.UTC(year, i, 1));
  const end = new Date(Date.UTC(year, i + 1, 0));
  return {
    slug: `monthly-500-${year}-${String(i + 1).padStart(2, "0")}`,
    nameEn: `Monthly 500 km — ${months[i]}`,
    nameSi: `මාසික කිම 500 — ${months[i]}`,
    nameTa: `மாதாந்திர 500 கி.மீ — ${months[i]}`,
    kind: "distance",
    target: 500,
    startsAt: start,
    endsAt: end,
  };
});

const insertedPoya = await db
  .insert(holidays)
  .values(poyaRows)
  .onConflictDoNothing({ target: holidays.date })
  .returning({ date: holidays.date });
const insertedChallenges = await db
  .insert(challenges)
  .values(challengeRows)
  .onConflictDoNothing({ target: challenges.slug })
  .returning({ slug: challenges.slug });

const { rows } = await client.query(
  "select source, count(*)::int as n from holidays group by source order by n desc",
);
console.log(`year ${year}: poya inserted ${insertedPoya.length}, challenges inserted ${insertedChallenges.length}`);
for (const r of rows) console.log(`  holidays ${r.source}: ${r.n}`);

await client.end();
