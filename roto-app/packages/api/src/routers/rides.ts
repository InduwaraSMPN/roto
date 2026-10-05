import { z } from "zod";
import { rides } from "@roto-app/db/schema/rides";
import { pois } from "@roto-app/db/schema/pois";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { protectedProcedure, publicProcedure, router } from "../index";
import { addContact, listContacts } from "./safety";

const sampleSchema = z.object({
  t: z.number(),
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  spd: z.number().optional(),
  ele: z.number().optional(),
  lean: z.number().optional(),
});

export const ridesRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().default("Ride"),
        distanceKm: z.number().default(0),
        maxLeanDeg: z.number().optional(),
        gpx: z.string().optional(),
        startedAt: z.string().optional(),
        endedAt: z.string().optional(),
        durationS: z.number().int().nonnegative().optional(),
        movingS: z.number().int().nonnegative().optional(),
        maxSpeedKmh: z.number().nonnegative().optional(),
        avgSpeedKmh: z.number().nonnegative().optional(),
        elevationGainM: z.number().optional(),
        elevationLossM: z.number().optional(),
        samples: z.array(sampleSchema).max(20_000).optional(), // ponytail: cap ~5.5h at 1Hz, trim before this on the client
        visibility: z.enum(["private", "unlisted", "public"]).optional(),
        hideMaxSpeed: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { startedAt, endedAt, ...rest } = input;
      const [row] = await ctx.db
        .insert(rides)
        .values({
          userId: ctx.session.user.id,
          ...rest,
          ...(startedAt ? { startedAt: new Date(startedAt) } : {}),
          ...(endedAt ? { endedAt: new Date(endedAt) } : {}),
        })
        .returning();
      return row;
    }),
  // B12: startedAt/endedAt now travel with the ride (create above); ordered newest first with optional pagination.
  // Default (no input) still returns the full plain array so the web dashboard's reduce() over rides.mine keeps working.
  mine: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).optional(), before: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(rides.userId, ctx.session.user.id)];
      if (input?.before) conditions.push(lt(rides.startedAt, new Date(input.before)));
      const q = ctx.db
        .select()
        .from(rides)
        .where(and(...conditions))
        .orderBy(desc(rides.startedAt));
      return input?.limit ? q.limit(input.limit) : q;
    }),
  pois: publicProcedure
    .input(z.object({ kind: z.string().optional(), bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db;
      if (input.kind) return db.select().from(pois).where(eq(pois.kind, input.kind));
      return db.select().from(pois);
    }),
  // ponytail: kept as one-release aliases for safety.contacts.add/list (feature-parity-plan §4.12); native still calls these
  addSos: protectedProcedure
    .input(z.object({ name: z.string(), phone: z.string() }))
    .mutation(({ ctx, input }) => addContact(ctx.db, ctx.session.user.id, { ...input, lang: "en" })),
  sosList: protectedProcedure.query(({ ctx }) => listContacts(ctx.db, ctx.session.user.id)),
  reportPoi: protectedProcedure
    .input(
      z.object({
        kind: z.enum(["fuel", "ev", "dealer", "service", "hospital", "police", "hazard"]),
        name: z.string().min(1).max(80),
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db.insert(pois).values({ ...input, nameEn: input.name }).returning();
      return row;
    }),
  // Share links (§4.7): same slug pattern as saved routes — unlisted obscurity, no auth needed.
  setVisibility: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        visibility: z.enum(["private", "unlisted", "public"]),
        hideMaxSpeed: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const found = await ctx.db.select().from(rides).where(eq(rides.id, input.id)).limit(1);
      const row = found[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "unknown ride" });
      if (row.userId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "owner only" });
      const shareSlug = row.shareSlug ?? (input.visibility === "private" ? null : crypto.randomUUID().slice(0, 8));
      const [updated] = await ctx.db
        .update(rides)
        .set({
          visibility: input.visibility,
          ...(input.hideMaxSpeed !== undefined ? { hideMaxSpeed: input.hideMaxSpeed } : {}),
          shareSlug,
        })
        .where(eq(rides.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "unknown ride" });
      return updated;
    }),
  bySlug: publicProcedure.input(z.object({ slug: z.string().min(1) })).query(async ({ ctx, input }) => {
    const found = await ctx.db.select().from(rides).where(eq(rides.shareSlug, input.slug)).limit(1);
    const row = found[0];
    if (!row || row.visibility === "private") throw new TRPCError({ code: "NOT_FOUND", message: "unknown ride" });
    // hideMaxSpeed is honored on every public surface — the value never leaves the server
    if (row.hideMaxSpeed) return { ...row, maxSpeedKmh: null };
    return row;
  }),
  // Lifetime heatmap (§4.10): the web dashboard renders these as a maplibre `heatmap` layer.
  heat: protectedProcedure.query(async ({ ctx }) => {
    // ponytail: newest 500 rides bound the work; stride sampling keeps the payload ~2000 pts
    // instead of shipping every 1 Hz fix to the client
    const rows = await ctx.db
      .select({ samples: rides.samples })
      .from(rides)
      .where(eq(rides.userId, ctx.session.user.id))
      .orderBy(desc(rides.createdAt))
      .limit(500);
    const all: [number, number][] = [];
    for (const r of rows) {
      for (const s of r.samples ?? []) all.push([s.lon, s.lat]);
    }
    const MAX_PTS = 2000;
    const stride = Math.max(1, Math.ceil(all.length / MAX_PTS));
    const points = all.filter((_, i) => i % stride === 0);
    return { points };
  }),
});
