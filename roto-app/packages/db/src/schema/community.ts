import { boolean, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

// 0015 (feature-parity-plan §4.16, §6): clubs feed, follows, badges, route ratings.
// `orgId`/`rideId`/`routeId` are plain text with no FK: orgs arrive with the
// auth organization plugin (0014), rides and saved routes already exist, but
// the spec keeps these links loose so a deleted ride/route never cascades
// away someone's post. Only user links cascade (GDPR deleteAccount relies on it).
export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    orgId: text("org_id"),
    body: text("body").notNull(),
    rideId: text("ride_id"),
    routeId: text("route_id"),
    photoUrl: text("photo_url"),
    visibility: text("visibility").notNull().default("private"), // private | unlisted | public
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("posts_user_idx").on(t.userId), index("posts_org_idx").on(t.orgId)],
);

export const postComments = pgTable(
  "post_comments",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("post_comments_post_idx").on(t.postId)],
);

// ponytail: one reaction per user per post (composite PK) — toggling is an
// upsert, no separate unlike path needed
export const postReactions = pgTable(
  "post_reactions",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull().default("like"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

export const follows = pgTable(
  "follows",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    followeeId: text("followee_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followeeId] })],
);

export const badges = pgTable(
  "badges",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    awardedAt: timestamp("awarded_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

// ponytail: one rating per user per route (composite PK) — re-rating overwrites
export const routeRatings = pgTable(
  "route_ratings",
  {
    routeId: text("route_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    stars: integer("stars").notNull(), // 1-5, enforced by the community router
    comment: text("comment"),
    ridden: boolean("ridden").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.routeId, t.userId] }), index("route_ratings_route_idx").on(t.routeId)],
);
