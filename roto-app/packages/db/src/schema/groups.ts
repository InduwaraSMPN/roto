import { pgTable, primaryKey, real, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

// ponytail: positions in-DB (not memory) so it works multi-instance on Vercel; 120s staleness filter at read
export const rideGroups = pgTable("ride_groups", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  routeId: text("route_id"), // shared route for the group, no FK yet (saved_routes lands later)
  regroupLat: real("regroup_lat"),
  regroupLon: real("regroup_lon"),
  endsAt: timestamp("ends_at"),
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
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
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
    heading: real("heading"),
    accuracyM: real("accuracy_m"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
);
