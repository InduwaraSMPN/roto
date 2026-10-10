# Device test runbook — Samsung S24 Ultra (+ Android Auto DHU)

Written 2026-10-09. Supersedes the device section of `roto-app/DEVICE-TEST.md`, which is stale:
it still says server `:3000` and "10 POI dots" (the server is on **:3010** and the DB holds
**12,410** OSM POIs). Fix or delete that file when this runbook has been used once.

This exists because the release gate is open on things **no emulator can settle**:
crash thresholds against real motion, SOS delivery, background recording with the screen off,
Android Auto, media-key remotes, and ride capture on a phone.

---

## 0. What is already proven — do not redo it

| Gate | Result | How |
|---|---|---|
| `check-types` (all 9 packages) | **pass** | `npx tsc --noEmit` run directly per package |
| `test` | **pass, 92 tests** | core 57 (9 files), api 35 (7 files) |
| Migrations 0006–0019 applied | pass | local Docker Postgres, 44 tables |
| Real LK geodata loaded | pass | 12,410 POIs, 29,143 curvature ways |
| Release APK builds / boots / renders en·si·ta | pass | emulator-5554, Android 16 |

**Windows trap — turbo cannot spawn child processes on this machine.**
`npx turbo run check-types` fails with `All pipe instances are busy. (os error 231)` on
`@roto-app/core` and `@roto-app/ui` — packages that are untouched and clean. It is pipe/handle
exhaustion, not a type error. Verify with the direct command instead:

```bash
cd roto-app/apps/native && npx tsc --noEmit          # EXIT=0
cd ../../packages/core  && npx tsc --noEmit          # EXIT=0
```

`npx turbo run test` *does* work. Reboot or close stale node processes before blaming the code.

---

## 1. Prereqs

- S24 Ultra, USB cable, USB debugging on. `adb devices` must list it (not `emulator-5554`).
- Laptop with the Docker stack up (§2). Node 22.
- `adb` on PATH, or use `%ANDROID_HOME%\platform-tools\adb.exe` (on this machine `adb` is
  **not** on PATH — only the SDK copy works).

---

## 2. Laptop: start and verify the stack

```bash
cd roto-app
docker compose -f tiles/docker-compose.yml up -d          # postgres :54322, martin :3005, valhalla :8002
node tiles/serve-style.mjs                                # :3006 — MUST bind 0.0.0.0
cd apps/server && npx tsx src/index.ts                    # :3010
```

Verify each — a start command returning is **not** evidence the port is open:

```bash
curl -s localhost:3005/catalog | head -c 80                      # martin: sri-lanka source
curl -s localhost:3006/style.json | head -c 60                   # {"version":8...
curl -s -X POST localhost:8002/status -H 'Content-Type: application/json' \
     -d '{"verbose":true}' | head -c 200                         # has_admins/has_timezones true
curl -s localhost:3010/status | head -c 200                      # server's Valhalla proxy
netstat -ano | grep -E ":(3005|3006|3010|8002)\b"
```

Traps: Valhalla ignores `GET /status?verbose=true` — use **POST** with a JSON body.
`serve-style.mjs` silently dying is the usual cause of a blank map.

---

## 3. Phone prep

### 3a. Battery — do this first or nothing below is trustworthy
Settings → Apps → Roto → Battery → **Unrestricted**. One UI kills background foreground
services otherwise, and a killed service looks exactly like "background recording is broken".

### 3b. Reach the laptop from the phone
Two options. **Use adb reverse over USB** — it is the one that works with the cleartext
allowlist as shipped.

```bash
adb reverse tcp:8081 tcp:8081     # Metro
adb reverse tcp:3010 tcp:3010     # API server
adb reverse tcp:3006 tcp:3006     # map style
```

The phone then reaches the laptop on `localhost`. This matters: release builds block cleartext
HTTP (`targetSdk 36`), and `apps/native/app.plugin.js` permits it **only** for
`10.0.2.2` / `localhost` / `127.0.0.1`. `adb reverse` + `localhost` is already allowed.

If you instead use WiFi/LAN, you must add your laptop's LAN IP to `CLEAR_TEXT_HOSTS` in
`apps/native/app.plugin.js` and rebuild, or every card stays "Checking connection…" while the
app otherwise renders fine.

### 3c. Build and install a release APK

Export the URLs **before** the gradle call — varlock prefers process env over `.env`, so the
committed config stays clean:

```bash
# PowerShell, from roto-app/
$env:EXPO_PUBLIC_SERVER_URL="http://localhost:3010"
$env:EXPO_PUBLIC_TILE_URL="http://localhost:3006/style.json"
scripts\gradlew-roto.bat :app:assembleRelease            # ~20 min cold, ~5 min incremental
adb install -r apps\native\android\app\build\outputs\apk\release\app-release.apk
adb shell am start -n lk.roto.app/.MainActivity
```

Never use the `R:` subst drive for gradle — `@react-native/codegen` fails with
"this and base files have different roots". Batch Android changes; a cold build is expensive.

---

## 4. Test order — highest blast radius first

### T1 — Startup and trilingual (5 min)
1. Cold start with the stack down, then up. App must start in seconds, no ANR.
2. Home screen: switch en → si → ta and **tap through every tab**. Watch for English leaking
   through. Then check the newly-fixed spots: sign-in/sign-up validation (submit an empty form
   and a 2-character password), the LIVE/OFFLINE chip, the SOS-contacts email placeholder, and
   the 404 screen (`adb shell am start -a android.intent.action.VIEW -d "roto-app://nope"`).
   *Pass:* every rider-facing string changes language; no `tofu` boxes on Sinhala/Tamil glyphs.

### T2 — Crash detection. **Tune this before anything else.**
This is the item with the most blast radius: a false positive texts someone's family at a
pothole. The current constants are **invented guesses**.

Source of truth: `modules/roto-safety/android/.../CrashDetectorService.kt` (companion object)
and `apps/native/lib/safety.ts`.

| Constant | Value | Meaning |
|---|---|---|
| `DEFAULT_THRESHOLD_G` | 4.0 | resultant accel that starts the stillness watch |
| `DEFAULT_MIN_SPEED_KMH` | 15.0 | must have been moving this fast in the last 10 s |
| `STILLNESS_WINDOW_MS` | 10 000 | how long it watches after impact |
| `STILLNESS_MAX_SPEED_KMH` | 3.0 | below this = stopped |
| `STILLNESS_MAX_ACCEL_VARIANCE` | 0.35 | below this (g²) = not still riding |
| `EVENT_COOLDOWN_MS` | 300 000 | one event per 5 min |

The rider-facing knob is **Crash sensitivity** on the SOS screen: 3–6 g, stored in SecureStore
under `roto-crash-g` (`CRASH_G_KEY`), read by `ride-recorder.ts` at record start, default 4.

**Watch the algorithm work** — this log is the whole test:

```bash
adb logcat -s RotoSafety
# "watch started thresholdG=4.0 minSpeedKmh=15.0 lowRate=false"
# "impact detected g=… speedBeforeKmh=…, watching for stillness"
# "stillness confirmed avgSpeed=… variance=…, raising crashSuspected"
# "rider kept moving (avgSpeed=… variance=…), impact dismissed as false alarm"
```

**Procedure**
1. **Negative test (false positives).** Ride over known potholes, a railway crossing and a
   speed bump at 20–40 km/h. *Pass:* no `stillness confirmed` line. Every impact must end in
   `rider kept moving`. Repeat ≥ 10 bumps.
2. **Positive test.** With the phone mounted and moving ≥ 15 km/h (or push speed via
   `updateSpeed`), drop the phone ~0.5–1 m onto a cushion and leave it still. *Pass:* impact →
   stillness → `crashSuspected` → the full-screen countdown appears within ~10 s.
3. **Tune.** False positives → raise the sensitivity value toward 6 g. Misses → lower toward
   3 g. Re-run step 1 after every change; the value that survives 10 potholes is the value.
4. **Cooldown check.** Two genuine impacts inside 5 minutes: the second must be *suppressed*.
   Confirm you are happy with that — it is deliberate, but it is a safety trade-off.

**You cannot preview the alert from a release APK.** `debugSimulate()` in
`modules/roto-safety/index.ts` returns early when `__DEV__` is false:

```ts
if (!__DEV__) { return Promise.resolve(); }   // release build = no-op
```

So the synthetic 6 g / 42 km/h preview only works in a **dev build** (`expo run:android`), and
the Kotlin side notes the adb-broadcast route is *not wired*. Plan T2 as: dev build for the
alert-UI preview, release APK for the real drop test. Also verify
`canUseFullScreenIntent()` / `requestFullScreenIntent()` — Android 14+ needs the user to grant
full-screen-intent permission or the countdown shows as a heads-up notification instead.

### T3 — SOS end to end
1. SOS screen: add a contact on a **second phone** (this is the only way to prove delivery).
2. Trip the countdown (crash alert or manual SOS). *Pass:* countdown runs, "I'm OK" cancels it,
   "Send now" fires immediately, and the lock-screen variant appears when the phone is locked.
3. Let it send. *Pass:* the second phone receives the message and the live link opens and shows
   a position. `sms.ts` is a provider interface with `none` by default — with no gateway
   configured, expect the **prefilled SMS composer** path, plus `tel:119` / `tel:1990`.
4. **Invariant:** SOS must work signed out and with battery saver on. Turn on airplane mode and
   confirm the flow still starts (offline contacts live on the device).

### T4 — Background recording, screen off
Start a ride, screen off, 30 minutes, phone in a pocket. *Pass:* distance keeps climbing, the
foreground-service notification persists, and no `RotoSafety watch stopped` in logcat. If it
dies, it is almost always the battery setting from §3a.

### T5 — Android Auto (Desktop Head Unit)
```bash
adb forward tcp:5277 tcp:5277
"%ANDROID_HOME%\extras\google\auto\desktop-head-unit.exe"
```
*Pass:* Roto appears in the DHU launcher, `startNavigation` renders the NavigationTemplate, the
Stop / Repeat / SOS action strip responds, and maneuvers read correctly for **left-hand
traffic** (roundabouts must be clockwise). Known gaps: no map surface, no `CarIcon`s, and
`onAutoDriveEnabled` is not implemented — that last one is required for Play navigation review.

### T6 — Media keys
With a **second** app playing music, press the headset/remote buttons. *Pass:* Roto responds.
Known limitation: a playing music app keeps button priority; only works while the ride
foreground service keeps the process alive; long-press needs a remote that sends key-up.

### T7 — Ride capture and sync
Record a ride → STOP → "Sync queued rides". *Pass:* a new row in `rides`, the local queue
empties, and `sync.delta` returns 200. Then go offline mid-ride and confirm it queues and
drains on reconnect.

### T8 — Offline pack
Download the Colombo pack, enable airplane mode, restart. *Pass:* the map still renders from
local tiles with OSM/OpenMapTiles attribution visible.

---

## 5. Logcat cheatsheet

```bash
adb logcat -s RotoSafety            # crash detector — the T2 test lives here
adb logcat -s ReactNativeJS         # expect: Running "main"
adb logcat | grep -iE "roto|crash|sos"
```

---

## 6. Still open after this pass

- **si/ta copy is a non-native best effort.** A native speaker must review it before any store
  release — hard gate, not a nice-to-have. This includes the strings added on 2026-10-09.
- Fuel prices table is empty (admin-entered via `/admin/fuel`; no source invented).
- Calendarific cron is unexercised (no API key). Poya currently comes from the Meeus
  calculation in `packages/db/src/seed/lk-reference.ts`, which can drift a day near midnight.
- Open decisions, do not re-decide without the owner: D2 prod Postgres, D4 next-intl,
  D6 satellite, D7 OSM extract host, D8 RainViewer, D9 Strava, D10 Serwist PWA,
  D11 LK speed limits, D13 Riyasewana.
