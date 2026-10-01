// roto-car: local Expo module exposing Android Auto (androidx.car.app) to JS.
//
// Android only (plan decision D15). On iOS, web, Expo Go, or a dev client built before this
// module existed, `requireNativeModule` throws — every export below falls back to a safe no-op
// so callers (e.g. the future `apps/native/lib/use-navigation.ts`) never need to branch on
// platform or on whether the native code has actually been rebuilt yet. Always check
// `isAvailable()` before relying on `isConnected()` to mean anything.
import { Platform } from 'react-native';
import { EventSubscription } from 'expo-modules-core';
import { NativeModule, requireNativeModule } from 'expo';

/**
 * Valhalla `DirectionsLeg.Maneuver.Type` (see `valhalla/proto/directions.proto`), 0-43.
 * The native module maps this to an androidx.car.app `Maneuver.TYPE_*` constant - see
 * `android/.../ManeuverMapping.kt` for the full table and the reasoning behind each choice.
 */
export type ManeuverType = number;

export type StartNavigationOptions = {
  /** Shown on the "Open Roto on your phone" screen replacement and used for the Trip destination. */
  destinationName: string;
  /** Destination coordinates, so the map surface can draw the destination marker before the first
   *  `updateTrip`. GeoJSON order is `{lat, lon}` here (the JS API takes objects, not arrays). */
  destLat?: number;
  destLon?: number;
};

export type TripUpdate = {
  maneuverType: ManeuverType;
  /** Spoken/printed instruction text, already localized (en/si/ta) by the caller. */
  instruction: string;
  /** Distance to the maneuver, in meters. */
  distanceM: number;
  street?: string;
  /** Remaining distance to the destination, in kilometers. */
  remainingKm: number;
  /** Remaining time to the destination, in minutes. */
  etaMin: number;
  speedLimitKmh?: number;
  // --- Map geometry (optional). Omit all of it and the head unit falls back to the text-only
  // --- NavigationTemplate, exactly as before the map surface existed. ---

  /** Rider's current position. */
  lat?: number;
  lon?: number;
  /**
   * Remaining route as a flat GeoJSON-order polyline, `[lon, lat, lon, lat, …]`. Decimate it — a
   * Valhalla route can be a few thousand points and this crosses the JS/native bridge on every
   * navigator tick. A few hundred points is plenty for a schematic line.
   */
  path?: number[];
  /** Where the current maneuver happens, i.e. `route.coords[maneuver.beginIdx]`. */
  mnvLat?: number;
  mnvLon?: number;
};

export type RotoCarActionId = 'stop' | 'repeat' | 'sos';

export type RotoCarAction = {
  id: RotoCarActionId;
};

export type RotoCarModuleEvents = {
  /** A car head unit (real or the Desktop Head Unit) attached and created a session. */
  connected: () => void;
  /** The car session was destroyed (unplugged, host app closed, Bluetooth dropped). */
  disconnected: () => void;
  /** The rider tapped Stop, Repeat or SOS in the car's ActionStrip. */
  action: (event: RotoCarAction) => void;
};

declare class RotoCarNativeModule extends NativeModule<RotoCarModuleEvents> {
  isConnected(): boolean;
  startNavigation(options: StartNavigationOptions): void;
  updateTrip(update: TripUpdate): void;
  stopNavigation(): void;
}

let native: RotoCarNativeModule | null = null;

if (Platform.OS === 'android') {
  try {
    native = requireNativeModule<RotoCarNativeModule>('RotoCar');
  } catch {
    // ponytail: dev client hasn't been rebuilt with this module yet (`expo run:android` was not
    // re-run after this module was added), or we're running under Expo Go, which cannot load
    // custom native modules at all. Either way, degrade to the no-op API below instead of
    // crashing the whole app - Android Auto is a nice-to-have, not a hard dependency.
    native = null;
  }
}

/** True when the native module is compiled in. False on iOS/web and on a stale dev client. */
export function isAvailable(): boolean {
  return native !== null;
}

/** True when a car head unit is currently connected (a `RotoCarSession` exists). */
export function isConnected(): boolean {
  return native?.isConnected() ?? false;
}

/**
 * Tell the car a trip has started. Shows the map-plus-content surface (or the `NavigationTemplate`
 * when the host gave us no surface) instead of the "Open Roto on your phone to start" message, and
 * calls `NavigationManager.navigationStarted()`. Call `updateTrip` immediately after with the first
 * maneuver.
 */
export function startNavigation(options: StartNavigationOptions): void {
  native?.startNavigation(options);
}

/** Push the current maneuver/ETA to the car. Call this on every navigator tick while driving. */
export function updateTrip(update: TripUpdate): void {
  native?.updateTrip(update);
}

/**
 * Tell the car navigation has ended (arrival or user cancel). Reverts to the
 * "Open Roto on your phone to start" message and calls `NavigationManager.navigationEnded()`.
 */
export function stopNavigation(): void {
  native?.stopNavigation();
}

/**
 * Subscribe to a RotoCar event. Returns a no-op subscription when the module is unavailable, so
 * callers can `addListener(...)` unconditionally and just `.remove()` it on cleanup.
 */
export function addListener<EventName extends keyof RotoCarModuleEvents>(
  eventName: EventName,
  listener: RotoCarModuleEvents[EventName]
): EventSubscription {
  if (!native) {
    return { remove() {} };
  }
  // `as any`: TypeScript can't prove a generic `EventName` forwarded from this wrapper's own
  // type parameter matches `NativeModule#addListener`'s independently-introduced one, even
  // though both are constrained to `keyof RotoCarModuleEvents` - a known limitation with
  // generic mapped-type forwarding, not a real type mismatch.
  return native.addListener(eventName, listener as any);
}

const RotoCar = {
  isAvailable,
  isConnected,
  startNavigation,
  updateTrip,
  stopNavigation,
  addListener,
};

export default RotoCar;
