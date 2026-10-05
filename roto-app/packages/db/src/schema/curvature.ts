import { index, pgTable, real, text } from "drizzle-orm/pg-core";
import { geometryColumn } from "./geo-column";

// 0017 (feature-parity-plan §5.5, §6): twisty-road layer. The batch job scores
// OSM ways with core/curvature and upserts here by way id; martin serves it as
// the `curvature` vector layer (styled fun ≥300, best ≥1000) and curvy-bias
// pulls routes onto high-score ways. `geom` mirrors the way's LineString.
export const roadCurvature = pgTable(
  "road_curvature",
  {
    osmWayId: text("osm_way_id").primaryKey(),
    name: text("name"),
    score: real("score").notNull(),
    geom: geometryColumn("geometry(LineString,4326)")("geom"),
  },
  (t) => [index("road_curvature_geom_idx").using("gist", t.geom)],
);
