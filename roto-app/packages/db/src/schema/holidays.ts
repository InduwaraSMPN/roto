import { index, pgTable, text } from "drizzle-orm/pg-core";

// 0017 (feature-parity-plan §5.2, §6): LK Poya/public holidays. `date` is the
// TEXT primary key in YYYY-MM-DD form (Asia/Colombo date, no time component,
// so plain text sorts and compares correctly). Seeded yearly from Calendarific
// (source of truth — core/holidays.fullMoonsUtc is only an offline cross-check).
export const holidays = pgTable(
  "holidays",
  {
    date: text("date").primaryKey(),
    nameEn: text("name_en").notNull(),
    nameSi: text("name_si"),
    nameTa: text("name_ta"),
    kind: text("kind").notNull(), // poya | public | bank | mercantile
    source: text("source").notNull().default("calendarific"),
  },
  (t) => [index("holidays_kind_idx").on(t.kind)],
);
