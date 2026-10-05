// POI directory (plan §4.14). `rides.pois` / `rides.reportPoi` are kept as legacy aliases
// in routers/rides.ts — new clients use this router.
// There is no transformer (no superjson): timestamp columns arrive at clients as ISO strings.
// ponytail: list combines every supplied filter with AND and caps at `limit`; clients needing
// "fuel in the next 30 km" pass alongRoute with the remaining route and read the first rows
// (near-ordered when `near` is set, otherwise by updatedAt).
import { pois } from "@roto-app/db/schema/pois";
import { reports } from "@roto-app/db/schema/moderation";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../index";
import { alongRouteWhere, bboxWhere, nearOrder, nearWhere } from "../lib/geo-query";

const latLon = { lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) };
const bbox = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
const lonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const poisRouter = router({
  list: publicProcedure
    .input(
      z.object({
        kinds: z.array(z.string().min(1).max(40)).max(20).optional(),
        bbox: bbox.optional(),
        near: z.object({ ...latLon, km: z.number().positive().max(500).default(5) }).optional(),
        alongRoute: z.object({
          coords: z.array(lonLat).min(2).max(2000),
          bufferM: z.number().positive().max(20000).default(1000),
        }).optional(),
        limit: z.number().int().positive().max(1000).default(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conds: SQL[] = [];
      if (input.kinds?.length) conds.push(inArray(pois.kind, input.kinds));
      if (input.bbox) conds.push(bboxWhere(pois.lat, pois.lon, input.bbox));
      if (input.near) conds.push(nearWhere(pois.geom, pois.lat, pois.lon, input.near, input.near.km));
      if (input.alongRoute) {
        conds.push(alongRouteWhere(pois.geom, pois.lat, pois.lon, input.alongRoute.coords, input.alongRoute.bufferM));
      }
      const where = conds.length ? and(...conds) : undefined;
      const order = input.near ? nearOrder(pois.geom, input.near.lon, input.near.lat) : desc(pois.updatedAt);
      return ctx.db.select().from(pois).where(where).orderBy(order).limit(input.limit);
    }),

  get: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const [row] = await ctx.db.select().from(pois).where(eq(pois.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "unknown POI" });
    return row;
  }),

  // No direct user writes to pois — suggestions go to the moderation queue (plan §4.17).
  // reports.reason carries the patch as JSON: {"kind":"poi-edit","patch":{...}}.
  suggestEdit: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        patch: z.object({
          phone: z.string().max(40).optional(),
          hours: z.string().max(120).optional(),
          nameEn: z.string().min(1).max(160).optional(),
        }).refine((p) => p.phone !== undefined || p.hours !== undefined || p.nameEn !== undefined, {
          message: "patch must change at least one field",
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [poi] = await ctx.db.select({ id: pois.id }).from(pois).where(eq(pois.id, input.id)).limit(1);
      if (!poi) throw new TRPCError({ code: "NOT_FOUND", message: "unknown POI" });
      const [report] = await ctx.db
        .insert(reports)
        .values({
          targetType: "poi",
          targetId: input.id,
          reason: JSON.stringify({ kind: "poi-edit", patch: input.patch }),
          reporterId: ctx.session.user.id,
          status: "open",
        })
        .returning({ id: reports.id });
      return { reportId: report?.id ?? null };
    }),
});
