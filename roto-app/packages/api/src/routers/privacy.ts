import { privacyZones } from "@roto-app/db/schema/privacy";
import { rides, sosContacts } from "@roto-app/db/schema/rides";
import { posts } from "@roto-app/db/schema/community";
import { user } from "@roto-app/db/schema/auth";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../index";

export const privacyRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.select().from(privacyZones).where(eq(privacyZones.userId, ctx.session.user.id)),
  ),
  setHome: protectedProcedure
    .input(z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), radiusM: z.number().min(50).max(2000).default(200) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(privacyZones).where(and(eq(privacyZones.userId, ctx.session.user.id), eq(privacyZones.name, "Home")));
      const [row] = await ctx.db.insert(privacyZones).values({ userId: ctx.session.user.id, name: "Home", ...input }).returning();
      return row;
    }),
  add: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(60),
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        radiusM: z.number().min(50).max(2000).default(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db.insert(privacyZones).values({ userId: ctx.session.user.id, ...input }).returning();
      return row;
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(60).optional(),
        lat: z.number().min(-90).max(90).optional(),
        lon: z.number().min(-180).max(180).optional(),
        radiusM: z.number().min(50).max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      const [row] = await ctx.db
        .update(privacyZones)
        .set(patch)
        .where(and(eq(privacyZones.id, id), eq(privacyZones.userId, ctx.session.user.id)))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "unknown zone" });
      return row;
    }),
  remove: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(privacyZones).where(and(eq(privacyZones.id, input.id), eq(privacyZones.userId, ctx.session.user.id)));
    return true;
  }),
  // GDPR export (§4.17): one JSON bundle with everything the account owns. A zip of JSON + GPX
  // files via Blob (emailed/downloaded) is deferred — this bundle is what that job will pack.
  exportMine: protectedProcedure.query(async ({ ctx }) => {
    const uid = ctx.session.user.id;
    const [myRides, contacts, zones, myPosts] = await Promise.all([
      ctx.db.select().from(rides).where(eq(rides.userId, uid)),
      ctx.db.select().from(sosContacts).where(eq(sosContacts.userId, uid)),
      ctx.db.select().from(privacyZones).where(eq(privacyZones.userId, uid)),
      ctx.db.select().from(posts).where(eq(posts.userId, uid)),
    ]);
    return { rides: myRides, contacts, zones, posts: myPosts };
  }),
  // GDPR delete (§4.17): deleting the user row cascades rides, routes, zones, contacts, posts
  // and everything else owned (§6 FKs); blob cleanup for ride photos rides along later.
  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.delete(user).where(eq(user.id, ctx.session.user.id));
    return true;
  }),
});
