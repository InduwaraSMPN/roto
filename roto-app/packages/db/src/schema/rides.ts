import { index, jsonb, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

// ponytail: lat/lon doubles now; PostGIS extension (migrations/0002) enables ST_* later without schema change
export const rides = pgTable(
  "rides",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    name: text("name").notNull().default("Ride"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
    distanceKm: real("distance_km").default(0).notNull(),
    maxLeanDeg: real("max_lean_deg"), // ponytail: peak roll only v1, no per-corner graphs yet
    gpx: text("gpx"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("rides_user_idx").on(t.userId)],
);

export const pois = pgTable(
  "pois",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    kind: text("kind").notNull(), // fuel | ev | dealer | service | hospital | police
    nameEn: text("name_en").notNull(),
    nameSi: text("name_si"),
    nameTa: text("name_ta"),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    meta: jsonb("meta").$type<Record<string, string>>(),
  },
  (t) => [index("pois_kind_idx").on(t.kind)],
);

export const sosContacts = pgTable(
  "sos_contacts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
  },
  (t) => [index("sos_user_idx").on(t.userId)],
);
