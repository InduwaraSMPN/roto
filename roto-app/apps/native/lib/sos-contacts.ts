// Local mirror of SOS contacts (plan §4.12: "manual SOS works logged out/offline"). The server
// (`trpc.safety.contacts.*`) is the source of truth when signed in and online; this table is
// what the crash/manual SOS flow actually reads from, so it keeps working with no session and
// no network. app/(drawer)/safety.tsx calls `mirrorServerContacts()` after every successful
// server list/add/update/remove so the two stay in sync while signed in.
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { sosContactsLocal } from "@/db/schema";
import type { Lang } from "@/lib/i18n";

export type LocalSosContact = {
  id: string;
  serverId: string | null;
  name: string;
  phone: string;
  relation: string | null;
  lang: Lang;
  email: string | null;
  sortOrder: number;
};

function toLang(v: string): Lang {
  return v === "si" || v === "ta" ? v : "en";
}

export async function listLocalContacts(): Promise<LocalSosContact[]> {
  const rows = await db.select().from(sosContactsLocal).orderBy(asc(sosContactsLocal.sortOrder));
  return rows.map((r) => ({ ...r, lang: toLang(r.lang) }));
}

export async function upsertLocalContact(c: {
  id: string;
  serverId?: string | null;
  name: string;
  phone: string;
  relation?: string | null;
  lang: Lang;
  email?: string | null;
  sortOrder?: number;
}): Promise<void> {
  const values = {
    id: c.id,
    serverId: c.serverId ?? null,
    name: c.name,
    phone: c.phone,
    relation: c.relation ?? null,
    lang: c.lang,
    email: c.email ?? null,
    sortOrder: c.sortOrder ?? 0,
    updatedAt: Date.now(),
  };
  await db
    .insert(sosContactsLocal)
    .values(values)
    .onConflictDoUpdate({ target: sosContactsLocal.id, set: values });
}

export async function removeLocalContact(id: string): Promise<void> {
  await db.delete(sosContactsLocal).where(eq(sosContactsLocal.id, id));
}

export async function removeLocalContactByServerId(serverId: string): Promise<void> {
  await db.delete(sosContactsLocal).where(eq(sosContactsLocal.serverId, serverId));
}

export type ServerContact = {
  id: string;
  name: string;
  phone: string;
  relation: string | null;
  lang: string;
  email: string | null;
  sortOrder: number;
};

/** Replaces the local mirror of server-linked contacts with the given rows (keyed by server id,
 * prefixed `srv-` locally so a purely local, offline-added contact — id `local-...` — never
 * collides with one synced from the server). Locally-added contacts are left untouched. */
export async function mirrorServerContacts(rows: ServerContact[]): Promise<void> {
  for (const r of rows) {
    await upsertLocalContact({
      id: `srv-${r.id}`,
      serverId: r.id,
      name: r.name,
      phone: r.phone,
      relation: r.relation,
      lang: toLang(r.lang),
      email: r.email,
      sortOrder: r.sortOrder,
    });
  }
}
