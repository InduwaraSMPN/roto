import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

// 0018 (feature-parity-plan §4.17, §6): report queue for posts, comments, POI
// edits and curated submissions (admin-role gated), plus the Postgres-backed
// rate-limit store for hono-rate-limiter (hazard reports, SMS triggers,
// sign-up, uploads).
//
// ponytail: `targetId` stays plain text (polymorphic target — post, comment,
// poi, curated route) so deleting the target never cascades the report away;
// the moderation queue resolves against whatever still exists.
export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    targetType: text("target_type").notNull(), // post | comment | poi | route
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    reporterId: text("reporter_id").references(() => user.id, { onDelete: "set null" }),
    status: text("status").notNull().default("open"), // open | reviewing | resolved | dismissed
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("reports_status_idx").on(t.status), index("reports_target_idx").on(t.targetType, t.targetId)],
);

// ponytail: hits/resetAt are written on every throttled request, so this table
// churns — never join it, and the rate-limit lib prunes expired rows inline
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  hits: integer("hits").notNull().default(0),
  resetAt: timestamp("reset_at").notNull(),
});
