import { groupMembers, livePositions, rideGroups } from "@roto-app/db/schema/groups";
import { user } from "@roto-app/db/schema/auth";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@roto-app/db";
import { protectedProcedure, router } from "../index";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 32 chars, divides 256 evenly -> unbiased modulo below
const newCode = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
};

async function mustMember(db: Database, groupId: string, userId: string) {
  const m = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))).limit(1);
  if (!m.length) throw new TRPCError({ code: "FORBIDDEN", message: "not a member" });
}

async function pruneStale(db: Database, groupId: string) {
  const since = new Date(Date.now() - 120_000);
  await db.delete(livePositions).where(and(eq(livePositions.groupId, groupId), lt(livePositions.updatedAt, since)));
}

export const groupsRouter = router({
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(60), routeId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [g] = await ctx.db
        .insert(rideGroups)
        .values({ name: input.name, code: newCode(), ownerId: ctx.session.user.id, routeId: input.routeId ?? null })
        .returning();
      if (!g) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "create failed" });
      await ctx.db.insert(groupMembers).values({ groupId: g.id, userId: ctx.session.user.id });
      return { id: g.id, code: g.code };
    }),
  join: protectedProcedure.input(z.object({ code: z.string().length(6) })).mutation(async ({ ctx, input }) => {
    const found = await ctx.db.select().from(rideGroups).where(eq(rideGroups.code, input.code.toUpperCase())).limit(1);
    const row = found[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "unknown code" });
    await ctx.db.insert(groupMembers).values({ groupId: row.id, userId: ctx.session.user.id }).onConflictDoNothing();
    return { id: row.id, name: row.name, code: row.code, routeId: row.routeId };
  }),
  leave: protectedProcedure.input(z.object({ groupId: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(groupMembers).where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.userId, ctx.session.user.id)));
    await ctx.db.delete(livePositions).where(and(eq(livePositions.groupId, input.groupId), eq(livePositions.userId, ctx.session.user.id)));
    return true;
  }),
  end: protectedProcedure.input(z.object({ groupId: z.string() })).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db.select().from(rideGroups).where(eq(rideGroups.id, input.groupId)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "unknown group" });
    if (row.ownerId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "owner only" });
    await ctx.db.delete(rideGroups).where(eq(rideGroups.id, input.groupId)); // cascades members + positions
    return true;
  }),
  setRoute: protectedProcedure.input(z.object({ groupId: z.string(), routeId: z.string().nullable() })).mutation(async ({ ctx, input }) => {
    await mustMember(ctx.db, input.groupId, ctx.session.user.id);
    await ctx.db.update(rideGroups).set({ routeId: input.routeId }).where(eq(rideGroups.id, input.groupId));
    return true;
  }),
  setRegroup: protectedProcedure
    .input(z.object({ groupId: z.string(), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }))
    .mutation(async ({ ctx, input }) => {
      await mustMember(ctx.db, input.groupId, ctx.session.user.id);
      await ctx.db.update(rideGroups).set({ regroupLat: input.lat, regroupLon: input.lon }).where(eq(rideGroups.id, input.groupId));
      return true;
    }),
  mine: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({ id: rideGroups.id, name: rideGroups.name, code: rideGroups.code, routeId: rideGroups.routeId })
      .from(groupMembers)
      .innerJoin(rideGroups, eq(groupMembers.groupId, rideGroups.id))
      .where(eq(groupMembers.userId, ctx.session.user.id));
    return rows;
  }),
  updatePosition: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        speed: z.number().optional(),
        heading: z.number().min(0).max(360).optional(),
        accuracyM: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await mustMember(ctx.db, input.groupId, ctx.session.user.id);
      const now = new Date();
      await ctx.db
        .insert(livePositions)
        .values({
          groupId: input.groupId,
          userId: ctx.session.user.id,
          lat: input.lat,
          lon: input.lon,
          speed: input.speed ?? null,
          heading: input.heading ?? null,
          accuracyM: input.accuracyM ?? null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [livePositions.groupId, livePositions.userId],
          set: { lat: input.lat, lon: input.lon, speed: input.speed ?? null, heading: input.heading ?? null, accuracyM: input.accuracyM ?? null, updatedAt: now },
        });
      // ponytail: no cron on Vercel Hobby (sub-daily), so stale rows are pruned inline on every write instead
      await pruneStale(ctx.db, input.groupId);
      return true;
    }),
  members: protectedProcedure.input(z.object({ groupId: z.string() })).query(async ({ ctx, input }) => {
    await mustMember(ctx.db, input.groupId, ctx.session.user.id);
    const since = new Date(Date.now() - 120_000);
    const rows = await ctx.db
      .select({
        userId: livePositions.userId,
        name: user.name,
        lat: livePositions.lat,
        lon: livePositions.lon,
        speed: livePositions.speed,
        heading: livePositions.heading,
        accuracyM: livePositions.accuracyM,
        updatedAt: livePositions.updatedAt,
      })
      .from(livePositions)
      .innerJoin(user, eq(livePositions.userId, user.id))
      .where(and(eq(livePositions.groupId, input.groupId), gt(livePositions.updatedAt, since)));
    return rows;
  }),
});
