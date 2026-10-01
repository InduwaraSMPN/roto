// Offline ride queue, rewritten on the local Drizzle db (plan §3.6). Replaces the old hand-rolled
// expo-sqlite table in `roto-rides.db` with the shared `pendingRides` table in db/schema.ts, and
// carries the fuller stats/`samples` a ride now records (B12: gpx/samples/startedAt/endedAt/stats
// all travel together instead of only distanceKm/maxLean).
import { asc, eq, inArray } from "drizzle-orm";
import * as SQLite from "expo-sqlite";
import type { RideSample } from "@roto-app/core/types";

import { db } from "@/db";
import { kv, pendingRides, photoQueue } from "@/db/schema";

export type QueuedRide = {
  id: string;
  name: string;
  distanceKm: number;
  gpx: string | null;
  samples: RideSample[] | null;
  startedAt: number | null;
  endedAt: number | null;
  durationS: number | null;
  movingS: number | null;
  maxSpeedKmh: number | null;
  avgSpeedKmh: number | null;
  maxLean: number | null;
  elevationGainM: number | null;
  elevationLossM: number | null;
};

export type EnqueueRideInput = {
  id: string;
  name: string;
  distanceKm: number;
  gpx?: string;
  samples?: RideSample[];
  startedAt?: number;
  endedAt?: number;
  durationS?: number;
  movingS?: number;
  maxSpeedKmh?: number;
  avgSpeedKmh?: number;
  maxLean?: number;
  elevationGainM?: number;
  elevationLossM?: number;
};

export async function enqueueRide(r: EnqueueRideInput): Promise<void> {
  await db
    .insert(pendingRides)
    .values({
      id: r.id,
      name: r.name,
      distanceKm: r.distanceKm,
      gpx: r.gpx ?? null,
      samples: r.samples ? JSON.stringify(r.samples) : null,
      startedAt: r.startedAt ?? null,
      endedAt: r.endedAt ?? null,
      durationS: r.durationS ?? null,
      movingS: r.movingS ?? null,
      maxSpeedKmh: r.maxSpeedKmh ?? null,
      avgSpeedKmh: r.avgSpeedKmh ?? null,
      maxLean: r.maxLean ?? null,
      elevationGainM: r.elevationGainM ?? null,
      elevationLossM: r.elevationLossM ?? null,
      createdAt: Date.now(),
    })
    .onConflictDoNothing();
}

export async function listQueued(): Promise<QueuedRide[]> {
  const rows = await db.select().from(pendingRides).orderBy(asc(pendingRides.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    distanceKm: r.distanceKm,
    gpx: r.gpx,
    samples: r.samples ? (JSON.parse(r.samples) as RideSample[]) : null,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    durationS: r.durationS,
    movingS: r.movingS,
    maxSpeedKmh: r.maxSpeedKmh,
    avgSpeedKmh: r.avgSpeedKmh,
    maxLean: r.maxLean,
    elevationGainM: r.elevationGainM,
    elevationLossM: r.elevationLossM,
  }));
}

export async function clearQueued(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.delete(pendingRides).where(inArray(pendingRides.id, ids));
}

const LEGACY_MIGRATED_KEY = "legacy-ride-queue-migrated";
const LEGACY_DB_NAME = "roto-rides.db";

type LegacyRow = {
  id: string;
  name: string;
  distanceKm: number;
  gpx: string | null;
  createdAt: number | null;
  maxLean: number | null;
};

/**
 * One-time copy from the pre-Drizzle `roto-rides.db` (old hand-rolled `pending_rides` table)
 * into the new Drizzle-managed `roto.db`, then drops the legacy table. Idempotent via a `kv`
 * flag, so it's safe to call on every app start (app/_layout.tsx calls it once migrations
 * succeed). A fresh install has no legacy db at all — that's the normal, silent case below.
 */
export async function migrateLegacyQueue(): Promise<void> {
  const already = await db.select().from(kv).where(eq(kv.key, LEGACY_MIGRATED_KEY)).limit(1);
  if (already.length > 0) return;

  try {
    const legacy = SQLite.openDatabaseSync(LEGACY_DB_NAME);
    const rows = await legacy.getAllAsync<LegacyRow>("SELECT * FROM pending_rides").catch(() => []);
    for (const row of rows) {
      await db
        .insert(pendingRides)
        .values({
          id: row.id,
          name: row.name,
          distanceKm: row.distanceKm,
          gpx: row.gpx,
          maxLean: row.maxLean,
          createdAt: row.createdAt ?? Date.now(),
        })
        .onConflictDoNothing();
    }
    if (rows.length > 0) {
      await legacy.execAsync("DROP TABLE IF EXISTS pending_rides");
    }
  } catch {
    // No legacy db on a fresh install, or it's already gone — nothing to migrate.
  } finally {
    await db
      .insert(kv)
      .values({ key: LEGACY_MIGRATED_KEY, value: "1" })
      .onConflictDoUpdate({ target: kv.key, set: { value: "1" } });
  }
}

// --- Photo queue (plan §4.10) ---
// Photos taken offline wait here until `POST /upload` (Vercel Blob, parallel infra stream)
// succeeds. Queue-only for now: `@vercel/blob/client` is not installed in apps/native, so
// there is no direct-upload path yet — see `uploadQueuedPhotos`'s note. Appended 2026-09-28;
// everything above is untouched.

export type QueuedPhoto = {
  id: string;
  rideId: string;
  localUri: string;
  url: string | null;
  lat: number | null;
  lon: number | null;
  takenAt: number;
  caption: string | null;
  uploadedAt: number | null;
};

export async function enqueuePhoto(p: {
  id: string;
  rideId: string;
  localUri: string;
  lat?: number | null;
  lon?: number | null;
  caption?: string;
}): Promise<void> {
  await db
    .insert(photoQueue)
    .values({
      id: p.id,
      rideId: p.rideId,
      localUri: p.localUri,
      lat: p.lat ?? null,
      lon: p.lon ?? null,
      takenAt: Date.now(),
      caption: p.caption ?? null,
      createdAt: Date.now(),
    })
    .onConflictDoNothing();
}

export async function listPhotosForRide(rideId: string): Promise<QueuedPhoto[]> {
  return db.select().from(photoQueue).where(eq(photoQueue.rideId, rideId)).orderBy(asc(photoQueue.takenAt));
}

export async function listUnuploadedPhotos(): Promise<QueuedPhoto[]> {
  const rows = await db.select().from(photoQueue).orderBy(asc(photoQueue.createdAt));
  return rows.filter((r) => r.uploadedAt == null);
}

export async function markPhotoUploaded(id: string, url: string): Promise<void> {
  await db.update(photoQueue).set({ url, uploadedAt: Date.now() }).where(eq(photoQueue.id, id));
}

/**
 * Uploads every unuploaded photo. Queue-only until the `/upload` contract + a client upload
 * path land: there is currently no server `POST /upload` route and no `@vercel/blob/client`
 * in apps/native, so this resolves `{ uploaded: 0, pending: n, reason }` and leaves rows
 * queued. `uploadOne` is injected by the caller (the infra agent's contract) so this file
 * never hardcodes a URL shape.
 */
// ponytail: queue-only on purpose — direct Blob upload needs the parallel infra agent's
// `/upload` route + client package; when they land, pass an `uploadOne` that POSTs the file
// and returns its URL, and this function starts draining the queue with zero other changes.
export async function uploadQueuedPhotos(
  uploadOne?: (photo: QueuedPhoto) => Promise<string>,
): Promise<{ uploaded: number; pending: number; reason: string | null }> {
  const pending = await listUnuploadedPhotos();
  if (!uploadOne) {
    return { uploaded: 0, pending: pending.length, reason: "no-upload-contract" };
  }
  let uploaded = 0;
  for (const photo of pending) {
    try {
      const url = await uploadOne(photo);
      await markPhotoUploaded(photo.id, url);
      uploaded += 1;
    } catch {
      // Leave the row queued; the next sync retries it.
    }
  }
  return { uploaded, pending: pending.length - uploaded, reason: null };
}
