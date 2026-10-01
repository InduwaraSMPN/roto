// Local on-device store (plan §3.6, A6: "Drizzle on expo-sqlite"). Postgres (`packages/db`)
// stays server-only; this is everything the app needs while offline or signed out. Column
// names are snake_case (drizzle-kit default for sqlite); JS-side fields stay camelCase.
import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Rides recorded on this phone, waiting to sync (replaces the old hand-rolled `pending_rides`
 * table in `roto-rides.db` — see lib/ride-queue.ts `migrateLegacyQueue()`). */
export const pendingRides = sqliteTable("pending_rides", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  distanceKm: real("distance_km").notNull().default(0),
  gpx: text("gpx"),
  /** JSON-encoded `RideSample[]` (@roto-app/core/types) — trimmed by privacy zones before storage. */
  samples: text("samples"),
  startedAt: integer("started_at"),
  endedAt: integer("ended_at"),
  durationS: integer("duration_s"),
  movingS: integer("moving_s"),
  maxSpeedKmh: real("max_speed_kmh"),
  avgSpeedKmh: real("avg_speed_kmh"),
  maxLean: real("max_lean"),
  elevationGainM: real("elevation_gain_m"),
  elevationLossM: real("elevation_loss_m"),
  createdAt: integer("created_at").notNull(),
});

/** Routes the rider saved on-device (planned or imported), for offline reuse. */
export const savedRoutes = sqliteTable("saved_routes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** JSON-encoded `LonLat[]`. */
  coords: text("coords").notNull(),
  km: real("km").notNull().default(0),
  min: real("min").notNull().default(0),
  engine: text("engine").notNull().default("gps"),
  createdAt: integer("created_at").notNull(),
});

/** Bbox-fetched POIs cached for offline map/browsing use. */
export const poiCache = sqliteTable("poi_cache", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  nameEn: text("name_en").notNull(),
  // OSM carries name:si / name:ta, and the repo invariant is that a rider-facing name has
  // all three languages. Offline map labels pick by language, so the cache keeps them too.
  nameSi: text("name_si"),
  nameTa: text("name_ta"),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Hazard reports cached for offline route warnings. */
export const hazardCache = sqliteTable("hazard_cache", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  note: text("note"),
  updatedAt: integer("updated_at").notNull(),
});

/** Poya/public holiday cache (plan §5.2) so the planner works offline. */
export const holidays = sqliteTable("holidays", {
  date: text("date").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameSi: text("name_si"),
  nameTa: text("name_ta"),
  kind: text("kind").notNull(),
});

/** Metadata mirror of MapLibre `OfflineManager` packs (name/region/size), so the offline-packs
 * screen can list packs without asking the native offline manager on every render. */
export const packs = sqliteTable("packs", {
  name: text("name").primaryKey(),
  region: text("region").notNull(),
  sizeBytes: integer("size_bytes"),
  downloadedAt: integer("downloaded_at"),
});

/** Learner module quiz/completion state (plan §5.3, D12). */
export const learnerProgress = sqliteTable("learner_progress", {
  moduleId: text("module_id").primaryKey(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  quizScore: integer("quiz_score"),
  updatedAt: integer("updated_at").notNull(),
});

/** The rider's own bike(s) — brand/model/reg no. stay device-only (plan §5.3). */
export const garage = sqliteTable("garage", {
  id: text("id").primaryKey(),
  brand: text("brand").notNull(),
  model: text("model"),
  year: integer("year"),
  regNo: text("reg_no"),
  odometerKm: real("odometer_km"),
});

/** Revenue licence / insurance / service reminders, scheduled as local notifications. */
export const reminders = sqliteTable("reminders", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  dueAt: integer("due_at"),
  dueKm: real("due_km"),
  note: text("note"),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
});

/** Generic small key/value store — replaces scattered SecureStore/AsyncStorage flags for things
 * that don't need OS-level encryption (e.g. the active group id/code, B11). */
export const kv = sqliteTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** JSON blobs the delta sync (lib/sync.ts) has no typed table for: `kind` "fuel" keyed by
 * fuelType and `kind` "challenges" keyed by challenge id. One table instead of two more
 * schemas — a typed table only pays off once a screen reads the rows field by field, and
 * nothing reads fuel/challenges from SQLite offline yet (they go through tRPC).
 * `updatedAt` is the server `updatedAt`/`createdAt` in ms, so a later delta can be skipped
 * locally without a round trip. */
export const referenceCache = sqliteTable(
  "reference_cache",
  {
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    /** JSON-encoded server row. */
    value: text("value").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.key] })],
);

/** Mirror of server `sos_contacts` plus phone-only contacts, so manual SOS works logged out or
 * offline (plan §4.12). `serverId` links a row back to `packages/db` `sos_contacts.id` once
 * synced; a purely local contact (added while signed out) has `serverId = null`. */
export const sosContactsLocal = sqliteTable("sos_contacts_local", {  id: text("id").primaryKey(),
  serverId: text("server_id"),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  relation: text("relation"),
  lang: text("lang").notNull().default("en"),
  email: text("email"),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

/** Ride photos taken offline, waiting to upload (plan §4.10). Rows are created by
 * `components/ride/photo-button.tsx` via `lib/ride-queue.ts` and uploaded on sync to
 * `POST /upload` (Vercel Blob, parallel infra stream); `uploadedAt` marks done, `url` keeps
 * the remote URL afterwards. `lat`/`lon` are nulled at capture when the photo falls inside
 * a privacy zone, so zone interiors never leave the phone.
 *
 * NOTE on task mapping: the brief asked for `learner_progress(slug PK, doneLesson, quizBest)`
 * and `garage_local` tables — both already exist here under earlier names and are reused
 * instead of duplicated: `learnerProgress` (`module_id` = slug, `completed` = doneLesson,
 * `quiz_score` = quizBest) and `garage` (+ `reminders`), both device-only per their comments.
 * Only `photo_queue` was genuinely missing, so it is the single new table in that migration;
 * `reference_cache` (migration 0002, for the delta sync in lib/sync.ts) is the only one since. */
export const photoQueue = sqliteTable("photo_queue", {
  id: text("id").primaryKey(),
  /** Local pending_ride id, or the server ride id once synced. */
  rideId: text("ride_id").notNull(),
  /** Local file URI (expo FileSystem path) until uploaded. */
  localUri: text("local_uri").notNull(),
  /** Remote URL after a successful upload. */
  url: text("url"),
  lat: real("lat"),
  lon: real("lon"),
  takenAt: integer("taken_at").notNull(),
  caption: text("caption"),
  uploadedAt: integer("uploaded_at"),
  createdAt: integer("created_at").notNull(),
});
