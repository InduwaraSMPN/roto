import { index, pgTable, primaryKey, real, text, timestamp } from "drizzle-orm/pg-core";
import { geometryColumn } from "./geo-column";
import { user } from "./auth";

// ponytail: challenges are DERIVED (monthly km sums from rides) — no challenge table to game
export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    description: text("description"),
    place: text("place").notNull().default(""),
    lat: real("lat"),
    lon: real("lon"),
    // 0008: nullable point mirroring lat/lon (events without a place have neither).
    geom: geometryColumn("geometry(Point,4326)")("geom"),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at"),
    routeId: text("route_id"), // no FK yet (saved_routes lands later)
    orgId: text("org_id"), // club, no FK yet (organizations land with A16 community)
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("events_starts_idx").on(t.startsAt), index("events_geom_idx").using("gist", t.geom)],
);

export const eventRsvps = pgTable(
  "event_rsvps",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
);
