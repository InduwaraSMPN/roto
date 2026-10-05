import { index, integer, pgTable, primaryKey, real, text, timestamp } from "drizzle-orm/pg-core";
import { geometryColumn } from "./geo-column";
import { user } from "./auth";

// 0012 (feature-parity-plan §4.15, §6). Kinds: pothole, gravel, oil, flood, landslide, animal_dog,
// animal_elephant, animal_cattle, checkpoint, speed_trap, accident, roadworks, closure,
// bus_stop_danger, fallen_tree. `status` moves active -> expired (time) or dismissed
// (dismissals >= 3, enforced by hazards.vote). Replaces `pois.kind = 'hazard'` (migrated in this
// same migration, then deleted from pois — see 0012 SQL).
export const hazards = pgTable(
  "hazards",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    kind: text("kind").notNull(),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    geom: geometryColumn("geometry(Point,4326)")("geom"),
    heading: real("heading"), // degrees, direction the hazard applies to (e.g. a checkpoint facing one way)
    note: text("note"),
    reporterId: text("reporter_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"), // default expiry per kind, set by the hazards router on report
    confirmations: integer("confirmations").notNull().default(0),
    dismissals: integer("dismissals").notNull().default(0),
    status: text("status").notNull().default("active"), // active | expired | dismissed
  },
  (t) => [index("hazards_kind_idx").on(t.kind), index("hazards_geom_idx").using("gist", t.geom)],
);

export const hazardVotes = pgTable(
  "hazard_votes",
  {
    hazardId: text("hazard_id")
      .notNull()
      .references(() => hazards.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vote: text("vote").notNull(), // confirm | gone
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.hazardId, t.userId] })],
);

// Mixed Point/LineString geometry (a single obstruction vs. a closed stretch of road) — generic
// `geometry(Geometry,4326)` rather than a fixed subtype. Buffered and passed to Valhalla as
// exclude_polygons by the routing lib when active (out of this agent's scope, see routing/**).
export const closures = pgTable(
  "closures",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    geom: geometryColumn("geometry(Geometry,4326)")("geom").notNull(),
    reason: text("reason"),
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    source: text("source").notNull().default("user"), // osm | user | holiday
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("closures_geom_idx").using("gist", t.geom), index("closures_ends_idx").on(t.endsAt)],
);
