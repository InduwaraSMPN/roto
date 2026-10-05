import { simplify } from "@roto-app/core/geo";
import { parseGoogleMapsUrl } from "@roto-app/core/import/google-url";
import type { LonLat, Waypoint } from "@roto-app/core/types";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../index";
import { elevationProfile, planRoundTrip, planRoute, routeAttributes } from "../lib/routing";

const latLon = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });

const waypoint = latLon.extend({
  kind: z.enum(["break", "via", "through"]).optional(),
  name: z.string().optional(),
  heading: z.number().min(0).max(360).optional(),
});

const avoidOptions = z
  .object({
    tolls: z.boolean().optional(),
    ferries: z.boolean().optional(),
    unpaved: z.boolean().optional(),
    highways: z.boolean().optional(),
  })
  .optional();

const lang = z.enum(["en", "si", "ta"]).optional();

const MAX_ENGINE_WAYPOINTS = 25;

/**
 * B8 fix: the old `plan` input hard-capped at 25 waypoints and failed validation for anything
 * longer (e.g. a curated route's full coordinate list, or an imported GPX track). This still
 * caps the request body at a sane size, but the router itself reduces a longer waypoint list to
 * `MAX_ENGINE_WAYPOINTS` with Douglas-Peucker simplification before it ever reaches an engine, so
 * every caller (not just a client that remembers to downsample first) gets a working route.
 */
function reduceWaypoints(waypoints: Waypoint[]): Waypoint[] {
  if (waypoints.length <= MAX_ENGINE_WAYPOINTS) return waypoints;

  const coords: LonLat[] = waypoints.map((w) => [w.lon, w.lat]);
  let tolerance = 15;
  let simplified = simplify(coords, tolerance);
  for (let i = 0; i < 12 && simplified.length > MAX_ENGINE_WAYPOINTS; i++) {
    tolerance *= 2;
    simplified = simplify(coords, tolerance);
  }
  // Douglas-Peucker always keeps both endpoints but has no target point count; if a very dense
  // or noisy track is still over the limit, fall back to even sampling of what's left.
  if (simplified.length > MAX_ENGINE_WAYPOINTS) {
    const step = (simplified.length - 1) / (MAX_ENGINE_WAYPOINTS - 1);
    const sampled: LonLat[] = [];
    for (let i = 0; i < MAX_ENGINE_WAYPOINTS; i++) {
      const p = simplified[Math.min(Math.round(i * step), simplified.length - 1)];
      if (p) sampled.push(p);
    }
    simplified = sampled;
  }

  const first = waypoints[0];
  const last = waypoints[waypoints.length - 1];
  return simplified.map(([lon, lat], i) => {
    if (i === 0 && first) return { ...first, lat, lon };
    if (i === simplified.length - 1 && last) return { ...last, lat, lon };
    return { lat, lon, kind: "via" as const };
  });
}

export const routeRouter = router({
  plan: publicProcedure
    .input(
      z.object({
        waypoints: z.array(waypoint).min(2).max(500),
        curvy: z.number().min(0).max(1).default(0.5),
        avoid: avoidOptions,
        heading: z.number().min(0).max(360).optional(),
        alternates: z.number().min(0).max(2).optional(),
        elevation: z.boolean().optional(),
        lang,
      }),
    )
    .query(({ input }) =>
      planRoute({
        waypoints: reduceWaypoints(input.waypoints),
        curvy: input.curvy,
        avoid: input.avoid,
        heading: input.heading,
        alternates: input.alternates,
        elevation: input.elevation,
        lang: input.lang,
      }),
    ),

  roundTrip: publicProcedure
    .input(
      z.object({
        center: latLon,
        km: z.number().min(5).max(600).default(60),
        direction: z.number().min(0).max(359).optional(),
        curvy: z.number().min(0).max(1).default(0.7),
        avoid: avoidOptions,
        seed: z.number().optional(),
      }),
    )
    .query(({ input }) => planRoundTrip(input)),

  /** Mid-ride reroute with heading (plan §3.3) — degrades gracefully without Valhalla: BRouter/OSRM ignore `heading`. */
  reroute: publicProcedure
    .input(
      z.object({
        from: latLon,
        heading: z.number().min(0).max(360),
        remaining: z.array(waypoint).min(1).max(500),
        curvy: z.number().min(0).max(1).default(0.5),
        avoid: avoidOptions,
        lang,
      }),
    )
    .query(({ input }) =>
      planRoute({
        waypoints: reduceWaypoints([{ ...input.from, heading: input.heading }, ...input.remaining]),
        curvy: input.curvy,
        avoid: input.avoid,
        heading: input.heading,
        lang: input.lang,
      }),
    ),

  /** Per-segment speed limit/surface/road class — Valhalla only; capabilities on the result say so. */
  attributes: publicProcedure
    .input(z.object({ coords: z.array(z.tuple([z.number(), z.number()])).min(2).max(2000) }))
    .query(({ input }) => routeAttributes(input.coords as LonLat[])),

  elevation: publicProcedure
    .input(z.object({ coords: z.array(z.tuple([z.number(), z.number()])).min(2).max(2000) }))
    .query(({ input }) => elevationProfile(input.coords as LonLat[])),

  /** Resolves a (possibly short-linked) Google Maps URL server-side, then parses it into waypoints. */
  importUrl: publicProcedure.input(z.object({ url: z.string().url() })).query(async ({ input }) => {
    let finalUrl = input.url;
    try {
      const r = await fetch(input.url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(10000) });
      finalUrl = r.url || input.url;
    } catch {
      // Some Google Maps links aren't shortened and don't need a network round trip at all —
      // fall back to parsing the original URL if the fetch itself fails.
    }
    try {
      return parseGoogleMapsUrl(finalUrl);
    } catch (err) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: err instanceof Error ? err.message : "Could not read that link",
      });
    }
  }),
});
