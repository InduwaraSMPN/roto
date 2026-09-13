import type { createAuth } from "@roto-app/auth";
import type { Database } from "@roto-app/db";

export type Context = {
  auth: null;
  session: Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>>;
  db: Database;
};
