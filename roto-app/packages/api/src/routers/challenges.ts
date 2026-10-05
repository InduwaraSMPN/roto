import { challengeProgress, challenges, checkins } from "@roto-app/db/schema/challenges";
import { user } from "@roto-app/db/schema/auth";
import { pois } from "@roto-app/db/schema/pois";
import { haversineM } from "@roto-app/core/geo";
import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../index";

const CHECKIN_RADIUS_M = 200;

export const challengesRouter = router({
  // publicProcedure with optional session: ctx.session is nullable here, so anonymous riders
  // still see the board (joined: false) while signed-in riders get their joined flags.
  list: publicProcedure.query(async ({ ctx }) => {
    const all = await ctx.db.select().from(challenges).orderBy(challenges.startsAt).limit(50);
    if (!ctx.session) return all.map((c) => ({ ...c, joined: false }));
    const mine = await ctx.db
      .select({ challengeId: challengeProgress.challengeId })
      .from(challengeProgress)
      .where(eq(challengeProgress.userId, ctx.session.user.id));
    const joined = new Set(mine.map((m) => m.challengeId));
    return all.map((c) => ({ ...c, joined: joined.has(c.id) }));
  }),
  join: protectedProcedure.input(z.object({ challengeId: z.string() })).mutation(async ({ ctx, input }) => {
    const found = await ctx.db.select({ id: challenges.id }).from(challenges).where(eq(challenges.id, input.challengeId)).limit(1);
    if (!found[0]) throw new TRPCError({ code: "NOT_FOUND", message: "unknown challenge" });
    await ctx.db
      .insert(challengeProgress)
      .values({ challengeId: input.challengeId, userId: ctx.session.user.id, km: 0 })
      .onConflictDoNothing();
    return true;
  }),
  leaderboard: publicProcedure.input(z.object({ challengeId: z.string() })).query(async ({ ctx, input }) => {
    // B7: group by user.id, not user.name, so two riders sharing a name don't merge
    const rows = await ctx.db
      .select({ userId: user.id, name: user.name, km: sql<number>`sum(${challengeProgress.km})`.as("km") })
      .from(challengeProgress)
      .innerJoin(user, eq(challengeProgress.userId, user.id))
      .where(eq(challengeProgress.challengeId, input.challengeId))
      .groupBy(user.id, user.name)
      .orderBy(desc(sql`sum(${challengeProgress.km})`))
      .limit(50);
    return rows.map((r) => ({ userId: r.userId, name: r.name, km: Math.round(Number(r.km ?? 0) * 10) / 10 }));
  }),
  // Check-in counts only from a recorded fix within 200 m of the POI — no armchair check-ins.
  checkin: protectedProcedure
    .input(
      z.object({
        poiId: z.string().optional(),
        routeId: z.string().optional(),
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        at: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.poiId && !input.routeId) throw new TRPCError({ code: "BAD_REQUEST", message: "poiId or routeId required" });
      if (input.poiId) {
        const found = await ctx.db.select().from(pois).where(eq(pois.id, input.poiId)).limit(1);
        const poi = found[0];
        if (!poi) throw new TRPCError({ code: "NOT_FOUND", message: "unknown POI" });
        const distM = haversineM(input.lon, input.lat, poi.lon, poi.lat);
        if (distM > CHECKIN_RADIUS_M) throw new TRPCError({ code: "BAD_REQUEST", message: `too far from ${poi.nameEn} (${Math.round(distM)} m)` });
      }
      const [row] = await ctx.db
        .insert(checkins)
        .values({
          userId: ctx.session.user.id,
          poiId: input.poiId ?? null,
          routeId: input.routeId ?? null,
          lat: input.lat,
          lon: input.lon,
          at: input.at ?? new Date(),
        })
        .returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "check-in failed" });
      // ponytail: challenge km tallies stay derived on ride sync (plan §4.16); check-ins only record presence
      return row;
    }),
});
