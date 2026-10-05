import { index, integer, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

// 0019 (feature-parity-plan §5.3, §6): optional server backup of the garage
// (brand/model/year/reg/odometer). The local expo-sqlite `garage` table is the
// source of truth and works offline — rows only land here when signed in, and
// regNo syncs solely on explicit opt-in (number plates are sensitive).
export const garage = pgTable(
  "garage",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    brand: text("brand").notNull(),
    model: text("model").notNull(),
    year: integer("year"),
    regNo: text("reg_no"),
    odoKm: real("odo_km"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("garage_user_idx").on(t.userId)],
);
