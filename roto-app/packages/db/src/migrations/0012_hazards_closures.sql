CREATE TABLE "closures" (
	"id" text PRIMARY KEY NOT NULL,
	"geom" geometry(Geometry,4326) NOT NULL,
	"reason" text,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"source" text DEFAULT 'user' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazard_votes" (
	"hazard_id" text NOT NULL,
	"user_id" text NOT NULL,
	"vote" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hazard_votes_hazard_id_user_id_pk" PRIMARY KEY("hazard_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "hazards" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"lat" real NOT NULL,
	"lon" real NOT NULL,
	"geom" geometry(Point,4326),
	"heading" real,
	"note" text,
	"reporter_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"confirmations" integer DEFAULT 0 NOT NULL,
	"dismissals" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hazard_votes" ADD CONSTRAINT "hazard_votes_hazard_id_hazards_id_fk" FOREIGN KEY ("hazard_id") REFERENCES "public"."hazards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazard_votes" ADD CONSTRAINT "hazard_votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazards" ADD CONSTRAINT "hazards_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "closures_geom_idx" ON "closures" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "closures_ends_idx" ON "closures" USING btree ("ends_at");--> statement-breakpoint
CREATE INDEX "hazards_kind_idx" ON "hazards" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "hazards_geom_idx" ON "hazards" USING gist ("geom");--> statement-breakpoint
-- rides.reportPoi used to create pois rows with kind='hazard' (feature-parity-plan §4.15). Move
-- those rows into the new hazards table (no reporter attribution existed on the old rows), then
-- remove them from pois so pois.kind never contains 'hazard' again.
-- Kind carries over as literal 'hazard' (the old schema had no sub-kind) rather than guessing a
-- specific new kind; it just won't match any of the hazards router's known kinds for filtering.
INSERT INTO "hazards" ("id", "kind", "lat", "lon", "geom", "note", "created_at", "status")
SELECT "id", 'hazard', "lat", "lon", "geom", "name_en", now(), 'active'
FROM "pois"
WHERE "kind" = 'hazard';--> statement-breakpoint
DELETE FROM "pois" WHERE "kind" = 'hazard';