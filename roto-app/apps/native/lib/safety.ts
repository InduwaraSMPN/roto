// Crash watch + SOS dispatch (plan §4.12).
//
// Two crash-watch paths: the roto-safety native module when compiled in (background
// foreground-service detection with impact + stillness logic), else a JS accelerometer fallback
// for Expo Go / iOS / stale dev clients. SOS dispatch prefers `trpc.safety.trigger` (server
// push + email, returns per-contact SMS texts for the composer fallback), else the on-device
// SMS composer + `tel:119`/`tel:1990` using the local contacts mirror — so SOS works logged
// out and offline.
//
// PRODUCT.md invariant: crash watch and SOS are NEVER gated behind battery saver, login or
// any other mode. Callers pass saver/login state only to tune rates, never to skip this file.
declare const require: any;

import { Accelerometer } from "expo-sensors";
import * as SMS from "expo-sms";
import { Linking } from "react-native";

import * as RotoSafety from "@/modules/roto-safety";

import { listLocalContacts } from "./sos-contacts";

export const EMERGENCY = { police: "119", ambulance: "1990" } as const;

/** Countdown length before alerts go out (plan §4.12: 30 s, slide-to-cancel). */
export const SOS_COUNTDOWN_S = 30;

/** SecureStore key for the crash-sensitivity slider (3–6 g). */
export const CRASH_G_KEY = "roto-crash-g";

export type SosReason = "crash" | "manual" | "checkin";

// --- countdown store --------------------------------------------------------
// The overlay (components/safety/sos-countdown.tsx) renders from this singleton via
// useSyncExternalStore, so any screen can trigger `sosFlow()` and the countdown appears
// wherever the overlay is mounted. One countdown at a time: a new request preempts a stale one.

export type SosCountdownMode = "live" | "preview";

export type SosCountdownState = {
  reason: SosReason;
  endsAt: number;
  mode: SosCountdownMode;
  seq: number;
} | null;

let countdown: SosCountdownState = null;
let seq = 0;
const countdownListeners = new Set<() => void>();

export function getSosCountdown(): SosCountdownState {
  return countdown;
}

export function subscribeSosCountdown(fn: () => void): () => void {
  countdownListeners.add(fn);
  return () => {
    countdownListeners.delete(fn);
  };
}

type CountdownOutcome = "cancelled" | "send";

let pendingResolve: ((outcome: CountdownOutcome) => void) | null = null;

function setCountdown(next: SosCountdownState): void {
  countdown = next;
  for (const fn of countdownListeners) {
    try {
      fn();
    } catch {
      // A dead listener must never freeze the countdown.
    }
  }
}

export function requestSosCountdown(reason: SosReason, mode: SosCountdownMode = "live"): Promise<CountdownOutcome> {
  pendingResolve?.("cancelled");
  pendingResolve = null;
  seq += 1;
  setCountdown({ reason, endsAt: Date.now() + SOS_COUNTDOWN_S * 1000, mode, seq });
  return new Promise<CountdownOutcome>((resolve) => {
    pendingResolve = resolve;
  });
}

/** Resolve the active countdown. Called by the overlay timer/buttons and the native listeners. */
export function finishSosCountdown(outcome: CountdownOutcome): void {
  setCountdown(null);
  const resolve = pendingResolve;
  pendingResolve = null;
  resolve?.(outcome);
}

export function cancelSosCountdown(): void {
  finishSosCountdown("cancelled");
}

export function confirmSosCountdown(): void {
  finishSosCountdown("send");
}

// --- crash watch ------------------------------------------------------------

const FALLBACK_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Starts crash detection. Returns a stop function — call it only when the ride truly ends,
 * never on background/lock (the native service is built to survive those).
 */
export function startCrashWatch(onCrash: () => void, thresholdG = 4): () => void {
  if (RotoSafety.isAvailable()) {
    void RotoSafety.start({ thresholdG }).catch(() => undefined);
    const suspected = RotoSafety.addCrashSuspectedListener(() => onCrash());
    const ok = RotoSafety.addAlertOkListener(() => cancelSosCountdown());
    const send = RotoSafety.addAlertSendListener(() => confirmSosCountdown());
    return () => {
      try {
        suspected.remove();
        ok.remove();
        send.remove();
      } catch {
        // Listeners are best-effort; the service stop below is what matters.
      }
      void RotoSafety.stop().catch(() => undefined);
    };
  }
  // ponytail: foreground-only JS fallback (Expo Go / iOS / dev client without a rebuild).
  // Fixed to true g (m/s² divided by gravity) with a 5-minute cooldown; the impact + stillness
  // state machine lives in the native module — upgrade by installing the module, not here.
  Accelerometer.setUpdateInterval(100);
  let lastFire = 0;
  const sub = Accelerometer.addListener(({ x, y, z }) => {
    const g = Math.sqrt(x * x + y * y + z * z) / 9.80665;
    if (g >= thresholdG && Date.now() - lastFire > FALLBACK_COOLDOWN_MS) {
      lastFire = Date.now();
      onCrash();
    }
  });
  return () => sub.remove();
}

/** Feeds live speed into the native crash algorithm's "was the rider moving" check. No-op without the module. */
export function updateCrashSpeed(kmh: number): void {
  try {
    RotoSafety.updateSpeed(kmh);
  } catch {
    // Never let telemetry break recording.
  }
}

/** Battery-saver sampling for the native module. Detection stays on — this only lowers the rate. */
export function setCrashLowRate(enabled: boolean): void {
  try {
    RotoSafety.setLowRate(enabled);
  } catch {
    // Best-effort, like everything telemetry-shaped.
  }
}

// --- SOS notifications (optional) -------------------------------------------

function loadNotifications(): any | null {
  try {
    return require("expo-notifications");
  } catch {
    return null;
  }
}

// ponytail: expo-notifications is not installed yet, so this is a guarded require + in-app-only
// fallback (the overlay stays the countdown UI). Install `expo-notifications` + its config
// plugin to get the lock-screen `sos` category (I'm OK / Send now) and MAX channel.
export async function setupSosNotifications(): Promise<boolean> {
  const N = loadNotifications();
  if (!N) return false;
  try {
    if (N.setNotificationChannelAsync) {
      await N.setNotificationChannelAsync("sos", {
        name: "SOS",
        importance: N.AndroidImportance?.MAX ?? 4,
        vibrationPattern: [0, 500, 200, 500],
        lockscreenVisibility: N.AndroidNotificationVisibility?.PUBLIC,
      });
    }
    if (N.setNotificationCategoryAsync) {
      await N.setNotificationCategoryAsync("sos", [
        { identifier: "ok", buttonTitle: "I'm OK", options: { opensAppToForeground: true } },
        { identifier: "send-now", buttonTitle: "Send now", options: { opensAppToForeground: true } },
      ]);
    }
    return true;
  } catch {
    return false;
  }
}

/** Posts a heads-up SOS notification alongside the overlay. Silent no-op without the package. */
export async function notifySosCountdown(title: string, body: string): Promise<void> {
  const N = loadNotifications();
  if (!N?.scheduleNotificationAsync) return;
  try {
    await N.scheduleNotificationAsync({
      content: { title, body, categoryIdentifier: "sos", priority: N.AndroidNotificationPriority?.MAX },
      trigger: null,
    });
  } catch {
    // The overlay is the countdown UI; the notification is a bonus.
  }
}

// --- SOS dispatch -------------------------------------------------------------

export type ServerTriggerResult = {
  eventId: string;
  liveUrl: string | null;
  smsTexts: { phone: string; text: string }[];
};

export type SosSendResult =
  | { status: "sent-server"; eventId: string; liveUrl: string | null }
  | { status: "sent-local" }
  | { status: "no-contacts" };

export type SosFlowResult = SosSendResult | { status: "cancelled" };

export type SosSendArgs = {
  reason: SosReason;
  lat: number;
  lon: number;
  tripToken?: string;
};

async function sendComposerTexts(texts: { phone: string; text: string }[]): Promise<void> {
  // Group by identical text so one composer covers every same-language contact instead of
  // popping a composer per person.
  const byText = new Map<string, string[]>();
  for (const t of texts) {
    const list = byText.get(t.text) ?? [];
    list.push(t.phone);
    byText.set(t.text, list);
  }
  if (!(await SMS.isAvailableAsync().catch(() => false))) {
    await Linking.openURL(`tel:${EMERGENCY.police}`);
    return;
  }
  for (const [text, phones] of byText) {
    await SMS.sendSMSAsync(phones, text).catch(() => undefined);
  }
}

/**
 * Sends the SOS once the countdown elapses (or Send now). Online + signed in: server trigger
 * first (push + email go out server-side), then the composer fallback for `smsTexts`.
 * Offline / logged out: composer with the caller-built `fallbackText` straight to the local
 * contacts mirror.
 */
export async function dispatchSos(opts: {
  reason: SosReason;
  lat: number;
  lon: number;
  tripToken?: string | null;
  fallbackText: string;
  sendViaServer?: (args: SosSendArgs) => Promise<ServerTriggerResult>;
}): Promise<SosSendResult> {
  if (opts.sendViaServer) {
    try {
      const res = await opts.sendViaServer({
        reason: opts.reason,
        lat: opts.lat,
        lon: opts.lon,
        ...(opts.tripToken ? { tripToken: opts.tripToken } : {}),
      });
      await sendComposerTexts(res.smsTexts);
      return { status: "sent-server", eventId: res.eventId, liveUrl: res.liveUrl };
    } catch {
      // Server unreachable or logged out mid-ride — fall through to the local path.
    }
  }
  const contacts = await listLocalContacts().catch(() => []);
  if (!contacts.length) return { status: "no-contacts" };
  await sendComposerTexts(contacts.map((c) => ({ phone: c.phone, text: opts.fallbackText })));
  return { status: "sent-local" };
}

/**
 * Full SOS user flow: 30 s cancellable countdown, then dispatch. Shows the JS overlay as the
 * single countdown UI (any self-presented native alert is dismissed first so the rider never
 * sees two timers); the native module's ok/send events still resolve it.
 */
export async function sosFlow(opts: {
  reason: SosReason;
  lat: number;
  lon: number;
  tripToken?: string | null;
  fallbackText: string;
  sendViaServer?: (args: SosSendArgs) => Promise<ServerTriggerResult>;
}): Promise<SosFlowResult> {
  try {
    await RotoSafety.dismissCrashAlert();
  } catch {
    // No native alert showing (or no module) — the overlay below is the countdown.
  }
  const cleanups: { remove(): void }[] = [];
  if (RotoSafety.isAvailable()) {
    try {
      cleanups.push(RotoSafety.addAlertOkListener(() => cancelSosCountdown()));
      cleanups.push(RotoSafety.addAlertSendListener(() => confirmSosCountdown()));
    } catch {
      // Listener wiring is best-effort; the overlay buttons still resolve the flow.
    }
  }
  try {
    const outcome = await requestSosCountdown(opts.reason, "live");
    if (outcome === "cancelled") return { status: "cancelled" };
    return await dispatchSos(opts);
  } finally {
    for (const c of cleanups) {
      try {
        c.remove();
      } catch {
        // Ignore — the flow already resolved.
      }
    }
  }
}

/** Shows the 30 s countdown UI without sending anything (safety screen "test" button). */
export async function previewSosCountdown(): Promise<void> {
  await requestSosCountdown("manual", "preview").catch(() => "cancelled" as CountdownOutcome);
}

// --- legacy -------------------------------------------------------------------

export async function sosAlert(phones: string[], text: string) {
  if (await SMS.isAvailableAsync().catch(() => false)) {
    await SMS.sendSMSAsync(phones, text).catch(() => Linking.openURL(`tel:${EMERGENCY.police}`));
  } else {
    await Linking.openURL(`tel:${EMERGENCY.police}`);
  }
}

export const callAmbulance = () => Linking.openURL(`tel:${EMERGENCY.ambulance}`);
export const callPolice = () => Linking.openURL(`tel:${EMERGENCY.police}`);
