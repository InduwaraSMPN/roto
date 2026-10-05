import { boolean, index, integer, jsonb, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

// PostGIS is on since 0007; rides has no geom column of its own (samples/gpx carry the track).
export const rides = pgTable(
  "rides",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Ride"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
    distanceKm: real("distance_km").default(0).notNull(),
    durationS: integer("duration_s"),
    movingS: integer("moving_s"),
    maxSpeedKmh: real("max_speed_kmh"),
    avgSpeedKmh: real("avg_speed_kmh"),
    elevationGainM: real("elevation_gain_m"),
    elevationLossM: real("elevation_loss_m"),
    maxLeanDeg: real("max_lean_deg"), // ponytail: peak roll only v1, no per-corner graphs yet
    // ponytail: compact columnar samples {t,lon,lat,spd,ele?,lean?}[], trimmed of privacy-zone points before upload
    samples: jsonb("samples").$type<{ t: number; lon: number; lat: number; spd?: number; ele?: number; lean?: number }[]>(),
    curvature: real("curvature"),
    matched: boolean("matched").default(false).notNull(),
    visibility: text("visibility").notNull().default("private"), // private | unlisted | public
    hideMaxSpeed: boolean("hide_max_speed").default(false).notNull(),
    shareSlug: text("share_slug").unique(),
    gpx: text("gpx"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("rides_user_idx").on(t.userId)],
);

// ponytail: `pois` moved to schema/pois.ts in 0009 (feature-parity-plan §6). Nothing here imports
// it any more, but leaving this comment as a breadcrumb since routers/rides.ts still re-exports
// `rides.pois` as a bbox-only alias of the new pois router.

// 0013 (feature-parity-plan §4.10, §6). `url` is the Vercel Blob URL from POST /upload; lat/lon
// are the photo's EXIF GPS when present (pinned on the map), null otherwise.
export const ridePhotos = pgTable(
  "ride_photos",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    rideId: text("ride_id")
      .notNull()
      .references(() => rides.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    lat: real("lat"),
    lon: real("lon"),
    takenAt: timestamp("taken_at"),
    caption: text("caption"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("ride_photos_ride_idx").on(t.rideId)],
);

export const sosContacts = pgTable(
  "sos_contacts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"), // ponytail: D3 email channel, only used when set
    relation: text("relation"),
    lang: text("lang").notNull().default("en"),
    sortOrder: integer("sort_order").notNull().default(0),
    // ponytail: D3 free channels — links to an existing Roto account by phone/email match, set by safety.contacts.add/update
    linkedUserId: text("linked_user_id").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [index("sos_user_idx").on(t.userId)],
);
