// Offline delta sync (plan §4.4, handoff "Not done"). One cursor-based poll the native app
// calls on app start, on reconnect and after a recording, so an offline ride gets its track
// uploaded and the offline caches (POIs, hazards, holidays, fuel, challenges) refresh without a
// full re-download.
//
// NOT registered in routers/index.ts on purpose — the integrator adds `sync: syncRouter` there.
// Everything here is public except the ride half, which is per-rider.
//
// There is no transformer (no superjson): `since` is an ISO datetime string, `now` is an ISO
// string to hand back as the next cursor, and every timestamp column arrives as an ISO string.
//
// ponytail: `limit` is a per-kind cap, not a total, and `truncated` just means "at least one
// kind hit the cap" — the client re-calls with the returned `now` to pick up the rest. A first
// sync on a device with a small `limit` therefore converges over a couple of polls rather than
// in one round trip; that is cheaper than shipping a full snapshot to a 2G phone.
import { challenges } from "@roto-app/db/schema/challenges";
import { fuelPrices } from "@roto-app/db/schema/fuel";
import { hazards } from "@roto-app/db/schema/hazards";
import { holidays } from "@roto-app/db/schema/holidays";
import { pois } from "@roto-app/db/schema/pois";
import { rides } from "@roto-app/db/schema/rides";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, gt, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../index";
import { colomboToday } from "./holidays";

const DELTA_KINDS = ["pois", "hazards", "holidays", "fuel", "challenges"] as const;
type DeltaKind = (typeof DELTA_KINDS)[number];

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

/** Same rule as `hazards.ts liveOnly()` — that helper is module-private, and duplicating two
 * lines is cheaper than exporting it for one caller. */
function liveHazards(now: Date): SQL {
  return and(eq(hazards.status, "active"), or(isNull(hazards.expiresAt), gt(hazards.expiresAt, now)))!;
}

function activeChallenges(now: Date): SQL {
  return and(lte(challenges.startsAt, now), gt(challenges.endsAt, now))!;
}

type PoiRow = typeof pois.$inferSelect;
type HazardRow = typeof hazards.$inferSelect;
type HolidayRow = typeof holidays.$inferSelect;
type FuelRow = typeof fuelPrices.$inferSelect;
type ChallengeRow = typeof challenges.$inferSelect;

export const syncRouter = router({
  /**
   * Everything that changed (or, with no `since`, everything) in ONE round trip.
   * `now` is the cursor for the next call. Only requested `kinds` are queried, so a
   * low-data caller can ask for `hazards` alone.
   */
  delta: publicProcedure
    .input(
      z
        .object({
          since: z.iso.datetime().optional(),
          offset: z.number().int().nonnegative().default(0),
          kinds: z.array(z.enum(DELTA_KINDS)).max(DELTA_KINDS.length).default([...DELTA_KINDS]),
          limit: z.number().int().positive().max(MAX_LIMIT).default(DEFAULT_LIMIT),
        })
        .default({ offset: 0, kinds: [...DELTA_KINDS], limit: DEFAULT_LIMIT }),
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const limit = input.limit;
      const wants = new Set<DeltaKind>(input.kinds);
      const since = input.since ? new Date(input.since) : null;

      let poiRows: PoiRow[] = [];
      let hazardRows: HazardRow[] = [];
      let holidayRows: HolidayRow[] = [];
      let fuelRows: FuelRow[] = [];
      let challengeRows: ChallengeRow[] = [];

      if (wants.has("pois")) {
        const conds: SQL[] = [];
        if (since) conds.push(gt(pois.updatedAt, since));
        // Ascending so a client that pages through a window always sees the oldest change
        // first; `id` breaks ties so the order is total. (Ordering by `id` alone would be a
        // random UUID order against a timestamp filter and could drop a changed row.)
        poiRows = await ctx.db
          .select()
          .from(pois)
          .where(conds.length ? and(...conds) : undefined)
          .orderBy(asc(pois.updatedAt), asc(pois.id))
          .limit(limit)
          .offset(input.offset);
      }

      if (wants.has("hazards")) {
        // Live-queried by status + expiry, never by `since`: a hazard that expired since the
        // last poll is gone server-side and the client drops it when the row stops arriving.
        hazardRows = await ctx.db
          .select()
          .from(hazards)
          .where(liveHazards(now))
          .orderBy(asc(hazards.id))
          .limit(limit)
          .offset(input.offset);
      }

      if (wants.has("holidays")) {
        // The whole calendar year is ~40 rows and is the only thing the offline planner shows,
        // so it is a full-year snapshot rather than a delta. Keyed by the Colombo year.
        const year = Number(colomboToday().slice(0, 4));
        holidayRows = await ctx.db
          .select()
          .from(holidays)
          .where(and(gte(holidays.date, `${year}-01-01`), lt(holidays.date, `${year + 1}-01-01`)))
          .orderBy(asc(holidays.date))
          .limit(limit)
          .offset(input.offset);
      }

      if (wants.has("fuel")) {
        // Latest row per fuelType. The table is append-only monthly history and the result is
        // ~5 rows, so there is nothing to gain from a `since` filter here.
        const rows = await ctx.db
          .select()
          .from(fuelPrices)
          .where(lte(fuelPrices.effectiveFrom, now))
          .orderBy(asc(fuelPrices.fuelType), asc(fuelPrices.effectiveFrom));
        const latest = new Map<string, FuelRow>();
        for (const row of rows) {
          const prev = latest.get(row.fuelType);
          if (!prev || prev.effectiveFrom < row.effectiveFrom) latest.set(row.fuelType, row);
        }
        fuelRows = [...latest.values()].sort((a, b) => a.fuelType.localeCompare(b.fuelType));
      }

      if (wants.has("challenges")) {
        // `challenges` has no updatedAt (only createdAt), so a delta uses createdAt; the
        // active-window filter is what makes the board correct on the phone.
        const conds: SQL[] = [activeChallenges(now)];
        if (since) conds.push(gt(challenges.createdAt, since));
        challengeRows = await ctx.db
          .select()
          .from(challenges)
          .where(and(...conds))
          .orderBy(asc(challenges.startsAt), asc(challenges.id))
          .limit(limit)
          .offset(input.offset);
      }

      const counts = {
        pois: poiRows.length,
        hazards: hazardRows.length,
        holidays: holidayRows.length,
        fuel: fuelRows.length,
        challenges: challengeRows.length,
      };
      const truncated = (Object.values(counts) as number[]).some((n) => n >= limit);

      return {
        now: now.toISOString(),
        truncated,
        pois: poiRows,
        hazards: hazardRows,
        holidays: holidayRows,
        fuel: fuelRows,
        challenges: challengeRows,
        counts,
      };
    }),

  /**
   * The caller's own rides that were synced as a stub and still have no track. A stub is a
   * ride created without `gpx` and/or `samples` (offline queue flush that lost the payload, or
   * a track too big to send on a metered link). The app re-uploads just the track with
   * `pushTrack` instead of creating the whole ride again.
   */
  pendingRides: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: rides.id,
        name: rides.name,
        startedAt: rides.startedAt,
        endedAt: rides.endedAt,
        distanceKm: rides.distanceKm,
        gpx: rides.gpx,
        hasSamples: sql<boolean>`${rides.samples} IS NOT NULL`.as("has_samples"),
      })
      .from(rides)
      .where(and(eq(rides.userId, ctx.session.user.id), or(isNull(rides.gpx), isNull(rides.samples))!))
      .orderBy(asc(rides.startedAt))
      .limit(200);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      distanceKm: r.distanceKm,
      missingGpx: r.gpx == null,
      missingSamples: !r.hasSamples,
    }));
  }),

  /** Fills a stub ride's track in place. Owner only, same sample cap as `rides.create`. */
  pushTrack: protectedProcedure
    .input(
      z.object({
        rideId: z.string().min(1),
        gpx: z.string().min(1).max(8_000_000).optional(),
        // Same 20 000 cap as rides.create (~5.5 h at 1 Hz). Privacy-zone points were already
        // trimmed on the device by lib/ride-recorder.ts before anything reached the queue.
        samples: z
          .array(
            z.object({
              t: z.number(),
              lon: z.number().min(-180).max(180),
              lat: z.number().min(-90).max(90),
              spd: z.number().optional(),
              ele: z.number().optional(),
              lean: z.number().optional(),
            }),
          )
          .max(20_000)
          .optional(),
        startedAt: z.string().optional(),
        endedAt: z.string().optional(),
      })
      .refine((v) => v.gpx !== undefined || v.samples !== undefined, {
        message: "gpx or samples required",
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [ride] = await ctx.db
        .select({ id: rides.id, userId: rides.userId })
        .from(rides)
        .where(eq(rides.id, input.rideId))
        .limit(1);
      if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "unknown ride" });
      if (ride.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "owner only" });
      }

      const [updated] = await ctx.db
        .update(rides)
        .set({
          ...(input.gpx !== undefined ? { gpx: input.gpx } : {}),
          ...(input.samples !== undefined ? { samples: input.samples } : {}),
          ...(input.startedAt ? { startedAt: new Date(input.startedAt) } : {}),
          ...(input.endedAt ? { endedAt: new Date(input.endedAt) } : {}),
        })
        .where(eq(rides.id, input.rideId))
        .returning({ id: rides.id });
      if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "track update failed" });
      // Never echo the payload back: a 20 000-sample array is ~1 MB of wasted response.
      return { rideId: updated.id, filledGpx: input.gpx !== undefined, filledSamples: input.samples !== undefined };
    }),
});
