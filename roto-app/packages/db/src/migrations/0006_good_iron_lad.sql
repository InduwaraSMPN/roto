CREATE TABLE "push_tokens" (
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_user_id_token_pk" PRIMARY KEY("user_id","token")
);
--> statement-breakpoint
DROP INDEX "rsvp_event_idx";--> statement-breakpoint
DROP INDEX "members_group_idx";--> statement-breakpoint
DROP INDEX "live_group_idx";--> statement-breakpoint
-- hand-edit (B6): dedupe rows before the new composite PKs below, or the ADD CONSTRAINT fails on any
-- existing duplicate. event_rsvps/group_members keep an arbitrary survivor; live_positions keeps the
-- newest row per (group_id, user_id) so an in-flight live share doesn't lose its latest fix.
DELETE FROM "event_rsvps" a
USING "event_rsvps" b
WHERE a.event_id = b.event_id
	AND a.user_id = b.user_id
	AND a.ctid < b.ctid;
--> statement-breakpoint
DELETE FROM "group_members" a
USING "group_members" b
WHERE a.group_id = b.group_id
	AND a.user_id = b.user_id
	AND a.ctid < b.ctid;
--> statement-breakpoint
DELETE FROM "live_positions" a
USING "live_positions" b
WHERE a.group_id = b.group_id
	AND a.user_id = b.user_id
	AND (a.updated_at < b.updated_at OR (a.updated_at = b.updated_at AND a.ctid < b.ctid));
--> statement-breakpoint
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_event_id_user_id_pk" PRIMARY KEY("event_id","user_id");--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id");--> statement-breakpoint
ALTER TABLE "live_positions" ADD CONSTRAINT "live_positions_group_id_user_id_pk" PRIMARY KEY("group_id","user_id");--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "route_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "live_positions" ADD COLUMN "heading" real;--> statement-breakpoint
ALTER TABLE "live_positions" ADD COLUMN "accuracy_m" real;--> statement-breakpoint
ALTER TABLE "ride_groups" ADD COLUMN "route_id" text;--> statement-breakpoint
ALTER TABLE "ride_groups" ADD COLUMN "regroup_lat" real;--> statement-breakpoint
ALTER TABLE "ride_groups" ADD COLUMN "regroup_lon" real;--> statement-breakpoint
ALTER TABLE "ride_groups" ADD COLUMN "ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "duration_s" integer;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "moving_s" integer;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "max_speed_kmh" real;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "avg_speed_kmh" real;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "elevation_gain_m" real;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "elevation_loss_m" real;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "samples" jsonb;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "curvature" real;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "matched" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "hide_max_speed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "share_slug" text;--> statement-breakpoint
ALTER TABLE "sos_contacts" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "sos_contacts" ADD COLUMN "relation" text;--> statement-breakpoint
ALTER TABLE "sos_contacts" ADD COLUMN "lang" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "sos_contacts" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sos_contacts" ADD COLUMN "linked_user_id" text;--> statement-breakpoint
-- hand-edit (B16): delete orphan rows before the new user FKs below, or the ADD CONSTRAINT fails on any
-- row left behind by a hard-deleted account (no cascade existed until now).
DELETE FROM "rides" r
WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = r.user_id);
--> statement-breakpoint
DELETE FROM "sos_contacts" s
WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = s.user_id);
--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_contacts" ADD CONSTRAINT "sos_contacts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_contacts" ADD CONSTRAINT "sos_contacts_linked_user_id_user_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_share_slug_unique" UNIQUE("share_slug");
