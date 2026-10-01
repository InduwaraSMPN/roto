// Offline delta sync (plan §4.4 — the `sync.delta` stub the handoff lists as not done).
//
// One polling endpoint covers both halves of "the app works offline": it refreshes the local
// caches that the map/planner read while signed out or in airplane mode, and it tells the app
// which server rides are still missing a track so a stub ride gets its payload re-uploaded
// without re-creating the whole ride.
//
// ponytail: a single poll per 5 minutes per process, no network-state listener and no
// background job. The three call sites (app start, background-task boot, ride end) plus this
// debounce cover the cases that matter; `expo-network` reconnect subscription is the upgrade
// when a rider complains that a long tunnel ride only syncs when they reopen the app.
//
// ponytail: `trpc.sync` is reached through a local shape + cast because `syncRouter` is not in
// `appRouter` yet (the integrator registers it). The options proxy answers any path, so an
// un-registered router surfaces as a failed delta call — wrapped, that is "sync did nothing"
// instead of a broken app start.
import type { FetchQueryOptions } from "@tanstack/react-query";
import type { RideSample } from "@roto-app/core/types";

import { db } from "@/db";
import { hazardCache, holidays, poiCache, referenceCache } from "@/db/schema";
import { authClient } from "@/lib/auth-client";
import { kvGet, kvSet } from "@/lib/kv";
import { clearQueued, listQueued, type QueuedRide } from "@/lib/ride-queue";
import { queryClient, trpc } from "@/utils/trpc";

/** `kv` key holding the last `sync.delta` `now` (the delta cursor). */
export const SYNC_CURSOR_KEY = "sync-cursor-v2";

/** At most one sync per 5 minutes per process, and never two at once. */
export const SYNC_DEBOUNCE_MS = 5 * 60 * 1000;

/** A first sync that keeps coming back `truncated` stops after this many rounds; the next
 * debounce window picks up where this one left off with the saved cursor. */
const MAX_TRUNCATION_ROUNDS = 10;

const SAMPLE_CAP = 20_000;

// --- server shapes (mirrored from packages/api/src/routers/sync.ts) -------------

type PoiRow = {
  id: string;
  kind: string;
  nameEn: string;
  nameSi: string | null;
  nameTa: string | null;
  lat: number;
  lon: number;
  updatedAt: string;
};

type HazardRow = {
  id: string;
  kind: string;
  lat: number;
  lon: number;
  note: string | null;
  createdAt: string;
  expiresAt: string | null;
};

type HolidayRow = {
  date: string;
  nameEn: string;
  nameSi: string | null;
  nameTa: string | null;
  kind: string;
  source: string;
};

type FuelRow = {
  id: string;
  fuelType: string;
  priceLkr: number;
  effectiveFrom: string;
  source: string;
  sourceUrl: string | null;
};

type ChallengeRow = {
  id: string;
  slug: string;
  nameEn: string;
  nameSi: string | null;
  nameTa: string | null;
  kind: string;
  target: number;
  startsAt: string;
  endsAt: string;
};

export type SyncDelta = {
  now: string;
  truncated: boolean;
  pois: PoiRow[];
  hazards: HazardRow[];
  holidays: HolidayRow[];
  fuel: FuelRow[];
  challenges: ChallengeRow[];
  counts: Record<string, number>;
};

export type PendingServerRide = {
  id: string;
  name: string;
  startedAt: string;
  endedAt: string | null;
  distanceKm: number;
  missingGpx: boolean;
  missingSamples: boolean;
};

type DeltaInput = { since?: string; offset?: number; limit?: number };

type PushTrackInput = {
  rideId: string;
  gpx?: string;
  samples?: RideSample[];
  startedAt?: string;
  endedAt?: string;
};

type SyncApi = {
  delta: { queryOptions: (input: DeltaInput) => FetchQueryOptions<SyncDelta> };
  pendingRides: { queryOptions: () => FetchQueryOptions<PendingServerRide[]> };
  pushTrack: (input: PushTrackInput) => Promise<unknown>;
};

/** `sync` is missing from `AppRouter` until the integrator registers `syncRouter`; the cast is
 * what lets this file compile before then. */
function syncApi(): SyncApi {
  return (trpc as unknown as { sync: SyncApi }).sync;
}

export type SyncCounts = {
  pois: number;
  hazards: number;
  holidays: number;
  fuel: number;
  challenges: number;
  tracks: number;
};

export type SyncOutcome = {
  ok: boolean;
  /** false when the debounce window swallowed the call without touching the network. */
  ran: boolean;
  reason: string | null;
  counts: SyncCounts;
  rounds?: number;
};

const ZERO_COUNTS: SyncCounts = {
  pois: 0,
  hazards: 0,
  holidays: 0,
  fuel: 0,
  challenges: 0,
  tracks: 0,
};

// --- debounce ------------------------------------------------------------------

let lastRunAt = 0;
let inFlight: Promise<SyncOutcome> | null = null;

/**
 * Pulls the delta, writes the local caches and pushes any pending ride tracks. Never rejects —
 * offline-first invariant: a failed sync is a no-op, not a crash. Debounced to one run per
 * 5 minutes per process, and concurrent calls share the running promise.
 * `force` skips the debounce (still never concurrent) — for the "sync now" button.
 */
export async function syncNow(opts: { force?: boolean } = {}): Promise<SyncOutcome> {
  if (inFlight) return inFlight;
  if (!opts.force && Date.now() - lastRunAt < SYNC_DEBOUNCE_MS) {
    return { ok: true, ran: false, reason: "debounced", counts: { ...ZERO_COUNTS } };
  }
  // Stamped before the run, so a failed attempt also backs off — otherwise a dead server is
  // hammered from three call sites on every app start.
  lastRunAt = Date.now();
  inFlight = run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Fire-and-forget wrapper for call sites. `reason` is a dev-only log label. */
export function syncInBackground(reason: string, opts: { force?: boolean } = {}): void {
  if (__DEV__) console.log(`[sync] ${reason}`);
  void syncNow(opts).then(
    (outcome) => {
      if (__DEV__ && outcome.reason) console.log(`[sync] ${reason}: ${outcome.reason}`);
    },
    (error: unknown) => {
      if (__DEV__) console.warn(`[sync] ${reason} failed`, error);
    },
  );
}

// --- the run -------------------------------------------------------------------

async function run(): Promise<SyncOutcome> {
  const counts: SyncCounts = { ...ZERO_COUNTS };
  const api = syncApi();

  let cursor: string | null = null;
  try {
    cursor = await kvGet(SYNC_CURSOR_KEY).catch(() => null);
  } catch {
    // No cursor yet: the first delta returns everything, capped by the server's limit.
  }

  let rounds = 0;
  try {
    // Keep `since` fixed while paging; advancing it here skips older rows beyond page one.
    const since = cursor;
    let nextCursor: string | null = null;
    for (; rounds < MAX_TRUNCATION_ROUNDS; rounds += 1) {
      const delta = await queryClient.fetchQuery(
        api.delta.queryOptions({ ...(since ? { since } : {}), offset: rounds * 2000, limit: 2000 }),
      );
      await applyDelta(delta, counts, rounds === 0);
      nextCursor ??= delta.now;
      if (!delta.truncated) break;
    }
    if (rounds === MAX_TRUNCATION_ROUNDS) throw new Error("sync page limit reached");
    if (nextCursor) await kvSet(SYNC_CURSOR_KEY, nextCursor);
  } catch (error) {
    if (__DEV__) console.warn("[sync] delta failed", error);
    return { ok: false, ran: true, reason: "delta-failed", counts, rounds: rounds + 1 };
  }

  try {
    counts.tracks = await pushPendingTracks(api);
  } catch (error) {
    if (__DEV__) console.warn("[sync] track push failed", error);
  }

  return { ok: true, ran: true, reason: null, counts, rounds: rounds + 1 };
}

function ms(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : fallback;
}

async function applyDelta(delta: SyncDelta, counts: SyncCounts, firstPage: boolean): Promise<void> {
  const now = Date.now();

  for (const p of delta.pois ?? []) {
    const values = {
      id: p.id,
      kind: p.kind,
      nameEn: p.nameEn,
      // OSM supplies these; a null means the rider sees the English name in every language,
      // which is the documented degradation until the name is translated.
      nameSi: p.nameSi ?? null,
      nameTa: p.nameTa ?? null,
      lat: p.lat,
      lon: p.lon,
      updatedAt: ms(p.updatedAt, now),
    };
    await db.insert(poiCache).values(values).onConflictDoUpdate({ target: poiCache.id, set: values });
  }
  counts.pois += delta.pois?.length ?? 0;

  // Hazards are a live snapshot. Clear once, then accumulate all pages.
  if (firstPage) await db.delete(hazardCache);

  for (const h of delta.hazards ?? []) {
    const values = {
      id: h.id,
      kind: h.kind,
      lat: h.lat,
      lon: h.lon,
      note: h.note ?? null,
      updatedAt: ms(h.createdAt, now),
    };
    await db.insert(hazardCache).values(values).onConflictDoUpdate({ target: hazardCache.id, set: values });
  }
  counts.hazards += delta.hazards?.length ?? 0;

  for (const h of delta.holidays ?? []) {
    const values = {
      date: h.date,
      nameEn: h.nameEn,
      nameSi: h.nameSi ?? null,
      nameTa: h.nameTa ?? null,
      kind: h.kind,
    };
    await db.insert(holidays).values(values).onConflictDoUpdate({ target: holidays.date, set: values });
  }
  counts.holidays += delta.holidays?.length ?? 0;

  // Fuel and challenges have no typed local table: they land in `reference_cache` as JSON.
  for (const f of delta.fuel ?? []) {
    const values = {
      kind: "fuel",
      key: f.fuelType,
      value: JSON.stringify(f),
      updatedAt: ms(f.effectiveFrom, now),
    };
    await db
      .insert(referenceCache)
      .values(values)
      .onConflictDoUpdate({ target: [referenceCache.kind, referenceCache.key], set: values });
  }
  counts.fuel += delta.fuel?.length ?? 0;

  for (const c of delta.challenges ?? []) {
    const values = {
      kind: "challenges",
      key: c.id,
      value: JSON.stringify(c),
      updatedAt: ms(c.startsAt, now),
    };
    await db
      .insert(referenceCache)
      .values(values)
      .onConflictDoUpdate({ target: [referenceCache.kind, referenceCache.key], set: values });
  }
  counts.challenges += delta.challenges?.length ?? 0;
}

// --- pending ride tracks -------------------------------------------------------

/**
 * Re-uploads the track of rides the server only has a stub of, so a ride recorded offline
 * ends up whole without being created twice. The local queue id is not the server id, so
 * rows are matched on `startedAt` (the client sets it and `rides.create` stores it) and only
 * fall back to the name when exactly one queued ride carries that name.
 */
async function pushPendingTracks(api: SyncApi): Promise<number> {
  const session = await authClient.getSession().catch(() => null);
  if (!session?.data?.user) return 0;

  const queued = await listQueued().catch(() => []);
  if (!queued.length) return 0;
  const serverPending = await queryClient.fetchQuery(api.pendingRides.queryOptions());
  if (!serverPending.length) return 0;

  const pushed: string[] = [];
  for (const serverRide of serverPending) {
    const local = matchQueued(queued, serverRide);
    if (!local) continue;
    const gpx = local.gpx ?? undefined;
    const samples = local.samples && local.samples.length ? local.samples.slice(0, SAMPLE_CAP) : undefined;
    if (!gpx && !samples) continue;
    try {
      await api.pushTrack({
        rideId: serverRide.id,
        ...(gpx ? { gpx } : {}),
        ...(samples ? { samples } : {}),
        ...(local.startedAt ? { startedAt: new Date(local.startedAt).toISOString() } : {}),
        ...(local.endedAt ? { endedAt: new Date(local.endedAt).toISOString() } : {}),
      });
      pushed.push(local.id);
    } catch (error) {
      // One failure must not stop the rest; the row stays queued for the next sync.
      if (__DEV__) console.warn("[sync] pushTrack failed", error);
    }
  }
  // The server now holds the track, so the queue row has done its job. Dropping it also stops
  // map.tsx's "sync queued rides" button from creating a duplicate ride.
  if (pushed.length) await clearQueued(pushed);
  return pushed.length;
}

function matchQueued(queued: QueuedRide[], serverRide: PendingServerRide): QueuedRide | null {
  const t = Date.parse(serverRide.startedAt);
  if (Number.isFinite(t)) {
    const byTime = queued.find((q) => q.startedAt != null && Math.abs(q.startedAt - t) < 1000);
    if (byTime) return byTime;
  }
  // Names repeat ("Ride 28/09/2026"), so only accept an unambiguous one.
  const sameName = queued.filter((q) => q.name === serverRide.name);
  return sameName.length === 1 ? (sameName[0] ?? null) : null;
}
