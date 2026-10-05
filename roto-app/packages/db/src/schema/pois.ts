import { boolean, index, jsonb, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { geometryColumn } from "./geo-column";

// 0009: expanded from schema/rides.ts (feature-parity-plan §4.14, §6). Kind set widened for the
// full POI matrix: fuel, ev, dealer, service, spares, hospital, police, food, hotel, camp,
// speed_camera, viewpoint. `hazard` rows are migrated to schema/hazards.ts in 0012 and no longer
// created here; the type is intentionally left as free text (not a pg enum) so a future OSM import
// can add kinds without another migration.
export const pois = pgTable(
  "pois",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    kind: text("kind").notNull(),
    nameEn: text("name_en").notNull(),
    nameSi: text("name_si"),
    nameTa: text("name_ta"),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    // Kept in sync with lat/lon on every write by the pois router; lat/lon stay the source of truth.
    geom: geometryColumn("geometry(Point,4326)")("geom"),
    osmId: text("osm_id").unique(),
    brand: text("brand"), // dealer/service/spares brand, e.g. "Honda" (packages/core/src/brands.ts)
    source: text("source").notNull().default("seed"), // seed | osm | user
    verified: boolean("verified").notNull().default(false),
    phone: text("phone"),
    hours: text("hours"), // free text, e.g. "06:00-22:00" or "24/7" — OSM opening_hours syntax varies too much to parse reliably
    meta: jsonb("meta").$type<Record<string, string>>(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("pois_kind_idx").on(t.kind), index("pois_geom_idx").using("gist", t.geom)],
);
