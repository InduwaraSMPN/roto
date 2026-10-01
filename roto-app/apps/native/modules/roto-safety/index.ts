import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";

/**
 * roto-safety: background crash detection + full-screen SOS alert.
 * Android-only local Expo module (context/feature-parity-plan.md D15, §4.12).
 * See README.md in this folder for integration steps.
 */

export type CrashSuspectedEvent = {
  /** Peak resultant acceleration at impact, in g (9.80665 m/s^2 = 1g). */
  g: number;
  /** Highest speed seen in the 10s window before impact, km/h. */
  speedBeforeKmh: number;
  /** Unix ms timestamp the crash was confirmed (after the stillness check). */
  at: number;
};

export type AlertSendEvent = {
  lat: number | null;
  lon: number | null;
};

export type StartOptions = {
  /** Resultant acceleration that counts as an impact, in g. Default 4, sane range 3-6. */
  thresholdG?: number;
  /** Minimum speed in the 10s before impact for it to count as a riding crash. Default 15. */
  minSpeedKmh?: number;
  /**
   * Battery-saver mode: samples less often. Detection is never fully disabled by
   * battery saver (PRODUCT.md invariant) — this only lowers the sensor/location rate.
   */
  lowRate?: boolean;
};

export type CrashAlertOptions = {
  /** Countdown length in seconds before "send now" fires automatically. Default 30. */
  countdownS?: number;
  title?: string;
  body?: string;
  okLabel?: string;
  sendLabel?: string;
};

type RotoSafetyEvents = {
  crashSuspected: (event: CrashSuspectedEvent) => void;
  alertOk: () => void;
  alertSend: (event: AlertSendEvent) => void;
};

interface RotoSafetyNativeModule {
  isAvailable(): boolean;
  start(options: StartOptions): Promise<void>;
  stop(): Promise<void>;
  updateSpeed(kmh: number): void;
  setLowRate(enabled: boolean): void;
  canUseFullScreenIntent(): Promise<boolean>;
  requestFullScreenIntent(): Promise<void>;
  showCrashAlert(options: CrashAlertOptions): Promise<void>;
  dismissCrashAlert(): Promise<void>;
  debugSimulate(): Promise<void>;
  addListener<EventName extends keyof RotoSafetyEvents>(
    eventName: EventName,
    listener: RotoSafetyEvents[EventName],
  ): EventSubscription;
  removeAllListeners(eventName: keyof RotoSafetyEvents): void;
}

const native = requireOptionalNativeModule<RotoSafetyNativeModule>("RotoSafety");

// ponytail: JS-only fallback so importing this module never crashes on iOS, web
// or an Expo Go / non-prebuilt dev client. Upgrade only if a caller needs the
// fallback to actually detect crashes (e.g. reviving the old accelerometer
// watch in apps/native/lib/safety.ts as a foreground-only backup).
const noopSubscription: EventSubscription = { remove() {} };

const fallback: RotoSafetyNativeModule = {
  isAvailable: () => false,
  start: async () => {},
  stop: async () => {},
  updateSpeed: () => {},
  setLowRate: () => {},
  canUseFullScreenIntent: async () => false,
  requestFullScreenIntent: async () => {},
  showCrashAlert: async () => {},
  dismissCrashAlert: async () => {},
  debugSimulate: async () => {},
  addListener: () => noopSubscription,
  removeAllListeners: () => {},
};

const RotoSafety: RotoSafetyNativeModule = native ?? fallback;

/** True when the native module is compiled in (always false on iOS/Expo Go/web). */
export function isAvailable(): boolean {
  return RotoSafety.isAvailable();
}

/** Starts the foreground crash-watch service. Safe to call again to change options. */
export function start(options?: StartOptions): Promise<void> {
  return RotoSafety.start(options ?? {});
}

/** Stops the foreground crash-watch service. Never call this to "save battery" for
 * an active rider — crash watch must stay on while recording or navigating
 * (PRODUCT.md invariant); only stop when the ride truly ends. */
export function stop(): Promise<void> {
  return RotoSafety.stop();
}

/**
 * Fallback speed feed for the crash algorithm's "was the rider actually moving"
 * check. Call this from the JS location stream (e.g. expo-location watch or the
 * navigation hook) whenever a fresh fix arrives; the native side also tries to
 * read speed itself via FusedLocationProviderClient, so this is a supplement,
 * not the only source.
 */
export function updateSpeed(kmh: number): void {
  RotoSafety.updateSpeed(kmh);
}

/** Toggle the low-rate (battery saver) sampling mode. Detection stays on either way. */
export function setLowRate(enabled: boolean): void {
  RotoSafety.setLowRate(enabled);
}

/** Android 14+: whether the system currently lets this app use full-screen intents. */
export function canUseFullScreenIntent(): Promise<boolean> {
  return RotoSafety.canUseFullScreenIntent();
}

/** Android 14+: opens the system settings screen to grant the full-screen-intent permission. */
export function requestFullScreenIntent(): Promise<void> {
  return RotoSafety.requestFullScreenIntent();
}

/** Manually raises the same countdown alert a detected crash would (e.g. the manual SOS button). */
export function showCrashAlert(options?: CrashAlertOptions): Promise<void> {
  return RotoSafety.showCrashAlert(options ?? {});
}

/** Dismisses any showing crash alert notification/activity without emitting ok or send. */
export function dismissCrashAlert(): Promise<void> {
  return RotoSafety.dismissCrashAlert();
}

/**
 * Dev-only: raises the full alert flow with synthetic impact/speed values so the
 * countdown, lock-screen behavior and event wiring can be tested without a real
 * crash. The native function always exists; this wrapper only calls it in dev
 * builds so a stray "simulate crash" control can never ship active in prod.
 */
export function debugSimulate(): Promise<void> {
  if (!__DEV__) {
    return Promise.resolve();
  }
  return RotoSafety.debugSimulate();
}

export function addCrashSuspectedListener(
  listener: (event: CrashSuspectedEvent) => void,
): EventSubscription {
  return RotoSafety.addListener("crashSuspected", listener);
}

export function addAlertOkListener(listener: () => void): EventSubscription {
  return RotoSafety.addListener("alertOk", listener);
}

export function addAlertSendListener(
  listener: (event: AlertSendEvent) => void,
): EventSubscription {
  return RotoSafety.addListener("alertSend", listener);
}
