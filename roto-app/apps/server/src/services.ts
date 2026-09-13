import { createAuth as createConfiguredAuth } from "@roto-app/auth";
import { type Database, createDb } from "@roto-app/db";

import { env } from "./env.server";

const db = createDb(env);

export function getDb(): Database {
  return db;
}
export const auth = createConfiguredAuth(env, db);
