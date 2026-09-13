CREATE TABLE "curated_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"name_en" text NOT NULL,
	"name_si" text,
	"name_ta" text,
	"region" text DEFAULT 'sri-lanka' NOT NULL,
	"difficulty" text DEFAULT 'easy' NOT NULL,
	"distance_km" real DEFAULT 0 NOT NULL,
	"coords" jsonb NOT NULL,
	"verified" text DEFAULT 'generated' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "curated_region_idx" ON "curated_routes" USING btree ("region");