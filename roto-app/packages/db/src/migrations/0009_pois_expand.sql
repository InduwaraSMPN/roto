ALTER TABLE "pois" ADD COLUMN "osm_id" text;--> statement-breakpoint
ALTER TABLE "pois" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "pois" ADD COLUMN "source" text DEFAULT 'seed' NOT NULL;--> statement-breakpoint
ALTER TABLE "pois" ADD COLUMN "verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pois" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "pois" ADD COLUMN "hours" text;--> statement-breakpoint
ALTER TABLE "pois" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pois" ADD CONSTRAINT "pois_osm_id_unique" UNIQUE("osm_id");