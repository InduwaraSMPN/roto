import { reports } from "@roto-app/db/schema/moderation";
import { postComments, posts } from "@roto-app/db/schema/community";
import { savedRoutes } from "@roto-app/db/schema/routes";
import { curatedRoutes } from "@roto-app/db/schema/curated";
import { pois } from "@roto-app/db/schema/pois";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../index";
import type { Database } from "@roto-app/db";

function requireAdmin(session: { user: unknown }) {
  // better-auth admin plugin role (§4.17); cast because the base user type has no role field
  const role = (session.user as { role?: string } | null)?.role;
  if (role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "admin only" });
}

// Best-effort target removal: a missing row or a table that hasn't migrated yet must not fail
// the resolve — the report is still marked so it leaves the queue.
async function removeTarget(db: Database, targetType: string, targetId: string) {
  try {
    if (targetType === "post") await db.delete(posts).where(eq(posts.id, targetId));
    else if (targetType === "comment") await db.delete(postComments).where(eq(postComments.id, targetId));
    else if (targetType === "poi") await db.delete(pois).where(eq(pois.id, targetId));
    else if (targetType === "route") {
      const saved = await db.delete(savedRoutes).where(eq(savedRoutes.id, targetId)).returning({ id: savedRoutes.id });
      if (!saved.length) await db.delete(curatedRoutes).where(eq(curatedRoutes.id, targetId));
    }
  } catch {
    // resolve still counts — a moderator can retry from the queue
  }
}

export const moderationRouter = router({
  report: protectedProcedure
    .input(
      z.object({
        targetType: z.enum(["post", "comment", "poi", "route"]),
        targetId: z.string().min(1),
        reason: z.string().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(reports)
        .values({ targetType: input.targetType, targetId: input.targetId, reason: input.reason, reporterId: ctx.session.user.id, status: "open" })
        .returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "report failed" });
      return row;
    }),
  queue: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.session);
    return ctx.db.select().from(reports).where(eq(reports.status, "open")).orderBy(desc(reports.createdAt)).limit(100);
  }),
  resolve: protectedProcedure.input(z.object({ reportId: z.string(), action: z.enum(["dismiss", "remove"]) })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.session);
    const found = await ctx.db.select().from(reports).where(eq(reports.id, input.reportId)).limit(1);
    const report = found[0];
    if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "unknown report" });
    if (input.action === "remove") await removeTarget(ctx.db, report.targetType, report.targetId);
    const [updated] = await ctx.db
      .update(reports)
      .set({ status: input.action === "remove" ? "removed" : "dismissed" })
      .where(eq(reports.id, input.reportId))
      .returning();
    return updated ?? true;
  }),
});
