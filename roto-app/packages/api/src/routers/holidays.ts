// Poya + public holidays (plan §5.2). The DB table (seeded yearly from Calendarific) is the
// source of truth. Offline cross-check note: native clients can sanity-check Poya dates with
// `fullMoonsUtc` from `@roto-app/core/holidays`, but that Meeus calculation can drift a day
// near local midnight — it never overrides the DB. There is no transformer (no superjson),
// so `date` values arrive at clients as 'YYYY-MM-DD' strings (TEXT PK, never Date objects).
import { holidays } from "@roto-app/db/schema/holidays";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure, router } from "../index";

/** Current calendar date in Asia/Colombo as 'YYYY-MM-DD' (en-CA formats exactly that way). */
export function colomboToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const holidaysRouter = router({
  list: publicProcedure
    .input(z.object({ year: z.number().int().min(2000).max(2100) }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(holidays)
        .where(and(gte(holidays.date, `${input.year}-01-01`), lt(holidays.date, `${input.year + 1}-01-01`)))
        .orderBy(asc(holidays.date));
    }),

  today: publicProcedure.query(async ({ ctx }) => {
    const date = colomboToday();
    const rows = await ctx.db.select().from(holidays).where(eq(holidays.date, date));
    const names =
      rows.length > 0
        ? {
            en: rows.map((r) => r.nameEn).join(" / "),
            si: rows.map((r) => r.nameSi ?? r.nameEn).join(" / "),
            ta: rows.map((r) => r.nameTa ?? r.nameEn).join(" / "),
          }
        : undefined;
    return {
      date,
      isPoya: rows.some((r) => r.kind === "poya"),
      isPublic: rows.some((r) => r.kind === "public"),
      names,
    };
  }),
});
