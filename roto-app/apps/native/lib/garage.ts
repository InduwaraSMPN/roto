// Garage + reminders, device-local first (plan §5.3). Bikes (brand/model/reg no.) stay on
// the device; `reminders` holds revenue-licence / insurance / emission-test / oil-change dues.
// The rows in SQLite are the source of truth for "what is due"; `expo-notifications` only surfaces
// them, so a rider who blocks notifications still sees every due item in the in-app list.
// Scheduling: a date reminder gets an OS alarm at 3 days out (or 30 min before, whichever is
// sooner); a km reminder (oil change) fires as soon as an app run sees `currentKm >= dueKm`.
// Server backup via `trpc.garage.save/load` is attempted only when signed in AND those procedures
// exist — everything here works offline and signed out.
// ponytail: oil-change km is derived from synced ride km (`rides.mine` distanceKm sum) plus the
// odometer baseline at bike creation; a per-bike last-service odometer would be the upgrade once
// the server garage router lands.
import { asc, eq } from "drizzle-orm";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

import { db } from "@/db";
import { garage, reminders } from "@/db/schema";
import { authClient } from "@/lib/auth-client";
import { interpolate, type Lang } from "@/lib/i18n";
import { NATIVE_MORE, type MoreStrings } from "@/lib/i18n-more";
import { kvGet, kvSet } from "@/lib/kv";
import { queryClient, trpc } from "@/utils/trpc";

export type Bike = {
  id: string;
  brand: string;
  model: string | null;
  year: number | null;
  regNo: string | null;
  odometerKm: number | null;
};

export type ReminderKind = "revenue-licence" | "insurance" | "emission" | "oil-change";

export type Reminder = {
  id: string;
  kind: ReminderKind;
  dueAt: number | null;
  dueKm: number | null;
  note: string | null;
  done: boolean;
};

const DUE_LIST_KEY = "roto-reminders-due";
/** `contexts/lang-context.tsx` writes the active language here; read back so notification text
 *  follows the language the rider actually chose without every call site passing it. */
const LANG_KEY = "roto-lang";
const NOTIFIED_KEY = "roto-reminders-notified";
const CHANNEL_ID = "roto-reminders";
const NOTIF_PREFIX = "roto-reminder-";
/** Nudge this many days before a date due date. */
const LEAD_DAYS = 3;
/** …or this long before it, whichever is sooner. */
const NEAR_MIN_MS = 30 * 60_000;
/** A "due now" reminder is posted a few seconds out rather than inline, so it is a real alarm the
 *  rider can still cancel by marking the reminder done, and so it survives this screen closing. */
const DUE_SOON_MS = 10_000;
/** DESIGN.md: signal yellow is the only accent, and the notification dot is the one place a
 *  system notification is allowed to use it. */
const SIGNAL_YELLOW = "#FFB300";

function toKind(v: string): ReminderKind {
  return v === "revenue-licence" || v === "insurance" || v === "emission" || v === "oil-change"
    ? v
    : "revenue-licence";
}

export async function listBikes(): Promise<Bike[]> {
  const rows = await db.select().from(garage).orderBy(asc(garage.brand));
  return rows.map((r) => ({
    id: r.id,
    brand: r.brand,
    model: r.model,
    year: r.year,
    regNo: r.regNo,
    odometerKm: r.odometerKm,
  }));
}

export async function upsertBike(b: {
  id: string;
  brand: string;
  model?: string | null;
  year?: number | null;
  regNo?: string | null;
  odometerKm?: number | null;
}): Promise<void> {
  const values = {
    id: b.id,
    brand: b.brand,
    model: b.model ?? null,
    year: b.year ?? null,
    regNo: b.regNo ?? null,
    odometerKm: b.odometerKm ?? null,
  };
  await db.insert(garage).values(values).onConflictDoUpdate({ target: garage.id, set: values });
  void backupToServer().catch(() => undefined);
}

export async function removeBike(id: string): Promise<void> {
  await db.delete(garage).where(eq(garage.id, id));
  void backupToServer().catch(() => undefined);
}

export async function listReminders(): Promise<Reminder[]> {
  const rows = await db.select().from(reminders).orderBy(asc(reminders.dueAt));
  return rows.map((r) => ({
    id: r.id,
    kind: toKind(r.kind),
    dueAt: r.dueAt,
    dueKm: r.dueKm,
    note: r.note,
    done: !!r.done,
  }));
}

export async function upsertReminder(r: {
  id: string;
  kind: ReminderKind;
  dueAt?: number | null;
  dueKm?: number | null;
  note?: string | null;
}): Promise<void> {
  const values = {
    id: r.id,
    kind: r.kind,
    dueAt: r.dueAt ?? null,
    dueKm: r.dueKm ?? null,
    note: r.note ?? null,
    done: false as boolean,
  };
  await db.insert(reminders).values(values).onConflictDoUpdate({ target: reminders.id, set: values });
  void scheduleReminderNotifications().catch(() => undefined);
}

export async function markReminderDone(id: string, done = true): Promise<void> {
  await db.update(reminders).set({ done }).where(eq(reminders.id, id));
  if (done) await cancelReminderNotification(id);
  void scheduleReminderNotifications().catch(() => undefined);
}

export async function removeReminder(id: string): Promise<void> {
  await db.delete(reminders).where(eq(reminders.id, id));
  await cancelReminderNotification(id);
  await forgetNotified(id);
  void scheduleReminderNotifications().catch(() => undefined);
}

/** Total km ridden since `sinceMs`, from the server ride history (0 offline). */
export async function syncedKmSince(sinceMs: number): Promise<number> {
  try {
    const rows = await queryClient.fetchQuery(trpc.rides.mine.queryOptions({ limit: 200 }));
    let total = 0;
    for (const r of rows as { distanceKm?: number | null; startedAt?: string | Date | null }[]) {
      const at = r.startedAt ? new Date(r.startedAt).getTime() : 0;
      if (at >= sinceMs) total += r.distanceKm ?? 0;
    }
    return Math.round(total * 10) / 10;
  } catch {
    return 0;
  }
}

/**
 * Oil-change dues: every bike gets an `oil-change` reminder at `odometerKm + intervalKm`
 * when any exists, evaluated against odometer + synced ride km. Default interval 3000 km.
 */
export async function ensureOilReminders(intervalKm = 3000): Promise<Reminder[]> {
  const bikes = await listBikes();
  const existing = await listReminders();
  const out: Reminder[] = [...existing];
  for (const bike of bikes) {
    const base = bike.odometerKm ?? 0;
    const has = existing.some((r) => r.kind === "oil-change" && (r.note ?? "").includes(bike.id));
    if (!has) {
      const id = `oil-${bike.id}`;
      const values = {
        id,
        kind: "oil-change" as ReminderKind,
        dueAt: null as number | null,
        dueKm: base + intervalKm,
        note: `${bike.brand} ${bike.model ?? ""} · bike:${bike.id}`.trim(),
        done: false as boolean,
      };
      await db.insert(reminders).values(values).onConflictDoUpdate({ target: reminders.id, set: values });
      out.push({ id, kind: "oil-change", dueAt: null, dueKm: base + intervalKm, note: values.note, done: false });
    }
  }
  return out;
}

/** Reminders currently due (date passed, or km threshold reached at `currentKm`). */
export async function listDueReminders(currentKm?: number): Promise<Reminder[]> {
  const now = Date.now();
  const all = await listReminders();
  return all.filter((r) => {
    if (r.done) return false;
    if (r.dueAt != null && r.dueAt <= now) return true;
    if (r.dueKm != null && currentKm != null && currentKm >= r.dueKm) return true;
    return false;
  });
}

/**
 * Odometer as Roto can best know it: the highest odometer the rider typed for any bike, plus every
 * km of ride Roto has synced. Used to decide whether a km-based reminder (oil change) is due.
 *
 * ponytail: one rider-wide synced total, not per-bike. The local `garage` table has no per-bike
 * trip log and adding one means a `db/schema.ts` migration, which this file does not own. With one
 * bike — the common case in Sri Lanka — this is exact. Splitting synced km per bike needs a
 * `bikeId` on `rides` first.
 */
export async function currentOdometerKm(): Promise<number> {
  const bikes = await listBikes();
  const base = bikes.reduce((max, b) => Math.max(max, b.odometerKm ?? 0), 0);
  const synced = await syncedKmSince(0);
  return Math.round((base + synced) * 10) / 10;
}

export type ScheduleResult = { scheduled: boolean; reason: string | null };

type Plan = {
  /** Changes when the threshold moves, so a due-now nudge fires once per threshold, not per call. */
  stamp: string;
  title: string;
  body: string;
  /** Epoch ms for a real alarm, or null for "already due — post it in a few seconds". */
  at: number | null;
};

function reminderLabel(m: MoreStrings, kind: ReminderKind): string {
  if (kind === "insurance") return m.remInsurance;
  if (kind === "emission") return m.remEmission;
  if (kind === "oil-change") return m.remOil;
  return m.remRevenue;
}

/** `ensureOilReminders` writes `"honda Activa · bike:abc"`; the notification only wants the first part. */
function bikeFromNote(note: string | null): string {
  const head = (note ?? "").split("·")[0]?.trim() ?? "";
  return head.length > 0 ? head : "";
}

function dateBody(m: MoreStrings, lang: Lang, dueAt: number): string {
  return interpolate(m.notifBodyDueOn, { date: new Date(dueAt).toLocaleDateString(lang) });
}

function kmBody(m: MoreStrings, r: Reminder): string {
  return interpolate(m.notifBodyDueKm, { km: r.dueKm ?? 0, bike: bikeFromNote(r.note) });
}

/** When (and whether) to notify for one reminder, given the km the rider has actually covered. */
function planReminder(m: MoreStrings, lang: Lang, r: Reminder, currentKm: number, now: number): Plan | null {
  const kind = reminderLabel(m, r.kind);
  const kmDue = r.dueKm != null && currentKm >= r.dueKm;
  const dateDue = r.dueAt != null && r.dueAt <= now;

  if (kmDue || dateDue) {
    // Both can be set on one row; the date is the more precise of the two.
    const body = r.dueAt != null ? dateBody(m, lang, r.dueAt) : kmBody(m, r);
    return {
      stamp: `${r.dueAt ?? 0}:${r.dueKm ?? 0}`,
      title: interpolate(m.notifDueTitle, { kind }),
      body,
      at: null,
    };
  }

  if (r.dueAt == null) return null;
  // 3 days out, or 30 min before, whichever lands first — and never in the past.
  const fire = Math.min(r.dueAt - LEAD_DAYS * 864e5, r.dueAt - NEAR_MIN_MS);
  if (fire <= now) return null;
  const soon = fire < r.dueAt - LEAD_DAYS * 864e5;
  return {
    stamp: `${r.dueAt}:${r.dueKm ?? 0}`,
    title: interpolate(soon ? m.notifDueSoonTitle : m.notifDueTitle, { kind }),
    body: dateBody(m, lang, r.dueAt),
    at: fire,
  };
}

async function readReminderLang(override?: Lang): Promise<Lang> {
  if (override) return override;
  try {
    const v = await SecureStore.getItemAsync(LANG_KEY);
    return v === "si" || v === "ta" ? v : "en";
  } catch {
    return "en";
  }
}

async function loadNotified(): Promise<Record<string, string>> {
  const raw = await kvGet(NOTIFIED_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, string>;
  } catch {
    // Corrupt marker store: start over, worst case one extra nudge.
  }
  return {};
}

async function forgetNotified(id: string): Promise<void> {
  const map = await loadNotified();
  if (map[id] === undefined) return;
  delete map[id];
  await kvSet(NOTIFIED_KEY, JSON.stringify(map));
}

/** Drops a single reminder's scheduled notification. Fire-and-forget safe. */
export async function cancelReminderNotification(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(NOTIF_PREFIX + id).catch(() => undefined);
}

/**
 * Asks for `POST_NOTIFICATIONS`, creates the `roto-reminders` channel and (re)arms one OS alarm per
 * due reminder. The SQLite rows stay the source of truth; this only surfaces them, and every step
 * is wrapped so a denied permission or a host without notifications leaves the in-app list working.
 *
 * Safe to call as often as you like: it cancels and re-creates the same identifiers, sweeps alarms
 * whose reminder was deleted or marked done, and remembers which "already due" nudges it has shown
 * (keyed by the due date/km, so moving a due date re-arms the nudge).
 */
export async function scheduleReminderNotifications(opts?: {
  lang?: Lang;
  currentKm?: number;
}): Promise<ScheduleResult> {
  const lang = await readReminderLang(opts?.lang);
  const m = NATIVE_MORE[lang];
  const now = Date.now();
  try {
    // Re-created on every call: Android only lets a channel's name and description change after
    // creation, and this is what keeps the label in the rider's language.
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: m.remChannel,
      description: m.remindersTitle,
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: SIGNAL_YELLOW,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    // Android grants POST_NOTIFICATIONS at install on API < 33 and, on 33+, never re-prompts after a
    // refusal — so only ask when the system says we still can.
    const perm = await Notifications.getPermissionsAsync();
    const granted = perm.granted || (perm.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!granted) {
      await persistDueList();
      return { scheduled: false, reason: m.notifFallback };
    }

    const rows = await listReminders();
    // `currentOdometerKm()` costs a `rides.mine` round trip, so only pay for it when a km-based
    // reminder actually needs judging.
    const needsKm = rows.some((r) => !r.done && r.dueKm != null);
    const currentKm = opts?.currentKm ?? (needsKm ? await currentOdometerKm() : 0);
    const notified = await loadNotified();
    const keep = new Set<string>();

    for (const r of rows) {
      if (r.done) continue;
      const plan = planReminder(m, lang, r, currentKm, now);
      if (!plan) continue;
      const identifier = NOTIF_PREFIX + r.id;
      if (plan.at == null && notified[r.id] === plan.stamp) continue;
      await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: plan.title,
          body: plan.body,
          color: SIGNAL_YELLOW,
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
          data: { kind: r.kind, reminderId: r.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: plan.at ?? now + DUE_SOON_MS,
          channelId: CHANNEL_ID,
        },
      });
      if (plan.at == null) notified[r.id] = plan.stamp;
      keep.add(identifier);
    }

    // Anything left over belongs to a reminder that was deleted, completed or re-dated.
    const pending = await Notifications.getAllScheduledNotificationsAsync().catch(() => [] as { identifier: string }[]);
    for (const p of pending) {
      if (p.identifier.startsWith(NOTIF_PREFIX) && !keep.has(p.identifier)) {
        await Notifications.cancelScheduledNotificationAsync(p.identifier).catch(() => undefined);
      }
    }

    await kvSet(NOTIFIED_KEY, JSON.stringify(notified));
    await persistDueList(currentKm);
    return { scheduled: true, reason: null };
  } catch {
    await persistDueList().catch(() => undefined);
    return { scheduled: false, reason: m.notifFallback };
  }
}

/** Keeps the pre-notifications in-app fallback alive: the list of due ids, for any caller that
 *  wants to badge the garage screen without re-querying. `listDueReminders` is the same predicate
 *  `planReminder` uses, so the badge and the notification can never disagree about what is due. */
async function persistDueList(currentKm?: number): Promise<void> {
  const due = await listDueReminders(currentKm).catch(() => [] as Reminder[]);
  await SecureStore.setItemAsync(DUE_LIST_KEY, JSON.stringify(due.map((d) => d.id))).catch(() => undefined);
}

export async function readDueListFallback(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(DUE_LIST_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

// --- Server backup (parallel-built `garage.save/load`; guarded) ---

type GarageBackup = { bikes: Bike[]; reminders: Reminder[]; lang: Lang };

async function garageApi(): Promise<{
  save: (input: GarageBackup) => Promise<unknown>;
  load: () => Promise<GarageBackup | null>;
} | null> {
  try {
    const api = (trpc as unknown as { garage?: {
      save: (input: GarageBackup) => Promise<unknown>;
      load: () => Promise<GarageBackup | null>;
    } }).garage;
    return api ?? null;
  } catch {
    return null;
  }
}

/** Best-effort backup of garage + reminders when signed in; silent no-op otherwise. */
export async function backupToServer(): Promise<boolean> {
  try {
    const session = await authClient.getSession().catch(() => null);
    if (!session?.data?.user) return false;
    const api = await garageApi();
    if (!api) return false;
    const [bikes, reminderRows] = await Promise.all([listBikes(), listReminders()]);
    await api.save({ bikes, reminders: reminderRows, lang: "en" });
    return true;
  } catch {
    return false;
  }
}

/** Best-effort restore (server wins); returns false when offline, signed out, or unbuilt. */
export async function restoreFromServer(): Promise<boolean> {
  try {
    const session = await authClient.getSession().catch(() => null);
    if (!session?.data?.user) return false;
    const api = await garageApi();
    if (!api) return false;
    const backup = await api.load();
    if (!backup) return false;
    for (const b of backup.bikes ?? []) {
      await upsertBike({ id: b.id, brand: b.brand, model: b.model, year: b.year, regNo: b.regNo, odometerKm: b.odometerKm });
    }
    for (const r of backup.reminders ?? []) {
      await upsertReminder({ id: r.id, kind: r.kind, dueAt: r.dueAt, dueKm: r.dueKm, note: r.note });
    }
    return true;
  } catch {
    return false;
  }
}
