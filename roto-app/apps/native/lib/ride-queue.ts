import * as SQLite from "expo-sqlite";

// ponytail: expo-sqlite queue now; Legend/WatermelonDB only if this measurably falls short
let db: SQLite.SQLiteDatabase | null = null;

export async function queueDb() {
  if (!db) {
    db = await SQLite.openDatabaseAsync("roto-rides.db");
    await db.execAsync(
      "CREATE TABLE IF NOT EXISTS pending_rides (id TEXT PRIMARY KEY, name TEXT, distanceKm REAL, gpx TEXT, createdAt INTEGER);",
    );
    await db.execAsync("ALTER TABLE pending_rides ADD COLUMN maxLean REAL").catch(() => {
      // column already there
    });
  }
  return db;
}

export async function enqueueRide(r: { id: string; name: string; distanceKm: number; maxLean?: number; gpx?: string }) {
  const d = await queueDb();
  await d.runAsync("INSERT OR REPLACE INTO pending_rides VALUES (?,?,?,?,?,?)", [
    r.id,
    r.name,
    r.distanceKm,
    r.gpx ?? null,
    Date.now(),
    r.maxLean ?? null,
  ]);
}

export async function listQueued(): Promise<{ id: string; name: string; distanceKm: number; maxLean: number | null; gpx: string | null }[]> {
  const d = await queueDb();
  return d.getAllAsync("SELECT * FROM pending_rides ORDER BY createdAt");
}

export async function clearQueued(ids: string[]) {
  if (!ids.length) return;
  const d = await queueDb();
  await d.runAsync(`DELETE FROM pending_rides WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
}
