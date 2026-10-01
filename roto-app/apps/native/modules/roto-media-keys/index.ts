import { Platform } from 'react-native';
import {
  requireOptionalNativeModule,
  type EventSubscription,
} from 'expo-modules-core';

/** A handlebar remote or headset button, normalized across brands and Android versions. */
export type MediaKey = 'play_pause' | 'next' | 'previous' | 'volume_up' | 'volume_down';

export interface MediaKeyEvent {
  key: MediaKey;
  /**
   * True once the key has been held down for >= 800ms (fires once, from a
   * timer). A short press fires with `longPress: false` on key-up instead.
   * Only meaningful for remotes/ROMs that deliver separate down and up
   * events -- see README.md "Limitations".
   */
  longPress: boolean;
}

type RotoMediaKeysEvents = {
  onKey(event: MediaKeyEvent): void;
};

// ponytail: expo-modules-core's exported `NativeModule<Events>` type alias resolves to
// `typeof ExpoGlobal.NativeModule<EventsMap>` (its own base `EventsMap`, not the `TEventsMap`
// generic it declares) — see node_modules/expo-modules-core/build/NativeModule.d.ts. That drops
// `addListener` from the intersection, which is the type error this file used to hit at line 102.
// roto-safety/index.ts works around the same bug by declaring the native interface by hand
// instead of intersecting with `NativeModule<...>`; mirrored here.
interface RotoMediaKeysNativeModule {
  isAvailable(): boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener<EventName extends keyof RotoMediaKeysEvents>(
    eventName: EventName,
    listener: RotoMediaKeysEvents[EventName],
  ): EventSubscription;
}

function loadNativeModule(): RotoMediaKeysNativeModule | null {
  // D15: Android only. On iOS/web there is no native module to load, and the
  // app should fall back to its existing JS-only behavior without this file
  // ever throwing.
  if (Platform.OS !== 'android') return null;
  try {
    return requireOptionalNativeModule<RotoMediaKeysNativeModule>('RotoMediaKeys');
  } catch (err) {
    // Expo Go (can't load third-party native modules) or a dev client built
    // before this module was linked. Never let a missing native module crash
    // the ride screen.
    console.warn('[RotoMediaKeys] native module not available; falling back to a no-op', err);
    return null;
  }
}

const native = loadNativeModule();

/**
 * Whether handlebar/headset media-key handling is actually available in this
 * running app. False on iOS, web, Expo Go, and a dev client built before
 * this module existed (a `prebuild` + native rebuild is required after it's
 * wired into the app -- see README.md "Integration steps"). Check this
 * before showing any "remote connected" UI; never assume it's true.
 */
export function isAvailable(): boolean {
  try {
    return native?.isAvailable() ?? false;
  } catch (err) {
    console.warn('[RotoMediaKeys] isAvailable() threw', err);
    return false;
  }
}

/**
 * Starts an Android MediaSession for the duration of a ride/navigation
 * session so hardware media buttons route to Roto instead of whatever else
 * currently holds a session. Safe to call repeatedly (native side is a
 * no-op if already started) and safe to call when unavailable. Always pair
 * with `stop()` when navigation ends -- the session (and its silent
 * keep-alive audio focus, see README.md) should not outlive a ride.
 */
export async function start(): Promise<void> {
  if (!native) return;
  try {
    await native.start();
  } catch (err) {
    console.warn('[RotoMediaKeys] start() failed', err);
  }
}

/** Stops the session and releases the silent keep-alive audio focus. */
export async function stop(): Promise<void> {
  if (!native) return;
  try {
    await native.stop();
  } catch (err) {
    console.warn('[RotoMediaKeys] stop() failed', err);
  }
}

/**
 * Subscribes to key events. Always returns a `Subscription` with `.remove()`
 * -- including when the native module is unavailable -- so callers never
 * need an `isAvailable()` branch just to clean up a listener in a `useEffect`.
 */
export function addKeyListener(listener: (event: MediaKeyEvent) => void): EventSubscription {
  if (!native) {
    return { remove() {} } as EventSubscription;
  }
  return native.addListener('onKey', listener);
}

const RotoMediaKeys = { isAvailable, start, stop, addKeyListener };
export default RotoMediaKeys;
