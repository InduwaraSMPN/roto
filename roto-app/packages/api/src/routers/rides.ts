import { z } from "zod";
import { pois, rides, sosContacts } from "@roto-app/db/schema/rides";
import { eq } from "drizzle-orm";
import { protectedProcedure, publicProcedure, router } from "../index";

export const ridesRouter = router({
  create: protectedProcedure
    .input(z.object({ name: z.string().default("Ride"), distanceKm: z.number().default(0), gpx: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const [row] = await db.insert(rides).values({ userId: ctx.session.user.id, ...input }).returning();
      return row;
    }),
  mine: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db;
    return db.select().from(rides).where(eq(rides.userId, ctx.session.user.id));
  }),
  pois: publicProcedure
    .input(z.object({ kind: z.string().optional(), bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db;
      if (input.kind) return db.select().from(pois).where(eq(pois.kind, input.kind));
      return db.select().from(pois);
    }),
  addSos: protectedProcedure
    .input(z.object({ name: z.string(), phone: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const [row] = await db.insert(sosContacts).values({ userId: ctx.session.user.id, ...input }).returning();
      return row;
    }),
  sosList: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db;
    return db.select().from(sosContacts).where(eq(sosContacts.userId, ctx.session.user.id));
  }),
});

