import { routeFolders, savedRoutes } from "@roto-app/db/schema/routes";
import type { Database } from "@roto-app/db";
import type { Maneuver, PlanOptions } from "@roto-app/core/types";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../index";

const visibilitySchema = z.enum(["private", "unlisted", "public"]);

const waypointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  kind: z.enum(["break", "via", "through"]).optional(),
  name: z.string().max(120).optional(),
  heading: z.number().min(0).max(360).optional(),
});

// Geometry is [lon, lat][] (GeoJSON order) everywhere; API inputs are { lat, lon } objects.
const coordSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

async function mustOwnRoute(db: Database, id: string, userId: string) {
  const rows = await db.select().from(savedRoutes).where(eq(savedRoutes.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "unknown route" });
  if (row.userId !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "owner only" });
  return row;
}

async function mustOwnFolder(db: Database, id: string, userId: string) {
  const rows = await db.select().from(routeFolders).where(eq(routeFolders.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "unknown folder" });
  if (row.userId !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "owner only" });
  return row;
}

export const routesRouter = router({
  save: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80).default("My route"),
        waypoints: z.array(waypointSchema).min(2).max(500),
        coords: z.array(coordSchema).min(2),
        maneuvers: z.array(z.any()).optional(),
        options: z.record(z.string(), z.any()).optional(),
        km: z.number().nonnegative().default(0),
        min: z.number().nonnegative().default(0),
        engine: z.enum(["valhalla", "brouter", "osrm", "gps"]).optional(),
        curvature: z.number().optional(),
        visibility: visibilitySchema.default("private"),
        folderId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.folderId) await mustOwnFolder(ctx.db, input.folderId, ctx.session.user.id);
      const { maneuvers, options, ...rest } = input;
      const [row] = await ctx.db
        .insert(savedRoutes)
        .values({
          userId: ctx.session.user.id,
          ...rest,
          folderId: input.folderId ?? null,
          maneuvers: (maneuvers ?? null) as Maneuver[] | null,
          options: (options ?? null) as unknown as PlanOptions | null,
          engine: input.engine ?? null,
          curvature: input.curvature ?? null,
          // ponytail: short random slug, not a guessable id — unlisted links stay obscure without auth
          shareSlug: input.visibility === "private" ? null : crypto.randomUUID().slice(0, 8),
        })
        .returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "save failed" });
      return row;
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(80).optional(),
        waypoints: z.array(waypointSchema).min(2).max(500).optional(),
        coords: z.array(coordSchema).min(2).optional(),
        maneuvers: z.array(z.any()).optional(),
        options: z.record(z.string(), z.any()).optional(),
        km: z.number().nonnegative().optional(),
        min: z.number().nonnegative().optional(),
        engine: z.enum(["valhalla", "brouter", "osrm", "gps"]).optional(),
        curvature: z.number().nullable().optional(),
        folderId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await mustOwnRoute(ctx.db, input.id, ctx.session.user.id);
      const { id, maneuvers, options, folderId, ...rest } = input;
      if (folderId) await mustOwnFolder(ctx.db, folderId, ctx.session.user.id);
      const patch: Partial<typeof savedRoutes.$inferInsert> = { ...rest };
      if (maneuvers !== undefined) patch.maneuvers = maneuvers as Maneuver[];
      if (options !== undefined) patch.options = options as unknown as PlanOptions;
      if (folderId !== undefined) patch.folderId = folderId;
      const [row] = await ctx.db.update(savedRoutes).set(patch).where(eq(savedRoutes.id, id)).returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "unknown route" });
      return row;
    }),
  remove: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await mustOwnRoute(ctx.db, input.id, ctx.session.user.id);
    await ctx.db.delete(savedRoutes).where(eq(savedRoutes.id, input.id));
    return true;
  }),
  mine: protectedProcedure.input(z.object({ folderId: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const conditions = [eq(savedRoutes.userId, ctx.session.user.id)];
    if (input?.folderId) conditions.push(eq(savedRoutes.folderId, input.folderId));
    return ctx.db.select().from(savedRoutes).where(and(...conditions)).orderBy(desc(savedRoutes.updatedAt));
  }),
  folders: router({
    list: protectedProcedure.query(({ ctx }) =>
      ctx.db.select().from(routeFolders).where(eq(routeFolders.userId, ctx.session.user.id)).orderBy(routeFolders.sortOrder),
    ),
    create: protectedProcedure.input(z.object({ name: z.string().min(1).max(60) })).mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.select().from(routeFolders).where(eq(routeFolders.userId, ctx.session.user.id));
      const [row] = await ctx.db
        .insert(routeFolders)
        .values({ userId: ctx.session.user.id, name: input.name, sortOrder: existing.length })
        .returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "create failed" });
      return row;
    }),
    rename: protectedProcedure.input(z.object({ id: z.string(), name: z.string().min(1).max(60) })).mutation(async ({ ctx, input }) => {
      await mustOwnFolder(ctx.db, input.id, ctx.session.user.id);
      const [row] = await ctx.db.update(routeFolders).set({ name: input.name }).where(eq(routeFolders.id, input.id)).returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "unknown folder" });
      return row;
    }),
    remove: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
      await mustOwnFolder(ctx.db, input.id, ctx.session.user.id);
      // FK is ON DELETE SET NULL, so routes survive the folder
      await ctx.db.delete(routeFolders).where(eq(routeFolders.id, input.id));
      return true;
    }),
  }),
  bySlug: publicProcedure.input(z.object({ slug: z.string().min(1) })).query(async ({ ctx, input }) => {
    const rows = await ctx.db.select().from(savedRoutes).where(eq(savedRoutes.shareSlug, input.slug)).limit(1);
    const row = rows[0];
    if (!row || row.visibility === "private") throw new TRPCError({ code: "NOT_FOUND", message: "unknown route" });
    return row;
  }),
  setVisibility: protectedProcedure.input(z.object({ id: z.string(), visibility: visibilitySchema })).mutation(async ({ ctx, input }) => {
    const row = await mustOwnRoute(ctx.db, input.id, ctx.session.user.id);
    // Keep the slug across private toggles so re-sharing restores the same link; bySlug 404s while private.
    const shareSlug = row.shareSlug ?? (input.visibility === "private" ? null : crypto.randomUUID().slice(0, 8));
    const [updated] = await ctx.db
      .update(savedRoutes)
      .set({ visibility: input.visibility, shareSlug })
      .where(eq(savedRoutes.id, input.id))
      .returning();
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "unknown route" });
    return updated;
  }),
});
