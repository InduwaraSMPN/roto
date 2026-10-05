import { badges, follows, postComments, postReactions, posts } from "@roto-app/db/schema/community";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../index";

const FEED_LIMIT = 20;

const visibilitySchema = z.enum(["private", "unlisted", "public"]);

export const communityRouter = router({
  feed: publicProcedure
    .input(z.object({ scope: z.enum(["following", "club", "nearby"]), cursor: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const before = input.cursor ? new Date(input.cursor) : null;
      if (input.cursor && Number.isNaN(before?.getTime())) throw new TRPCError({ code: "BAD_REQUEST", message: "bad cursor" });
      const base = [...(before ? [lt(posts.createdAt, before)] : [])];
      let rows;
      if (input.scope === "following") {
        if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED", message: "sign in to see your feed" });
        const edges = await ctx.db
          .select({ followeeId: follows.followeeId })
          .from(follows)
          .where(eq(follows.followerId, ctx.session.user.id));
        const ids = edges.map((e) => e.followeeId);
        if (!ids.length) return { items: [], nextCursor: null };
        rows = await ctx.db
          .select()
          .from(posts)
          .where(and(inArray(posts.userId, ids), ...base))
          .orderBy(desc(posts.createdAt))
          .limit(FEED_LIMIT + 1);
      } else if (input.scope === "club") {
        // ponytail: org membership tables land with the auth organization plugin (§4.16); until
        // then "club" means any org-tagged post, which the club screens filter by orgId client-side
        rows = await ctx.db
          .select()
          .from(posts)
          .where(and(...base))
          .orderBy(desc(posts.createdAt))
          .limit(FEED_LIMIT + 1)
          .then((all) => all.filter((p) => p.orgId));
      } else {
        // ponytail: true nearby (posts on routes/rides near the rider) needs geo on posts — v1 is
        // just latest public, which is a fine approximation for a country this small
        rows = await ctx.db
          .select()
          .from(posts)
          .where(and(eq(posts.visibility, "public"), ...base))
          .orderBy(desc(posts.createdAt))
          .limit(FEED_LIMIT + 1);
      }
      const items = rows.slice(0, FEED_LIMIT);
      const last = items[items.length - 1];
      return { items, nextCursor: rows.length > FEED_LIMIT && last ? last.createdAt.toISOString() : null };
    }),
  post: protectedProcedure
    .input(
      z.object({
        body: z.string().min(1).max(2000),
        rideId: z.string().optional(),
        routeId: z.string().optional(),
        photoUrl: z.string().url().max(500).optional(),
        visibility: visibilitySchema.default("public"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(posts)
        .values({
          userId: ctx.session.user.id,
          body: input.body,
          rideId: input.rideId ?? null,
          routeId: input.routeId ?? null,
          photoUrl: input.photoUrl ?? null,
          visibility: input.visibility,
        })
        .returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "post failed" });
      return row;
    }),
  comment: protectedProcedure.input(z.object({ postId: z.string(), body: z.string().min(1).max(1000) })).mutation(async ({ ctx, input }) => {
    const found = await ctx.db.select({ id: posts.id }).from(posts).where(eq(posts.id, input.postId)).limit(1);
    if (!found[0]) throw new TRPCError({ code: "NOT_FOUND", message: "unknown post" });
    const [row] = await ctx.db
      .insert(postComments)
      .values({ postId: input.postId, userId: ctx.session.user.id, body: input.body })
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "comment failed" });
    return row;
  }),
  react: protectedProcedure.input(z.object({ postId: z.string(), emoji: z.string().min(1).max(20).default("like") })).mutation(async ({ ctx, input }) => {
    const found = await ctx.db.select({ id: posts.id }).from(posts).where(eq(posts.id, input.postId)).limit(1);
    if (!found[0]) throw new TRPCError({ code: "NOT_FOUND", message: "unknown post" });
    // post_reactions PK is (postId, userId), so a second react with another emoji just switches it
    await ctx.db
      .insert(postReactions)
      .values({ postId: input.postId, userId: ctx.session.user.id, emoji: input.emoji })
      .onConflictDoUpdate({ target: [postReactions.postId, postReactions.userId], set: { emoji: input.emoji } });
    return true;
  }),
  follow: protectedProcedure.input(z.object({ userId: z.string() })).mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.session.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "cannot follow yourself" });
    await ctx.db.insert(follows).values({ followerId: ctx.session.user.id, followeeId: input.userId }).onConflictDoNothing();
    return true;
  }),
  unfollow: protectedProcedure.input(z.object({ userId: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db
      .delete(follows)
      .where(and(eq(follows.followerId, ctx.session.user.id), eq(follows.followeeId, input.userId)));
    return true;
  }),
  profile: publicProcedure.input(z.object({ userId: z.string() })).query(async ({ ctx, input }) => {
    const [userPosts, userBadges] = await Promise.all([
      ctx.db
        .select()
        .from(posts)
        .where(and(eq(posts.userId, input.userId), eq(posts.visibility, "public")))
        .orderBy(desc(posts.createdAt))
        .limit(20),
      ctx.db.select().from(badges).where(eq(badges.userId, input.userId)),
    ]);
    return { posts: userPosts, badges: userBadges };
  }),
});
