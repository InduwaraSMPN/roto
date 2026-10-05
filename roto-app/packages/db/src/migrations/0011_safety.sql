CREATE TABLE "live_trips" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"last_lat" real,
	"last_lon" real,
	"last_speed" real,
	"last_heading" real,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"reason" text,
	CONSTRAINT "live_trips_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sos_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"trip_id" text,
	"reason" text NOT NULL,
	"lat" real NOT NULL,
	"lon" real NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"channels" jsonb,
	"resolved_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "live_trips" ADD CONSTRAINT "live_trips_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_events" ADD CONSTRAINT "sos_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_events" ADD CONSTRAINT "sos_events_trip_id_live_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."live_trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "live_trips_user_idx" ON "live_trips" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sos_events_user_idx" ON "sos_events" USING btree ("user_id");