import { sql, type SQL } from "drizzle-orm";
import { rateLimiter, type Store } from "hono-rate-limiter";
import type { Context } from "hono";
import type { Database } from "@roto-app/db";

import { getDb } from "../services";

// ponytail: Postgres-backed sliding-window store for hono-rate-limiter (plan §4.17).
// Uses plain SQL via db.execute so this compiles and runs without importing the Drizzle
// table, which keeps the limiter usable before migration 0018 is applied. Column names must
// match migration 0018 exactly and they are snake_case (`key`, `hits`, `reset_at`) because
// that is what drizzle-kit generated from schema/moderation.ts — the earlier quoted camelCase
// `"reset_at"` form was a mismatch and every insert failed with 42703.
// Until 0018 is applied, hits fall back to a process-local map (approximate under
// multi-instance deploys; Vercel Services runs several) and PG is retried every 60 s.

const TABLE = '"rate_limits"';
const MISSING_TABLE_CODE = "42P01";
const PG_RETRY_MS = 60_000;

export function isMissingTable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === MISSING_TABLE_CODE
  );
}

type HitRow = { hits: number | string; resetAt: Date | string };

/**
 * `db.execute` with the node-postgres driver resolves to a `QueryResult` (an object with a
 * `.rows` array), NOT a bare array. Indexing the result directly gives `undefined` and every
 * caller throws "returned no row" — which is how the calendarific cron and the limiter were
 * 500-ing. Normalise here so every raw-SQL call site gets rows.
 */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

async function runQuery(query: SQL): Promise<HitRow[]> {
  return rowsOf<HitRow>(await getDb().execute(query));
}

async function hitPostgres(key: string, windowMs: number): Promise<{ hits: number; resetAt: Date }> {
  const resetAt = new Date(Date.now() + windowMs);
  const rows = await runQuery(sql`
    INSERT INTO ${sql.raw(TABLE)} ("key", "hits", "reset_at")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "hits" = CASE WHEN ${sql.raw(TABLE)}."reset_at" <= NOW() THEN 1 ELSE ${sql.raw(TABLE)}."hits" + 1 END,
      "reset_at" = CASE WHEN ${sql.raw(TABLE)}."reset_at" <= NOW() THEN ${resetAt} ELSE ${sql.raw(TABLE)}."reset_at" END
    RETURNING "hits", "reset_at"
  `);
  const row = rows[0];
  if (!row) throw new Error("rate-limit upsert returned no row");
  return { hits: Number(row.hits), resetAt: new Date(row.resetAt) };
}

// Process-local fallback while the rate_limits table does not exist yet.
const memHits = new Map<string, { hits: number; resetAt: number }>();
let pgDownUntil = 0;

async function hitMemory(key: string, windowMs: number): Promise<{ hits: number; resetAt: Date }> {
  const now = Date.now();
  const cur = memHits.get(key);
  if (!cur || cur.resetAt <= now) {
    const resetAt = now + windowMs;
    memHits.set(key, { hits: 1, resetAt });
    return { hits: 1, resetAt: new Date(resetAt) };
  }
  cur.hits += 1;
  return { hits: cur.hits, resetAt: new Date(cur.resetAt) };
}

async function hit(key: string, windowMs: number): Promise<{ hits: number; resetAt: Date }> {
  if (Date.now() < pgDownUntil) return hitMemory(key, windowMs);
  try {
    return await hitPostgres(key, windowMs);
  } catch (error) {
    if (isMissingTable(error)) {
      pgDownUntil = Date.now() + PG_RETRY_MS;
      return hitMemory(key, windowMs);
    }
    throw error;
  }
}

function createPostgresStore(windowMs: number, prefix: string): Store {
  const namespaced = (key: string) => `${prefix}:${key}`;
  return {
    localKeys: false,
    prefix,
    init: () => {},
    get: async (key: string) => {
      const full = namespaced(key);
      if (Date.now() < pgDownUntil) {
        const cur = memHits.get(full);
        if (!cur) return undefined;
        return { totalHits: cur.hits, resetTime: new Date(cur.resetAt) };
      }
      try {
        const rows = await runQuery(
          sql`SELECT "hits", "reset_at" FROM ${sql.raw(TABLE)} WHERE "key" = ${full}`,
        );
        const row = rows[0];
        if (!row) return undefined;
        return { totalHits: Number(row.hits), resetTime: new Date(row.resetAt) };
      } catch (error) {
        if (isMissingTable(error)) {
          pgDownUntil = Date.now() + PG_RETRY_MS;
          const cur = memHits.get(full);
          if (!cur) return undefined;
          return { totalHits: cur.hits, resetTime: new Date(cur.resetAt) };
        }
        throw error;
      }
    },
    increment: async (key: string) => {
      const r = await hit(namespaced(key), windowMs);
      return { totalHits: r.hits, resetTime: r.resetAt };
    },
    decrement: async (key: string) => {
      const full = namespaced(key);
      try {
        await runQuery(
          sql`UPDATE ${sql.raw(TABLE)} SET "hits" = GREATEST("hits" - 1, 0) WHERE "key" = ${full}`,
        );
      } catch (error) {
        if (isMissingTable(error)) {
          pgDownUntil = Date.now() + PG_RETRY_MS;
          const cur = memHits.get(full);
          if (cur) cur.hits = Math.max(0, cur.hits - 1);
          return;
        }
        throw error;
      }
    },
    resetKey: async (key: string) => {
      const full = namespaced(key);
      memHits.delete(full);
      try {
        await runQuery(sql`DELETE FROM ${sql.raw(TABLE)} WHERE "key" = ${full}`);
      } catch (error) {
        if (isMissingTable(error)) {
          pgDownUntil = Date.now() + PG_RETRY_MS;
          return;
        }
        throw error;
      }
    },
  };
}

function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = c.req.header("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

export function createRotoLimiter(opts: { windowMs: number; limit: number; prefix: string }) {
  return rateLimiter({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: "draft-6",
    keyGenerator: (c) => clientIp(c),
    store: createPostgresStore(opts.windowMs, opts.prefix),
  });
}

// ponytail: generous but bounded — photos are user-initiated bursts, cron is
// Bearer-secret gated so its limit only stops brute force, not Vercel Cron.
export const uploadLimiter = createRotoLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  prefix: "upload",
});

export const cronLimiter = createRotoLimiter({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  prefix: "cron",
});

// Helper for tRPC routers (no Hono context): hazard reports, SMS triggers,
// sign-up. Routers pass their own namespaced key, e.g. `sms:trigger:<userId>`,
// and throw a 429 themselves when allowed is false.
export async function checkRateLimit(
  db: Database,
  key: string,
  max: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const rows = rowsOf<HitRow>(
    await db.execute(
      sql`
        INSERT INTO ${sql.raw(TABLE)} ("key", "hits", "reset_at")
        VALUES (${key}, 1, ${new Date(Date.now() + windowMs)})
        ON CONFLICT ("key") DO UPDATE SET
          "hits" = CASE WHEN ${sql.raw(TABLE)}."reset_at" <= NOW() THEN 1 ELSE ${sql.raw(TABLE)}."hits" + 1 END,
          "reset_at" = CASE WHEN ${sql.raw(TABLE)}."reset_at" <= NOW() THEN EXCLUDED."reset_at" ELSE ${sql.raw(TABLE)}."reset_at" END
        RETURNING "hits", "reset_at"
      `,
    ),
  );
  const row = rows[0];
  if (!row) throw new Error("rate-limit upsert returned no row");
  const hits = Number(row.hits);
  return { allowed: hits <= max, remaining: Math.max(0, max - hits), resetAt: new Date(row.resetAt) };
}
