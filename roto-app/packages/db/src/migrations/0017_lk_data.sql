CREATE TABLE "road_curvature" (
	"osm_way_id" text PRIMARY KEY NOT NULL,
	"name" text,
	"score" real NOT NULL,
	"geom" geometry(LineString,4326)
);
--> statement-breakpoint
CREATE TABLE "fuel_prices" (
	"id" text PRIMARY KEY NOT NULL,
	"fuel_type" text NOT NULL,
	"price_lkr" real NOT NULL,
	"effective_from" timestamp NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"date" text PRIMARY KEY NOT NULL,
	"name_en" text NOT NULL,
	"name_si" text,
	"name_ta" text,
	"kind" text NOT NULL,
	"source" text DEFAULT 'calendarific' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "road_curvature_geom_idx" ON "road_curvature" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "fuel_prices_type_idx" ON "fuel_prices" USING btree ("fuel_type");--> statement-breakpoint
CREATE INDEX "holidays_kind_idx" ON "holidays" USING btree ("kind");