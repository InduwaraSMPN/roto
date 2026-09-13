import { privacyZones } from "@roto-app/db/schema/privacy";
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
  remove: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(privacyZones).where(and(eq(privacyZones.id, input.id), eq(privacyZones.userId, ctx.session.user.id)));
    return true;
  }),
});
