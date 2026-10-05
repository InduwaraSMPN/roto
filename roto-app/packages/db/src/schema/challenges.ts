import { index, pgTable, primaryKey, real, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

// 0016 (feature-parity-plan §4.16, §6): challenges replace the derived-only
// approach noted in schema/events.ts — explicit challenge rows with progress
// derived on ride sync, plus POI/route check-ins.
export const challenges = pgTable(
  "challenges",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    slug: text("slug").notNull().unique(),
    nameEn: text("name_en").notNull(),
    nameSi: text("name_si"),
    nameTa: text("name_ta"),
    kind: text("kind").notNull(), // distance | route | checkin | streak
    target: real("target").notNull(), // km for distance, count otherwise
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    orgId: text("org_id"), // club challenge; plain text, no FK (see community.ts)
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("challenges_org_idx").on(t.orgId)],
);

// ponytail: derived on ride sync (one row per rider per challenge), never
// written by clients directly — the challenges router owns it
export const challengeProgress = pgTable(
  "challenge_progress",
  {
    challengeId: text("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    km: real("km").notNull().default(0),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.challengeId, t.userId] })],
);

// `at` is the recorded fix time (not the insert time). `poiId`/`routeId` are
// plain text with no FK — a deleted POI must not cascade away check-in history.
export const checkins = pgTable(
  "checkins",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    poiId: text("poi_id"),
    routeId: text("route_id"),
    at: timestamp("at").notNull(),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("checkins_user_idx").on(t.userId)],
);
