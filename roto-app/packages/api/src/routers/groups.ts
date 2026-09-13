import { groupMembers, livePositions, rideGroups } from "@roto-app/db/schema/groups";
import { user } from "@roto-app/db/schema/auth";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../index";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");

async function mustMember(db: any, groupId: string, userId: string) {
  const m = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))).limit(1);
  if (!m.length) throw new Error("not a member");
}

export const groupsRouter = router({
  create: protectedProcedure.input(z.object({ name: z.string().min(1).max(60) })).mutation(async ({ ctx, input }) => {
    const [g] = await ctx.db.insert(rideGroups).values({ name: input.name, code: newCode(), ownerId: ctx.session.user.id }).returning();
    if (!g) throw new Error("create failed");
    await ctx.db.insert(groupMembers).values({ groupId: g.id, userId: ctx.session.user.id });
    return { id: g.id, code: g.code };
  }),
  join: protectedProcedure.input(z.object({ code: z.string().length(6) })).mutation(async ({ ctx, input }) => {
    const found = await ctx.db.select().from(rideGroups).where(eq(rideGroups.code, input.code.toUpperCase())).limit(1);
    const row = found[0];
    if (!row) throw new Error("unknown code");
    await ctx.db.insert(groupMembers).values({ groupId: row.id, userId: ctx.session.user.id }).onConflictDoNothing();
    return { id: row.id, name: row.name };
  }),
  mine: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({ id: rideGroups.id, name: rideGroups.name, code: rideGroups.code })
      .from(groupMembers)
      .innerJoin(rideGroups, eq(groupMembers.groupId, rideGroups.id))
      .where(eq(groupMembers.userId, ctx.session.user.id));
    return rows;
  }),
  updatePosition: protectedProcedure
    .input(z.object({ groupId: z.string(), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), speed: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      await mustMember(ctx.db, input.groupId, ctx.session.user.id);
      await ctx.db
        .insert(livePositions)
        .values({ groupId: input.groupId, userId: ctx.session.user.id, lat: input.lat, lon: input.lon, speed: input.speed ?? null, updatedAt: new Date() })
        .onConflictDoNothing();
      await ctx.db
        .update(livePositions)
        .set({ lat: input.lat, lon: input.lon, speed: input.speed ?? null, updatedAt: new Date() })
        .where(and(eq(livePositions.groupId, input.groupId), eq(livePositions.userId, ctx.session.user.id)));
      return true;
    }),
  members: protectedProcedure.input(z.object({ groupId: z.string() })).query(async ({ ctx, input }) => {
    await mustMember(ctx.db, input.groupId, ctx.session.user.id);
    const since = new Date(Date.now() - 120_000);
    const rows = await ctx.db
      .select({ userId: livePositions.userId, name: user.name, lat: livePositions.lat, lon: livePositions.lon, updatedAt: livePositions.updatedAt })
      .from(livePositions)
      .innerJoin(user, eq(livePositions.userId, user.id))
      .where(and(eq(livePositions.groupId, input.groupId), gt(livePositions.updatedAt, since)));
    return rows;
  }),
});
