import { garage } from "@roto-app/db/schema/garage";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../index";

export const garageRouter = router({
  // ponytail: one row per user (the current bike) — multi-bike garage is a native-local concern
  // until the server table grows a "primary" flag; reg no. lives here only when signed in (§5.3)
  save: protectedProcedure
    .input(
      z.object({
        brand: z.string().min(1).max(60),
        model: z.string().min(1).max(60),
        year: z.number().int().min(1900).max(2100).optional(),
        regNo: z.string().max(20).optional(),
        odoKm: z.number().nonnegative().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.select().from(garage).where(eq(garage.userId, ctx.session.user.id)).limit(1);
      if (existing[0]) {
        const [row] = await ctx.db.update(garage).set({ ...input }).where(eq(garage.userId, ctx.session.user.id)).returning();
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "garage row vanished" });
        return row;
      }
      const [row] = await ctx.db.insert(garage).values({ userId: ctx.session.user.id, ...input }).returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "save failed" });
      return row;
    }),
  load: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(garage).where(eq(garage.userId, ctx.session.user.id)).limit(1);
    return rows[0] ?? null;
  }),
});
