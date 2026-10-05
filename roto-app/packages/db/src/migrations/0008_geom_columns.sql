ALTER TABLE "curated_routes" ADD COLUMN "geom" geometry(LineString,4326);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "geom" geometry(Point,4326);--> statement-breakpoint
ALTER TABLE "pois" ADD COLUMN "geom" geometry(Point,4326);--> statement-breakpoint
ALTER TABLE "privacy_zones" ADD COLUMN "geom" geometry(Point,4326);--> statement-breakpoint
CREATE INDEX "curated_geom_idx" ON "curated_routes" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "events_geom_idx" ON "events" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "pois_geom_idx" ON "pois" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "privacy_geom_idx" ON "privacy_zones" USING gist ("geom");--> statement-breakpoint
-- Backfill from the existing lat/lon columns (pois, events, privacy_zones) and the `coords`
-- jsonb [lon, lat][] column (curated_routes, already GeoJSON-ordered). lat/lon stay the source of
-- truth going forward; the pois/curated routers keep geom in sync on every write.
UPDATE "pois" SET "geom" = ST_SetSRID(ST_MakePoint("lon", "lat"), 4326) WHERE "geom" IS NULL;--> statement-breakpoint
UPDATE "events" SET "geom" = ST_SetSRID(ST_MakePoint("lon", "lat"), 4326) WHERE "geom" IS NULL AND "lat" IS NOT NULL AND "lon" IS NOT NULL;--> statement-breakpoint
UPDATE "privacy_zones" SET "geom" = ST_SetSRID(ST_MakePoint("lon", "lat"), 4326) WHERE "geom" IS NULL;--> statement-breakpoint
UPDATE "curated_routes" SET "geom" = ST_SetSRID(ST_GeomFromGeoJSON(jsonb_build_object('type', 'LineString', 'coordinates', "coords")::text), 4326) WHERE "geom" IS NULL AND jsonb_array_length("coords") >= 2;
