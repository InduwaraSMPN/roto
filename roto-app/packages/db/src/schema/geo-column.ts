import { customType } from "drizzle-orm/pg-core";

// PostGIS geometry column with an exact SQL type (`geometry(Point,4326)`, `geometry(LineString,4326)`).
// drizzle-orm 0.45.2's built-in `geometry()` helper hardcodes `getSQLType()` to `"geometry(point)"`
// regardless of its `type`/`mode`/`srid` config (verified against
// node_modules/drizzle-orm/pg-core/columns/postgis_extension/geometry.cjs) — it can express neither
// a LineString column nor an SRID constraint. This customType leaves the JS value opaque; every
// read/write goes through raw `sql` (ST_MakePoint/ST_GeomFromGeoJSON/ST_AsGeoJSON etc.) in the
// routers that need PostGIS functions (pois, curated, hazards, closures) — see feature-parity-plan
// §2 A3, §6 0008.
export function geometryColumn(sqlType: "geometry(Point,4326)" | "geometry(LineString,4326)" | "geometry(Geometry,4326)") {
  return customType<{ data: unknown; driverData: string }>({
    dataType() {
      return sqlType;
    },
  });
}
