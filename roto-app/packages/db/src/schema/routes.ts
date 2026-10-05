import { index, integer, jsonb, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import type { Maneuver, PlanOptions, RouteEngine, Waypoint } from "@roto-app/core/types";
import { user } from "./auth";

// 0010: saved routes + folders (feature-parity-plan §4.7, §6). `coords` is [lon, lat][]
// (GeoJSON order, same convention as curated_routes); `options` is the PlanOptions the route
// was planned with, so "re-plan with live traffic/season" can replay it later.
export const routeFolders = pgTable(
  "route_folders",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("route_folders_user_idx").on(t.userId)],
);

export const savedRoutes = pgTable(
  "saved_routes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    folderId: text("folder_id").references(() => routeFolders.id, { onDelete: "set null" }),
    name: text("name").notNull().default("My route"),
    waypoints: jsonb("waypoints").$type<Waypoint[]>().notNull(),
    coords: jsonb("coords").$type<[number, number][]>().notNull(),
    maneuvers: jsonb("maneuvers").$type<Maneuver[]>(),
    options: jsonb("options").$type<PlanOptions>(),
    km: real("km").notNull().default(0),
    min: real("min").notNull().default(0),
    engine: text("engine").$type<RouteEngine>(),
    curvature: real("curvature"),
    visibility: text("visibility").notNull().default("private"), // private | unlisted | public
    shareSlug: text("share_slug").unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("saved_routes_user_idx").on(t.userId), index("saved_routes_folder_idx").on(t.folderId)],
);
