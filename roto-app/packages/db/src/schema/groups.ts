import { index, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

// ponytail: positions in-DB (not memory) so it works multi-instance on Vercel; 120s staleness filter at read
export const rideGroups = pgTable("ride_groups", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => rideGroups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (t) => [index("members_group_idx").on(t.groupId)],
);

export const livePositions = pgTable(
  "live_positions",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => rideGroups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    speed: real("speed"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("live_group_idx").on(t.groupId)],
);
