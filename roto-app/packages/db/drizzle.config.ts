import { defineConfig } from "drizzle-kit";
import "varlock/auto-load";

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
  // 0007 turns PostGIS on (CREATE EXTENSION postgis). Without this, `generate`/`push` try to
  // diff postgis's own internal tables (geography_columns, geometry_columns, spatial_ref_sys)
  // in the public schema and produce noise. See feature-parity-plan §2 A3, §6 0007.
  extensionsFilters: ["postgis"],
});
