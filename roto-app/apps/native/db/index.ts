// Local Drizzle-on-expo-sqlite database (plan §3.6, A6). Postgres (packages/db) is server-only;
// this is the offline/logged-out store: queued rides, saved routes, POI/hazard/holiday caches,
// offline-pack metadata, learner progress, garage, reminders, kv and the local SOS contact
// mirror. Migrations are generated with `npx drizzle-kit generate` (see drizzle.config.ts) and
// bundled at build time via `./drizzle/migrations` (metro `.sql` + babel-plugin-inline-import,
// see metro.config.js/babel.config.js) — applied at startup by `useMigrations` in app/_layout.tsx.
import { drizzle } from "drizzle-orm/expo-sqlite";
import { openDatabaseSync } from "expo-sqlite";

import * as schema from "./schema";

export const sqlite = openDatabaseSync("roto.db");
export const db = drizzle(sqlite, { schema });
