CREATE TABLE "route_folders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"folder_id" text,
	"name" text DEFAULT 'My route' NOT NULL,
	"waypoints" jsonb NOT NULL,
	"coords" jsonb NOT NULL,
	"maneuvers" jsonb,
	"options" jsonb,
	"km" real DEFAULT 0 NOT NULL,
	"min" real DEFAULT 0 NOT NULL,
	"engine" text,
	"curvature" real,
	"visibility" text DEFAULT 'private' NOT NULL,
	"share_slug" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saved_routes_share_slug_unique" UNIQUE("share_slug")
);
--> statement-breakpoint
ALTER TABLE "route_folders" ADD CONSTRAINT "route_folders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_routes" ADD CONSTRAINT "saved_routes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_routes" ADD CONSTRAINT "saved_routes_folder_id_route_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."route_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "route_folders_user_idx" ON "route_folders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_routes_user_idx" ON "saved_routes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_routes_folder_idx" ON "saved_routes" USING btree ("folder_id");