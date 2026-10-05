CREATE TABLE "badges" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"awarded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "badges_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" text NOT NULL,
	"followee_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id")
);
--> statement-breakpoint
CREATE TABLE "post_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_reactions" (
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text DEFAULT 'like' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "post_reactions_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text,
	"body" text NOT NULL,
	"ride_id" text,
	"route_id" text,
	"photo_url" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_ratings" (
	"route_id" text NOT NULL,
	"user_id" text NOT NULL,
	"stars" integer NOT NULL,
	"comment" text,
	"ridden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "route_ratings_route_id_user_id_pk" PRIMARY KEY("route_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "curated_routes" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "curated_routes" ADD COLUMN "description_en" text;--> statement-breakpoint
ALTER TABLE "curated_routes" ADD COLUMN "description_si" text;--> statement-breakpoint
ALTER TABLE "curated_routes" ADD COLUMN "description_ta" text;--> statement-breakpoint
ALTER TABLE "curated_routes" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "curated_routes" ADD COLUMN "curvature" real;--> statement-breakpoint
ALTER TABLE "curated_routes" ADD COLUMN "surface" text;--> statement-breakpoint
ALTER TABLE "curated_routes" ADD COLUMN "best_season" text;--> statement-breakpoint
ALTER TABLE "curated_routes" ADD COLUMN "rating_avg" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "curated_routes" ADD COLUMN "rating_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "curated_routes" ADD COLUMN "submitted_by" text;--> statement-breakpoint
ALTER TABLE "curated_routes" ADD COLUMN "status" text DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_user_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_ratings" ADD CONSTRAINT "route_ratings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_comments_post_idx" ON "post_comments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "posts_user_idx" ON "posts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "posts_org_idx" ON "posts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "route_ratings_route_idx" ON "route_ratings" USING btree ("route_id");--> statement-breakpoint
ALTER TABLE "curated_routes" ADD CONSTRAINT "curated_routes_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_routes" ADD CONSTRAINT "curated_routes_slug_unique" UNIQUE("slug");