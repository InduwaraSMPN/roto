import { index, jsonb, pgTable, primaryKey, real, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

// ponytail: D3 — free push channel for SOS/live-trip alerts to contacts who have Roto; no SMS gateway yet
export const pushTokens = pgTable(
  "push_tokens",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: text("platform").notNull(), // ios | android
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.token] })],
);

// 0011 (feature-parity-plan §4.12, §6). `token` is a 128-bit random id (safety.startTrip), used
// as the unguessable public URL for /t/[token] — no account needed to view it, expires 24h after
// `endedAt`. Kept separate from `sosContacts`/`sosEvents` so a trip can be pinged many times
// without touching the events table.
export const liveTrips = pgTable(
  "live_trips",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
    lastLat: real("last_lat"),
    lastLon: real("last_lon"),
    lastSpeed: real("last_speed"),
    lastHeading: real("last_heading"),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    reason: text("reason"), // manual | crash | checkin — why the trip was started, informational only
  },
  (t) => [index("live_trips_user_idx").on(t.userId)],
);

// `channels` records what safety.trigger actually attempted/sent per contact-independent channel,
// e.g. { push: { sent: 2, failed: 0 }, email: { sent: 1, failed: 0 }, sms: "composer" } (D3: no
// server SMS gateway yet, so sms is always the client-side composer fallback marker for now).
export const sosEvents = pgTable(
  "sos_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tripId: text("trip_id").references(() => liveTrips.id, { onDelete: "set null" }),
    reason: text("reason").notNull(), // crash | manual | checkin
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    channels: jsonb("channels").$type<Record<string, unknown>>(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => [index("sos_events_user_idx").on(t.userId)],
);
