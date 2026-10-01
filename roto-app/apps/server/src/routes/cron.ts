import { sql } from "drizzle-orm";
import { Hono } from "hono";

import { isMissingTable, rowsOf } from "../lib/rate-limit";
import { getDb } from "../services";

// ponytail: yearly LK holiday seed from Calendarific (plan §5.2), run by Vercel
// Cron daily — the year-check below makes it a no-op once next year is seeded.
// Vercel Hobby allows daily crons only, hence `0 2 * * *` in vercel.json rather
// than a true once-a-year schedule.
// Calendarific stays the source of truth; @roto-app/core/holidays fullMoonsUtc
// (Meeus) is only the offline Poya cross-check on native — it can drift a day
// near midnight, so the server never writes Meeus dates into this table.
// nameSi/nameTa are left null: Calendarific returns English names only, and
// trilingual holiday names need native-speaker review (repo invariant) before
// they ship to riders.

type CalendarificHoliday = {
  name: string;
  description?: string;
  date?: { iso?: string };
  type?: string[];
};

type CountRow = { count: number | string };

function classifyKind(name: string, types: string[]): string {
  if (/poya|full moon/i.test(name)) return "poya";
  const hay = `${name} ${types.join(" ")}`;
  if (/bank/i.test(hay)) return "bank";
  if (/mercantile/i.test(hay)) return "mercantile";
  return "public";
}

export const cronRoutes = new Hono();

cronRoutes.get("/holidays", async (c) => {
  // ponytail: CRON_SECRET / CALENDARIFIC_API_KEY are read here (call time),
  // never at module init and never logged.
  const secret = process.env.CRON_SECRET;
  if (!secret) return c.json({ error: "cron-unconfigured" }, 503);
  const header = c.req.header("authorization") ?? "";
  if (header !== `Bearer ${secret}`) return c.json({ error: "unauthorized" }, 401);

  const year = new Date().getFullYear() + 1;
  const prefix = `${year}-`;
  const db = getDb();

  let existing: CountRow[];
  try {
    existing = rowsOf<CountRow>(
      await db.execute(sql`SELECT COUNT(*) AS count FROM "holidays" WHERE "date" LIKE ${prefix + "%"}`),
    );
  } catch (error) {
    // ponytail: holidays table is migration 0017 (parallel agent owns it).
    // 503 pages Vercel Cron as failed — honest signal, retried tomorrow.
    if (isMissingTable(error)) return c.json({ error: "holidays-table-missing" }, 503);
    throw error;
  }
  if (Number(existing[0]?.count ?? 0) > 0) {
    return c.json({ skipped: true, reason: "already-seeded", year });
  }

  const apiKey = process.env.CALENDARIFIC_API_KEY;
  if (!apiKey) return c.json({ skipped: true, reason: "no-api-key", year });

  const url =
    "https://api.calendarific.com/api/v2/holidays" +
    `?api_key=${encodeURIComponent(apiKey)}&country=LK&year=${year}&location=Asia/Colombo`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch {
    return c.json({ error: "calendarific-unreachable" }, 502);
  }
  if (!res.ok) return c.json({ error: "calendarific-upstream" }, 502);

  const data = (await res.json()) as { response?: { holidays?: CalendarificHoliday[] } };
  const holidays = data.response?.holidays ?? [];
  let upserted = 0;
  for (const h of holidays) {
    const iso = h.date?.iso?.slice(0, 10);
    if (!iso || typeof h.name !== "string" || !h.name) continue;
    const kind = classifyKind(h.name, Array.isArray(h.type) ? h.type : []);
    await db.execute(sql`
      INSERT INTO "holidays" ("date", "nameEn", "nameSi", "nameTa", "kind", "source")
      VALUES (${iso}, ${h.name}, NULL, NULL, ${kind}, 'calendarific')
      ON CONFLICT ("date") DO UPDATE SET
        "nameEn" = EXCLUDED."nameEn",
        "kind" = EXCLUDED."kind",
        "source" = 'calendarific'
    `);
    upserted += 1;
  }
  return c.json({ seeded: upserted, year });
});
