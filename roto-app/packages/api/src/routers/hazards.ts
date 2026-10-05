// Rider-reported hazards + road closures (plan §4.15). Reads are public (offline packs,
// planner overlays); writes need an account.
// There is no transformer (no superjson): date inputs accept ISO strings via z.coerce.date()
// and timestamp columns arrive at clients as ISO strings.
// ponytail: vote counters are recounted from hazard_votes after every vote instead of +/-1
// increments — votes are rare, recounts stay exact under double-taps and vote switches.
import { closures, hazards, hazardVotes } from "@roto-app/db/schema/hazards";
import { TRPCError } from "@trpc/server";
import { and, count, eq, gt, inArray, isNull, lte, or, type SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../index";
import { alongRouteWhere, bboxIntersects, nearOrder, nearWhere } from "../lib/geo-query";

const HAZARD_KINDS = [
  "pothole",
  "gravel",
  "oil",
  "flood",
  "landslide",
  "animal_dog",
  "animal_elephant",
  "animal_cattle",
  "checkpoint",
  "speed_trap",
  "accident",
  "roadworks",
  "closure",
  "bus_stop_danger",
  "fallen_tree",
] as const;
type HazardKind = (typeof HAZARD_KINDS)[number];

const latLon = { lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) };
const lonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

/** Default expiry per kind (plan §4.15): checkpoints are transient, potholes persist. */
export function expiresAtFor(kind: HazardKind, from = new Date()): Date | null {
  const hours =
    kind === "checkpoint" ? 3
    : kind === "flood" ? 24
    : kind === "pothole" ? 24 * 30
    : kind.startsWith("animal_") ? 24 * 7
    : 12;
  return new Date(from.getTime() + hours * 3600_000);
}

function liveOnly(): SQL {
  const now = new Date();
  return and(eq(hazards.status, "active"), or(isNull(hazards.expiresAt), gt(hazards.expiresAt, now)))!;
}

export const hazardsRouter = router({
  report: protectedProcedure
    .input(
      z.object({
        kind: z.enum(HAZARD_KINDS),
        ...latLon,
        heading: z.number().min(0).max(360).optional(),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Simple per-user 20/day limit via a count query (no cron-gated table needed).
      const dayAgo = new Date(Date.now() - 24 * 3600_000);
      const todays = await ctx.db
        .select({ id: hazards.id })
        .from(hazards)
        .where(and(eq(hazards.reporterId, ctx.session.user.id), gt(hazards.createdAt, dayAgo)))
        .limit(21);
      if (todays.length >= 20) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "hazard report limit reached for today" });
      }
      const [row] = await ctx.db
        .insert(hazards)
        .values({
          kind: input.kind,
          lat: input.lat,
          lon: input.lon,
          geom: sql`ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)`,
          heading: input.heading ?? null,
          note: input.note ?? null,
          reporterId: ctx.session.user.id,
          expiresAt: expiresAtFor(input.kind),
        })
        .returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "report failed" });
      return row;
    }),

  near: publicProcedure
    .input(
      z.object({
        ...latLon,
        km: z.number().positive().max(100).default(5),
        kinds: z.array(z.enum(HAZARD_KINDS)).max(15).optional(),
        limit: z.number().int().positive().max(500).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conds: SQL[] = [
        liveOnly(),
        nearWhere(hazards.geom, hazards.lat, hazards.lon, input, input.km),
      ];
      if (input.kinds?.length) conds.push(inArray(hazards.kind, input.kinds));
      return ctx.db
        .select()
        .from(hazards)
        .where(and(...conds))
        .orderBy(nearOrder(hazards.geom, input.lon, input.lat))
        .limit(input.limit);
    }),

  alongRoute: publicProcedure
    .input(
      z.object({
        coords: z.array(lonLat).min(2).max(500),
        bufferM: z.number().positive().max(5000).default(300),
        kinds: z.array(z.enum(HAZARD_KINDS)).max(15).optional(),
        limit: z.number().int().positive().max(500).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conds: SQL[] = [
        liveOnly(),
        alongRouteWhere(hazards.geom, hazards.lat, hazards.lon, input.coords, input.bufferM),
      ];
      if (input.kinds?.length) conds.push(inArray(hazards.kind, input.kinds));
      return ctx.db.select().from(hazards).where(and(...conds)).limit(input.limit);
    }),

  vote: protectedProcedure
    .input(z.object({ hazardId: z.string(), vote: z.enum(["confirm", "gone"]) }))
    .mutation(async ({ ctx, input }) => {
      const [hazard] = await ctx.db.select().from(hazards).where(eq(hazards.id, input.hazardId)).limit(1);
      if (!hazard) throw new TRPCError({ code: "NOT_FOUND", message: "unknown hazard" });
      await ctx.db
        .insert(hazardVotes)
        .values({ hazardId: input.hazardId, userId: ctx.session.user.id, vote: input.vote })
        .onConflictDoUpdate({
          target: [hazardVotes.hazardId, hazardVotes.userId],
          set: { vote: input.vote },
        });
      const tally = async (vote: "confirm" | "gone") => {
        const [r] = await ctx.db
          .select({ n: count() })
          .from(hazardVotes)
          .where(and(eq(hazardVotes.hazardId, input.hazardId), eq(hazardVotes.vote, vote)));
        return r?.n ?? 0;
      };
      const confirmations = await tally("confirm");
      const dismissals = await tally("gone");
      const status = dismissals >= 3 ? "dismissed" : hazard.status;
      const [updated] = await ctx.db
        .update(hazards)
        .set({ confirmations, dismissals, status })
        .where(eq(hazards.id, input.hazardId))
        .returning({ confirmations: hazards.confirmations, dismissals: hazards.dismissals, status: hazards.status });
      return updated ?? { confirmations, dismissals, status };
    }),

  closures: router({
    list: publicProcedure
      .input(
        z.object({
          bbox: z.tuple([
            z.number().min(-180).max(180),
            z.number().min(-90).max(90),
            z.number().min(-180).max(180),
            z.number().min(-90).max(90),
          ]).optional(),
          limit: z.number().int().positive().max(500).optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const now = new Date();
        const conds: SQL[] = [
          or(isNull(closures.startsAt), lte(closures.startsAt, now))!,
          or(isNull(closures.endsAt), gt(closures.endsAt, now))!,
        ];
        if (input.bbox) conds.push(bboxIntersects(closures.geom, input.bbox));
        return ctx.db.select().from(closures).where(and(...conds)).limit(input.limit ?? 100);
      }),

    report: protectedProcedure
      .input(
        z.object({
          geom: z.union([
            z.object({
              wkt: z.string().min(1).max(20000).refine(
                (s) => /^(POINT|LINESTRING|POLYGON|MULTI(POINT|LINESTRING|POLYGON))\s*\(/i.test(s.trim()),
                { message: "expected WKT POINT, LINESTRING, POLYGON or MULTI* in SRID 4326" },
              ),
            }),
            z.object({ ...latLon, km: z.number().positive().max(50) }),
          ]),
          reason: z.string().max(200).optional(),
          note: z.string().max(500).optional(),
          startsAt: z.coerce.date().optional(),
          endsAt: z.coerce.date().optional(),
        }).refine((v) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt, {
          message: "endsAt must be after startsAt",
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const geom =
          "wkt" in input.geom
            ? sql`ST_GeomFromText(${input.geom.wkt}, 4326)`
            : sql`ST_Buffer(ST_SetSRID(ST_MakePoint(${input.geom.lon}, ${input.geom.lat}), 4326)::geography, ${input.geom.km * 1000})::geometry`;
        const [row] = await ctx.db
          .insert(closures)
          .values({
            geom,
            reason: input.reason ?? null,
            note: input.note ?? null,
            startsAt: input.startsAt ?? null,
            endsAt: input.endsAt ?? null,
            source: "user",
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "closure report failed" });
        return row;
      }),
  }),
});
