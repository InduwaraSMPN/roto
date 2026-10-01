# roto-safety

Local Expo module (Android only — see D15 in `context/feature-parity-plan.md` §10)
for background crash detection and a full-screen SOS alert. Covers §1.3
("Crash watch with screen off", "Full-screen SOS over lock screen") and §4.12.

On iOS, Expo Go, or any environment where the native module isn't compiled in,
every export in `index.ts` still exists and resolves �?" `isAvailable()` returns
`false` and every `Promise` resolves to a safe no-op, so importing this module
never crashes an app that hasn't prebuilt it.

## Changelog

- **2026-09-28** No code change in this module. `expo-notifications` is now
  actually installed, so the sibling `lib/garage.ts` reminder work creates its
  own `roto-reminders` channel (`AndroidImportance.DEFAULT`, signal-yellow dot)
  instead of the old in-app-only fallback. That channel is completely separate
  from the `sos` channel this module's `setupSosNotifications` configures
  (`AndroidImportance.MAX`, vibration pattern, `I'm OK` / `Send now`
  categories), and `lib/garage.ts` never calls
  `setNotificationHandler`, so SOS presentation and crash watch are unchanged
  and still ungated by permission, battery saver or login. See
  `modules/roto-car/README.md` for the same day's Android Auto map-surface
  work.

## What's here

```
modules/roto-safety/
  index.ts                  typed JS API (see below)
  package.json               name: "roto-safety" — no npm install needed, see Autolinking
  expo-module.config.json    android-only, registers lk.roto.safety.RotoSafetyModule
  app.plugin.js               entry Expo looks for when the plugin is referenced
  plugin/with-roto-safety.js  config plugin: manifest permissions + service/activity
  android/
    build.gradle
    src/main/java/lk/roto/safety/
      RotoSafetyModule.kt      Expo module: JS-facing functions + events
      RotoSafetyBridge.kt      lets the Service/Activity (no Expo context) emit JS events
      CrashDetectorService.kt  foreground service (type "location"): sensors + algorithm
      CrashAlertPresenter.kt   builds the roto-sos notification + full-screen intent
      CrashAlertActivity.kt    full-screen lock-screen countdown UI
      records/RotoSafetyRecords.kt  StartOptions / CrashAlertOptions (Record classes)
```

## Autolinking (no `npm install`, no `package.json` edit needed)

Expo Autolinking scans `<app>/modules` by default (`expo.autolinking.nativeModulesDir`,
defaults to `./modules`). Because this folder already has a valid
`expo-module.config.json` + `package.json`, it is discovered automatically the
next time `npx expo prebuild` (or a dev-client build) runs — nothing needs to be
added to `apps/native/package.json`.

## Integration steps (for the native-app agent)

1. **Register the config plugin** in `apps/native/app.json`:
   ```json
   { "expo": { "plugins": ["./modules/roto-safety"] } }
   ```
   This adds, on the next prebuild: `FOREGROUND_SERVICE`,
   `FOREGROUND_SERVICE_LOCATION`, `USE_FULL_SCREEN_INTENT`, `POST_NOTIFICATIONS`,
   `WAKE_LOCK`, `HIGH_SAMPLING_RATE_SENSORS` permissions, plus the
   `CrashDetectorService` and `CrashAlertActivity` manifest declarations.
   `expo-location`'s own plugin already adds `ACCESS_FINE_LOCATION` /
   `ACCESS_BACKGROUND_LOCATION` / `FOREGROUND_SERVICE*` — no double-declaration
   issue, the manifest merger just unions them.

2. **Permission prompt order** (Android 13+ needs `POST_NOTIFICATIONS` granted or
   the crash-alert notification silently never shows, even though the service
   still runs and still detects). Recommended order, once, on first ride setup:
   1. `expo-location` foreground location permission (already wired).
   2. `expo-location` background location permission (needed for `ACCESS_BACKGROUND_LOCATION`
      so the service can request fixes with the screen off).
   3. `expo-notifications` `requestPermissionsAsync()` for `POST_NOTIFICATIONS`.
   4. Optionally check `RotoSafety.canUseFullScreenIntent()`; if `false` on
      Android 14+, show a one-time explainer ("so a suspected crash can wake your
      screen") before calling `RotoSafety.requestFullScreenIntent()`, which opens
      the system settings screen — the user has to flip the toggle there
      themselves, Android doesn't allow granting this at all programmatically.

3. **Wire into `lib/safety.ts`** (replacing `startCrashWatch`/`sosAlert`):
   ```ts
   import * as RotoSafety from "../modules/roto-safety";

   // Start alongside recording/navigation — never behind a login or battery-saver
   // gate (PRODUCT.md invariant, and plan §4.12 "never gated").
   await RotoSafety.start({ thresholdG: 4, minSpeedKmh: 15 });

   const sub = RotoSafety.addCrashSuspectedListener(({ g, speedBeforeKmh, at }) => {
     // Optional: log/telemetry. The native side has already raised the
     // full-screen alert itself by this point — JS does not need to call
     // showCrashAlert() again for a real detection.
   });

   const okSub = RotoSafety.addAlertOkListener(() => {
     // Rider is fine — cancel any pending sosFlow()/timers on the JS side.
   });

   const sendSub = RotoSafety.addAlertSendListener(({ lat, lon }) => {
     // Countdown elapsed or "Send now" tapped — call trpc.safety.trigger(...)
     // (online) or fall back to the SMS composer + tel:119/1990 (offline),
     // per plan §4.12. `lat`/`lon` come from the phone's last known fix taken
     // at alert time; still run them through core/privacy.trimEnds-style
     // checks if the rider is inside a privacy zone before sending anywhere.
   });

   // On every location fix from the app's own location stream (ride-recorder /
   // navigation), feed it in as a fallback for the native side's own
   // FusedLocationProviderClient read:
   RotoSafety.updateSpeed(speedKmh);

   // Battery saver toggles (never fully off):
   RotoSafety.setLowRate(isBatterySaverOn);

   // Manual SOS button (always visible, works logged out):
   await RotoSafety.showCrashAlert({ countdownS: 30 });

   // Stop only when the ride truly ends:
   await RotoSafety.stop();
   ```
   Remove `sub`/`okSub`/`sendSub` (`.remove()`) on unmount; the service and its
   sensors keep running independently of the JS lifecycle.

4. **Do not** call `stop()` when the app backgrounds or the screen locks — the
   whole point of the foreground service is to keep running then. Only call it
   when the rider ends the ride/navigation.

## Typed JS API (`index.ts`)

```ts
isAvailable(): boolean
start(options?: { thresholdG?: number; minSpeedKmh?: number; lowRate?: boolean }): Promise<void>
stop(): Promise<void>
updateSpeed(kmh: number): void
setLowRate(enabled: boolean): void
canUseFullScreenIntent(): Promise<boolean>
requestFullScreenIntent(): Promise<void>
showCrashAlert(options?: { countdownS?: number; title?: string; body?: string; okLabel?: string; sendLabel?: string }): Promise<void>
dismissCrashAlert(): Promise<void>
debugSimulate(): Promise<void>   // no-ops outside __DEV__
addCrashSuspectedListener(fn: (e: { g: number; speedBeforeKmh: number; at: number }) => void): EventSubscription
addAlertOkListener(fn: () => void): EventSubscription
addAlertSendListener(fn: (e: { lat: number | null; lon: number | null }) => void): EventSubscription
```

## Algorithm constants (`CrashDetectorService.kt`)

| Constant | Value | Meaning |
|---|---|---|
| `DEFAULT_THRESHOLD_G` | 4.0 | resultant accelerometer reading (true g, gravity already divided out) that counts as an impact; overridable via `start({ thresholdG })`, sane range 3–6 per plan §4.12 |
| `DEFAULT_MIN_SPEED_KMH` | 15.0 | the rider must have been going at least this fast at some point in the last 10s for an impact to matter |
| `SPEED_WINDOW_MS` | 10 000 | rolling window of recent speed samples (FusedLocation or `updateSpeed()`) used for the check above |
| `STILLNESS_WINDOW_MS` | 10 000 | after impact, watch this long before deciding still vs. still-riding |
| `STILLNESS_MAX_SPEED_KMH` | 3.0 | average speed during the stillness window must stay under this |
| `STILLNESS_MAX_ACCEL_VARIANCE` | 0.35 (g²) | accelerometer variance during the stillness window must stay under this (empirical — a mounted phone at rest reads ~1g with noise well under this; tune on-device) |
| `EVENT_COOLDOWN_MS` | 5×60×1000 | one `crashSuspected` event per 5 minutes, per plan §4.12 |

The pre-existing bug this module fixes: `apps/native/lib/safety.ts`
(`startCrashWatch`) compared the *raw* accelerometer magnitude (units m/s²,
~9.8 at rest) directly against a threshold of 4, so it would immediately fire
at rest (plan bug B4, "Crash fires on every sample over 4 g"). This module
divides by `SensorManager.GRAVITY_EARTH` first, so `thresholdG` is genuinely in
g-force units and a stationary phone reads ~1.0, not ~9.8.

## Testing

```powershell
adb logcat -s RotoSafety
```

All native logs use tag `RotoSafety` (service start/stop, impact detection,
stillness confirm/reject, alert presented).

- **Simulate a crash without dropping the phone**: call `RotoSafety.debugSimulate()`
  from a dev-build-only button (it already no-ops outside `__DEV__`). This
  raises the exact same notification + full-screen-intent + countdown flow a
  real detection would, with synthetic `g=6.0`, `speedBeforeKmh=42.0`. It does
  **not** require `start()` to have been called first.
- **Simulate with the real pipeline**: call `start({ thresholdG: 1.1 })` (a
  threshold barely above resting 1g) and give the phone a light shake — watch
  logcat for "impact detected" then either "stillness confirmed" (if you set
  the phone down) or "rider kept moving" (if you keep moving it) 10s later.
- **Full-screen-intent permission (Android 14+)**: `RotoSafety.canUseFullScreenIntent()`
  starts `false` on most OEMs until the user flips it on manually; verify the
  heads-up-notification-with-actions fallback path (it always posts regardless
  of that permission — the OS decides whether to also launch the full-screen
  activity).
- **Lock-screen behavior**: lock the phone, trigger `debugSimulate()`, confirm
  the countdown screen draws over the lock screen and both buttons resolve
  (`adb logcat` should show no crash/ANR).
- **Lifecycle**: force-stop and relaunch the app while the service is running;
  `START_STICKY` means the OS may restart the bare service process — this is
  expected, JS should call `start()` again on next launch if a ride/nav session
  is still active (persist that intent in local `kv`/ride state, not in this
  module).

## Known risks / follow-ups

- **No iOS implementation** (D15, intentional). `apps/native/lib/safety.ts`
  should keep a JS-only foreground fallback (the existing `Accelerometer`
  listener, fixed to divide by gravity) for iOS and any Android dev client that
  hasn't prebuilt this module yet — `isAvailable()` tells the caller which path
  it's on.
- **Notification action buttons briefly start `CrashAlertActivity`** to resolve
  "I'm OK"/"Send now" from the notification shade (it self-finishes in
  `onCreate`/`onNewIntent` before drawing anything). This was a deliberate
  scope call to avoid adding a `BroadcastReceiver` + extra manifest entry beyond
  the service/activity this task was scoped to; if the brief activity flash is
  visible/annoying on-device, promote those two actions to a small
  `BroadcastReceiver` instead (needs one more `<receiver>` entry in
  `plugin/with-roto-safety.js`).
- **Speed source**: the service tries its own `FusedLocationProviderClient`
  request; if `ACCESS_FINE_LOCATION`/`ACCESS_BACKGROUND_LOCATION` haven't been
  granted yet when it starts, that silently no-ops (logged, not thrown) and the
  algorithm relies entirely on `updateSpeed()` from JS until permission is
  granted and the service is restarted (call `stop()`+`start()` again after the
  permission prompt resolves).
- **Foreground service notification icon** uses the app's launcher icon
  (`applicationInfo.icon`), which Android renders as a solid block on some OEM
  skins since status-bar/small icons should be monochrome. Same limitation
  `expo-location`'s own foreground notification has out of the box; low
  priority, cosmetic only.
- **Gyroscope is registered but unused** by the algorithm today (reserved per
  plan §4.12 "+ gyroscope optional"); wire it into `handleAccelerometer`'s
  impact/stillness logic later if false positives/negatives need sharpening
  (e.g. distinguishing a highside from hitting a pothole).
- **`STILLNESS_MAX_ACCEL_VARIANCE` is an untested guess.** It needs real
  on-device tuning during the Phase 1 device-test pass (plan §8, §9) — mounted
  vs. pocketed phone, engine idling vs. off, will all read differently.
- Kotlin was hand-reviewed against the installed `expo-modules-core@57.0.18`
  DSL sources (`node_modules/expo-modules-core/android/.../modules/ModuleDefinitionBuilder.kt`,
  `objects/ObjectDefinitionBuilder.kt`) and `expo-location@57.0.17` as the
  closest real example of a foreground-service + FusedLocationProviderClient
  Expo module, but could not be compiled here (no `android/` folder exists
  until `expo prebuild` runs). Build it as the first check after wiring the
  plugin into `app.json`.
