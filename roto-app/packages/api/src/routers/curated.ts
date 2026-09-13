import { z } from "zod";
import { curatedRoutes } from "@roto-app/db/schema/curated";
import { eq } from "drizzle-orm";
import { publicProcedure, router } from "../index";

export const curatedRouter = router({
  list: publicProcedure.input(z.object({ region: z.string().optional() }).default({})).query(async ({ ctx, input }) => {
    const db = ctx.db;
    const rows = input.region
      ? await db.select().from(curatedRoutes).where(eq(curatedRoutes.region, input.region))
      : await db.select().from(curatedRoutes);
    return rows.map((r) => ({ ...r, coords: undefined, points: (r.coords as [number, number][]).length }));
  }),
  get: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const rows = await ctx.db.select().from(curatedRoutes).where(eq(curatedRoutes.id, input.id)).limit(1);
    if (!rows[0]) throw new Error("unknown route");
    return rows[0];
  }),
});
