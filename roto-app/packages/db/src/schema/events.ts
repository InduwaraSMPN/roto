import { index, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

// ponytail: challenges are DERIVED (monthly km sums from rides) — no challenge table to game
export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    place: text("place").notNull().default(""),
    lat: real("lat"),
    lon: real("lon"),
    startsAt: timestamp("starts_at").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("events_starts_idx").on(t.startsAt)],
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
  (t) => [index("rsvp_event_idx").on(t.eventId)],
);
