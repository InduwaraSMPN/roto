import { index, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { geometryColumn } from "./geo-column";
import { user } from "./auth";

// ponytail: home/work masking only — points inside a zone are trimmed on export, live broadcast suppressed
export const privacyZones = pgTable(
  "privacy_zones",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Home"),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    // 0008: point mirroring lat/lon; never sent anywhere off-device but useful for admin/geo tooling.
    geom: geometryColumn("geometry(Point,4326)")("geom"),
    radiusM: real("radius_m").notNull().default(200),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("privacy_user_idx").on(t.userId), index("privacy_geom_idx").using("gist", t.geom)],
);
