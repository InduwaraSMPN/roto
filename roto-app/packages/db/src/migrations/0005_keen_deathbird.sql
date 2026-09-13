CREATE TABLE "privacy_zones" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text DEFAULT 'Home' NOT NULL,
	"lat" real NOT NULL,
	"lon" real NOT NULL,
	"radius_m" real DEFAULT 200 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "privacy_zones" ADD CONSTRAINT "privacy_zones_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "privacy_user_idx" ON "privacy_zones" USING btree ("user_id");