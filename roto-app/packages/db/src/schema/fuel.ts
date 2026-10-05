import { index, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

// 0017 (feature-parity-plan §5.2, §6): Ceypetrol/Ceypetco pump prices, revised
// monthly. Rows are append-only history (never updated in place) — `current`
// is the latest effectiveFrom per fuelType. Admin-entered until a scraper lands.
export const fuelPrices = pgTable(
  "fuel_prices",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    fuelType: text("fuel_type").notNull(), // petrol92 | petrol95 | diesel | superDiesel | kerosene
    priceLkr: real("price_lkr").notNull(),
    effectiveFrom: timestamp("effective_from").notNull(),
    source: text("source").notNull(),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("fuel_prices_type_idx").on(t.fuelType)],
);
