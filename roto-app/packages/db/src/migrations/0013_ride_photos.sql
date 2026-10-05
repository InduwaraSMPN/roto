CREATE TABLE "ride_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"ride_id" text NOT NULL,
	"user_id" text NOT NULL,
	"url" text NOT NULL,
	"lat" real,
	"lon" real,
	"taken_at" timestamp,
	"caption" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ride_photos" ADD CONSTRAINT "ride_photos_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_photos" ADD CONSTRAINT "ride_photos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ride_photos_ride_idx" ON "ride_photos" USING btree ("ride_id");