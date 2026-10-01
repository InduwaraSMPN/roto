// Small local key/value helper over the `kv` Drizzle table (db/schema.ts). Used for state that
// should survive an app restart but doesn't need SecureStore's OS-level encryption — e.g. the
// active group id/code (B11: "persist group id/code in kv, restore via groups.mine").
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { kv } from "@/db/schema";

export async function kvGet(key: string): Promise<string | null> {
  const rows = await db.select().from(kv).where(eq(kv.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  await db
    .insert(kv)
    .values({ key, value })
    .onConflictDoUpdate({ target: kv.key, set: { value } });
}

export async function kvDelete(key: string): Promise<void> {
  await db.delete(kv).where(eq(kv.key, key));
}
