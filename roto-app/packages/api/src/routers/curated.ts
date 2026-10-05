import { z } from "zod";
import { curatedRoutes } from "@roto-app/db/schema/curated";
import { routeRatings } from "@roto-app/db/schema/community";
import { savedRoutes } from "@roto-app/db/schema/routes";
import { rides } from "@roto-app/db/schema/rides";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { protectedProcedure, publicProcedure, router } from "../index";
import type { Database } from "@roto-app/db";

const LIST_LIMIT_DEFAULT = 20;
const LIST_LIMIT_MAX = 100;

// Contract note: `tags`, `curvature`, `status`, `submittedBy`, `rating_avg`/`rating_count` on
// curated_routes land with the schema agent's §4.9 migration (same release as route_ratings).
// They are referenced here via raw SQL / casts so this file compiles before *and* after that
// migration — runtime behavior assumes the columns exist.

async function syncGeom(db: Database, id: string, coords: [number, number][]) {
  if (coords.length < 2) return;
  const wkt = `LINESTRING(${coords.map(([lon, lat]) => `${lon} ${lat}`).join(",")})`;
  await db.execute(sql`update "curated_routes" set "geom" = ST_SetSRID(ST_GeomFromText(${wkt}), 4326) where "id" = ${id}`);
}

export const curatedRouter = router({
  list: publicProcedure
    .input(
      z.object({
        tag: z.string().max(30).optional(),
        minCurvature: z.number().nonnegative().optional(),
        near: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), km: z.number().positive().max(500) }).optional(),
        sort: z.enum(["rating", "curvature", "distance"]).optional(),
        limit: z.number().int().min(1).max(LIST_LIMIT_MAX).default(LIST_LIMIT_DEFAULT),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // ponytail: offset cursor, not keyset — the curated set is dozens of rows, and keyset over
      // three different sort orders isn't worth the complexity
      const offset = input.cursor ? Number.parseInt(input.cursor, 10) : 0;
      if (Number.isNaN(offset) || offset < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "bad cursor" });
      const conditions = [sql`"curated_routes"."status" = 'published'`];
      if (input.tag) conditions.push(sql`${input.tag} = ANY ("curated_routes"."tags")`);
      if (input.minCurvature !== undefined) conditions.push(sql`"curated_routes"."curvature" >= ${input.minCurvature}`);
      if (input.near) {
        const { lat, lon, km } = input.near;
        conditions.push(
          sql`ST_DWithin("curated_routes"."geom"::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, ${km * 1000})`,
        );
      }
      const order =
        input.sort === "rating"
          ? sql`"curated_routes"."rating_avg" DESC NULLS LAST`
          : input.sort === "curvature"
            ? sql`"curated_routes"."curvature" DESC NULLS LAST`
            : input.sort === "distance"
              ? desc(curatedRoutes.distanceKm)
              : desc(curatedRoutes.createdAt);
      const rows = await ctx.db
        .select()
        .from(curatedRoutes)
        .where(and(...conditions))
        .orderBy(order)
        .limit(input.limit + 1)
        .offset(offset);
      const page = rows.slice(0, input.limit);
      const items = page.map((r) => ({ ...r, coords: undefined, points: (r.coords as [number, number][]).length }));
      return { items, nextCursor: rows.length > input.limit ? String(offset + input.limit) : null };
    }),
  get: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const rows = await ctx.db.select().from(curatedRoutes).where(eq(curatedRoutes.id, input.id)).limit(1);
    if (!rows[0]) throw new Error("unknown route");
    return rows[0];
  }),
  rate: protectedProcedure
    .input(z.object({ id: z.string(), stars: z.number().int().min(1).max(5), comment: z.string().max(500).optional(), ridden: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const found = await ctx.db.select({ id: curatedRoutes.id }).from(curatedRoutes).where(eq(curatedRoutes.id, input.id)).limit(1);
      if (!found[0]) throw new TRPCError({ code: "NOT_FOUND", message: "unknown route" });
      await ctx.db
        .insert(routeRatings)
        .values({ routeId: input.id, userId: ctx.session.user.id, stars: input.stars, comment: input.comment ?? null, ridden: input.ridden ?? false })
        .onConflictDoUpdate({
          target: [routeRatings.routeId, routeRatings.userId],
          set: { stars: input.stars, comment: input.comment ?? null, ridden: input.ridden ?? false },
        });
      const [agg] = await ctx.db
        .select({ avg: sql<number>`avg(${routeRatings.stars})`, n: sql<number>`count(*)` })
        .from(routeRatings)
        .where(eq(routeRatings.routeId, input.id));
      await ctx.db.execute(
        sql`update "curated_routes" set "rating_avg" = ${Number(agg?.avg ?? 0)}, "rating_count" = ${Number(agg?.n ?? 0)} where "id" = ${input.id}`,
      );
      return true;
    }),
  // Community submission (§4.16/§5.5): copies a saved route or a ridden ride into the review queue.
  submit: protectedProcedure.input(z.object({ routeId: z.string().optional(), rideId: z.string().optional() })).mutation(async ({ ctx, input }) => {
    const uid = ctx.session.user.id;
    let nameEn = "Community route";
    let coords: [number, number][] = [];
    let distanceKm = 0;
    if (input.routeId) {
      const found = await ctx.db.select().from(savedRoutes).where(eq(savedRoutes.id, input.routeId)).limit(1);
      const route = found[0];
      if (!route) throw new TRPCError({ code: "NOT_FOUND", message: "unknown route" });
      if (route.userId !== uid) throw new TRPCError({ code: "FORBIDDEN", message: "owner only" });
      nameEn = route.name;
      coords = route.coords;
      distanceKm = route.km;
    } else if (input.rideId) {
      const found = await ctx.db.select().from(rides).where(eq(rides.id, input.rideId)).limit(1);
      const ride = found[0];
      if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "unknown ride" });
      if (ride.userId !== uid) throw new TRPCError({ code: "FORBIDDEN", message: "owner only" });
      nameEn = ride.name;
      coords = (ride.samples ?? []).map((s) => [s.lon, s.lat] as [number, number]);
      distanceKm = ride.distanceKm ?? 0;
    } else {
      throw new TRPCError({ code: "BAD_REQUEST", message: "routeId or rideId required" });
    }
    if (coords.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "route has no geometry to publish" });
    const [row] = await ctx.db
      .insert(curatedRoutes)
      .values({ nameEn, distanceKm, coords, status: "review", submittedBy: uid } as typeof curatedRoutes.$inferInsert)
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "submit failed" });
    await syncGeom(ctx.db, row.id, coords);
    return row;
  }),
  moderate: protectedProcedure.input(z.object({ id: z.string(), status: z.enum(["draft", "review", "published"]) })).mutation(async ({ ctx, input }) => {
    const role = (ctx.session.user as { role?: string } | null)?.role;
    if (role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "admin only" });
    const [row] = await ctx.db
      .update(curatedRoutes)
      .set({ status: input.status } as Partial<typeof curatedRoutes.$inferInsert>)
      .where(eq(curatedRoutes.id, input.id))
      .returning();
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "unknown route" });
    return row;
  }),
});
