import { defineConfig } from "drizzle-kit";

// Local expo-sqlite database (plan §3.6). Separate from packages/db's Postgres config — that
// one stays server-only. Run `npx drizzle-kit generate` from apps/native after changing db/schema.ts.
export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  driver: "expo",
});
