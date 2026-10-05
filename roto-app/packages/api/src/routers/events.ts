import { eventRsvps, events } from "@roto-app/db/schema/events";
import { user } from "@roto-app/db/schema/auth";
import { rides } from "@roto-app/db/schema/rides";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../index";

export const eventsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(events).orderBy(events.startsAt).limit(50);
  }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        description: z.string().max(2000).optional(),
        place: z.string().max(80).default(""),
        lat: z.number().optional(),
        lon: z.number().optional(),
        startsAt: z.string(),
        endsAt: z.string().optional(),
        routeId: z.string().optional(),
        orgId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(events)
        .values({
          name: input.name,
          description: input.description ?? null,
          place: input.place,
          lat: input.lat ?? null,
          lon: input.lon ?? null,
          startsAt: new Date(input.startsAt),
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          routeId: input.routeId ?? null,
          orgId: input.orgId ?? null,
          ownerId: ctx.session.user.id,
        })
        .returning();
      return row;
    }),
  rsvp: protectedProcedure.input(z.object({ eventId: z.string() })).mutation(async ({ ctx, input }) => {
    // B6: event_rsvps now has a real (eventId, userId) PK, so this onConflictDoNothing is finally effective
    await ctx.db.insert(eventRsvps).values({ eventId: input.eventId, userId: ctx.session.user.id }).onConflictDoNothing();
    return true;
  }),
  leaderboard: publicProcedure
    .input(z.object({ year: z.number().min(2020).max(2100), month: z.number().min(1).max(12) }).default({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }))
    .query(async ({ ctx, input }) => {
      const start = new Date(input.year, input.month - 1, 1);
      const nextMonthStart = new Date(input.year, input.month, 1);
      // B7: group by user.id, not user.name, so two riders sharing a name don't merge
      const rows = await ctx.db
        .select({ userId: user.id, name: user.name, km: sql<number>`sum(${rides.distanceKm})`.as("km") })
        .from(rides)
        .innerJoin(user, eq(rides.userId, user.id))
        .where(and(gte(rides.createdAt, start), lt(rides.createdAt, nextMonthStart)))
        .groupBy(user.id, user.name)
        .orderBy(desc(sql`sum(${rides.distanceKm})`))
        .limit(20);
      return rows.map((r) => ({ userId: r.userId, name: r.name, km: Math.round(Number(r.km ?? 0) * 10) / 10 }));
    }),
});
