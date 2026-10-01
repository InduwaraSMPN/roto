// Background location task (plan §4.10). Imported first in app/_layout.tsx so the task is
// defined in both the foreground and the headless background JS contexts.
//
// Fixes flow: TaskManager fires RIDE_TASK with the screen off → fixes are appended to a local
// buffer (the existing `kv` table — no schema change) and re-emitted to any foreground
// subscriber (ride-recorder, group broadcast). If the app was killed mid-ride, the buffer is
// still on disk and `readBufferedFixes()` recovers it on the next stop.
//
// ponytail: expo-task-manager is not installed yet, so it is loaded with a guarded
// require() inside try/catch instead of a static import — Metro marks try-block requires as
// optional dependencies and skips them at bundle time when unresolvable, so the app still
// bundles and runs in Expo Go; ride-recorder falls back to a foreground watch until
// `npm install expo-task-manager` lands (see the install report). After installing, this
// same code resolves for real with no edits. expo-task-manager's own config plugin is NOT in
// app.json for the same reason — add `expo-task-manager` to plugins when installing.
declare const require: any;

import type { LocationObject } from "expo-location";

import { kvDelete, kvGet, kvSet } from "./kv";
import { syncInBackground } from "./sync";

export const RIDE_TASK = "roto-ride-location";

const BUFFER_KEY = "roto-ride-buffer";
const MAX_BUFFERED = 5000;

export type RideFix = {
  t: number;
  lon: number;
  lat: number;
  /** m/s, null when the OS reports none. */
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  altitude: number | null;
};

type FixListener = (fix: RideFix) => void;

const listeners = new Set<FixListener>();

export function subscribeFixes(fn: FixListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emitFixes(fixes: RideFix[]): void {
  for (const fix of fixes) {
    for (const fn of listeners) {
      try {
        fn(fix);
      } catch {
        // One bad subscriber must never drop fixes for the rest.
      }
    }
  }
}

function toRideFix(loc: LocationObject): RideFix {
  return {
    t: loc.timestamp ?? Date.now(),
    lon: loc.coords.longitude,
    lat: loc.coords.latitude,
    speed: loc.coords.speed ?? null,
    heading: loc.coords.heading ?? null,
    accuracy: loc.coords.accuracy ?? null,
    altitude: loc.coords.altitude ?? null,
  };
}

function loadTaskManager(): any | null {
  try {
    return require("expo-task-manager");
  } catch {
    return null;
  }
}

const TaskManager = loadTaskManager();

/** False until `npm install expo-task-manager` — callers must use the foreground fallback. */
export function isBackgroundLocationAvailable(): boolean {
  return TaskManager !== null;
}

export async function readBufferedFixes(): Promise<RideFix[]> {
  try {
    const raw = await kvGet(BUFFER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RideFix[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function appendBufferedFixes(fixes: RideFix[]): Promise<void> {
  const prev = await readBufferedFixes();
  const next = [...prev, ...fixes].slice(-MAX_BUFFERED);
  await kvSet(BUFFER_KEY, JSON.stringify(next));
}

export async function clearBufferedFixes(): Promise<void> {
  try {
    await kvDelete(BUFFER_KEY);
  } catch {
    // Best-effort — a stale buffer is merged by timestamp on stop, never duplicated.
  }
  // The recorder drains the buffer here and nowhere else, so this is where a ride has ended.
  // Best-effort offline sync: push the finished ride's track and refresh the POI/hazard caches
  // (plan §4.4). Debounced to once per 5 min and wrapped so it can never fail a ride stop.
  syncInBackground("ride-ended");
}

/** Set once the background task has run in this process, so only its first fire syncs. */
let didBootSync = false;

if (TaskManager) {
  TaskManager.defineTask(RIDE_TASK, async ({ data, error }: { data?: unknown; error?: unknown }) => {
    // The background task booting is also a reconnect: it only runs when the OS is willing to
    // run us, which is the closest thing this file has to a network signal. One poll per
    // process; `syncInBackground` is debounced and cannot fail the task.
    if (!didBootSync) {
      didBootSync = true;
      syncInBackground("background-task-boot");
    }
    if (error) return;
    const locations = (data as { locations?: LocationObject[] } | undefined)?.locations ?? [];
    if (!locations.length) return;
    const fixes = locations.map(toRideFix);
    emitFixes(fixes);
    try {
      await appendBufferedFixes(fixes);
    } catch {
      // Buffering is best-effort; the foreground subscribers already got their fixes.
    }
  });
}
