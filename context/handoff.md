# Handoff: where the work stands (2026-09-28)

## S24 Ultra startup check (2026-09-28)

The 328 MB debug APK installed on the Samsung S24 Ultra (`adb install -r` → `Success`). Metro bundled 3,499 modules and the phone showed the Roto home screen. The emulator ANR does not reproduce on this phone. First launch exposed a separate runtime bug: native auth and tRPC imported the generated Varlock `ENV` proxy, which is not initialized in React Native. Both now use Expo's inlined `process.env.EXPO_PUBLIC_SERVER_URL`; reloading reached the home screen and `npm run check-types` passed 8/8. With USB, `adb reverse` is needed for ports 8081, 3010 and 3006 because the current native `.env` uses localhost. The first sync call failed before port 3010 was reversed; the subsequent sync result and the rest of the device checklist remain unverified.

Read this first, then `context/feature-parity-plan.md` (the plan), then `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`.
A self-contained prompt for starting a fresh session on this is in `context/continue-prompt.md`.

## Completion at a glance

Phases 0–5 have code written, except the deferred PWA (D10). "Code" means written and type-checking;
"Runtime verified" means the named flow was actually exercised. The S24 has rendered the home screen,
but the device checklist has not been completed.

| # | Phase | Scope | Code | Runtime verified | Blocker / what is left |
|---|---|---|---|---|---|
| 0 | Foundation | core pkg, routing rewrite, schema integrity 0006, Valhalla infra, shared lang, local DB, SOS contacts UI, B1–B16 | 100% | yes | — |
| 1 | Safety & nav | safety trips/trigger, SOS flow, background recording, nav engine, live trip page | ~95% | server yes; S24 home only | Test SOS countdown/delivery, crash detection, navigation and screen-off recording on the S24; tune thresholds before use |
| 2 | Planning & LK data | planner rebuild, imports, share, POI/hazard/closure/holiday/fuel, weather, speed, surface | ~95% | yes (web + API) | tiles D7 host, D11 limits |
| 3 | Tracking & community | ride detail, photos, replay, heatmap, groups, feed, clubs, challenges, profiles, moderation, GDPR, curvature layer | ~90% | web + API; native flows untested | Social flows need real accounts; test ride capture and sync on phone |
| 4 | New-rider layer | 5 learner modules + quizzes, dealers, garage + reminders, Riyasewana, guides, web locale routing | ~90% | web; native flows untested | Native-speaker si/ta review; D4 next-intl; phone checks |
| 5 | Platform | Android Auto, media keys, PWA | ~70% | APK boots on S24; Auto/remotes untested | PWA skipped (D10 open); test Auto with head unit and media keys |
| — | Beyond items | trilingual, LK road reality, garage, SOS channels, community routes | ~85% | partial | Poya from Meeus, not Calendarific; hardware and language checks remain |

**Gates, all green:** `check-types` 8/8 · `test` 7/7 (core 57, api 35) · `tiles/scripts/smoke.mjs` 8/8 · Valhalla avoids expressways · migrations 0006–0019 applied (44 tables) · 9 public API endpoints return 200 · 15 web routes serve 200 · PDF export renders en/si/ta · APK builds and installs.

**Hard truth about verification:** the native app renders the home screen on the S24 Ultra after fixing
the Varlock startup error. The emulator ANR did not reproduce there. Crash thresholds, SOS countdown,
Android Auto, media keys, offline maps and background recording remain unverified on hardware. The first
sync attempt failed before USB port forwarding was enabled; its later result is unverified.

**Overall:** most planned code is written, but the release gate is still open. A percentage would
hide the untested safety and ride flows; complete the device checklist and native-speaker review first.

## Goal

Build every feature in the Feature Matrix and all five "Beyond" items from `context/sri-lanka-foss-motorcycle-app-research-and-feature-matrix.md`. The full plan, with files and changes per feature, is `context/feature-parity-plan.md`. All decisions are recorded in its §10 (decided table). Do not re-open decided items without the owner.

## Owner decisions (short list; details in plan §10)

- D1 Valhalla: local Docker only (`roto-app/tiles/docker-compose.yml`). Prod on Vercel has no Valhalla and must degrade via `RouteResult.capabilities`.
- D3 Alerts: free channels now (push to contacts who use Roto, email, prefilled SMS composer + `tel:119`/`tel:1990`). `sms.ts` is a provider interface, `none` by default; a sponsor's gateway plugs in later.
- D5 No CarPlay. Android Auto only.
- D12 Five learner modules: road signs; right of way, lanes and overtaking; buses, three-wheelers and animals; rain and monsoon; licence, revenue licence and documents.
- D14 Vitest for pure logic in `packages/core` and `packages/api/src/lib` only.
- D15 Native modules Android-only (Kotlin): `roto-safety`, `roto-car`, `roto-media-keys`. No iOS/Swift.
- D16 App ID `lk.roto.app` — **applied** (`apps/native/app.json` android.package + ios.bundleIdentifier).
- D17 Build all phases first, device-test once at the end on the owner's Samsung S24 Ultra + Android Auto Desktop Head Unit. Per-phase gate: `npm run check-types`, `npx turbo run test`, web visual QA (`scripts/capture.mjs`), `tiles/scripts/smoke.mjs`.
- Open (not blocking yet): D2 prod Postgres provider with PostGIS, D4 next-intl, D6 satellite, D7 OSM extract job host, D8 RainViewer, D9 Strava (out of v1), D10 Serwist, D11 LK speed-limit defaults, D13 Riyasewana link-out.

## Done before this handoff

1. Design overhaul (uncommitted):
   - Web: all UI on shadcn (Base UI, `base-vega` style) in `packages/ui`; tokens and Overpass/Noto fonts in `packages/ui/src/styles/globals.css`; pages rewritten: `apps/web/src/app/{page,plan/page,dashboard/*,login/page,layout}.tsx`, `components/{header,user-menu,mode-toggle,loader,route-trace,sign-in-form,sign-up-form}.tsx`. DESIGN.md typography/light-theme updated.
   - Native: HeroUI Native kept; hand-rolled controls replaced; theme mapping in `apps/native/global.css`; `map.tsx`, `two.tsx`, drawer/tabs index updated; new i18n section keys. SOS no longer disabled while busy.
2. Research + plan: `context/feature-parity-plan.md` (bugs B1–B16 in §1.1, blockers §1.3, architecture §2, foundation §3, every matrix row §4, Beyond §5, migrations §6, deps §7, phases §8, verification §9, decisions §10).
3. Toolchain: `ANDROID_HOME=C:\Users\induwara\AppData\Local\Android\Sdk` and `platform-tools` added to the user PATH. JDK 17 installed. Android Auto Desktop Head Unit v2.0 installed at `C:\Users\induwara\AppData\Local\Android\Sdk\extras\google\auto\desktop-head-unit.exe`.

## In progress at handoff: Phase 0, three parallel workstreams

These were started by background agents and may be finished, partly done, or not started when you pick up. Verify each before continuing (checks below). Each stream owned disjoint files.

### Stream A: DONE (2026-09-28)
`packages/core` created (geo, privacy, gpx, import, curvature, maneuvers, holidays, i18n, types; 50 tests). `packages/api/src/lib/routing/` rewrite (23 tests; `lib/routing.ts` is a re-export shim keeping the legacy `planRoute(points, curvy)` overload for `seed/curated.ts`). B1, B8, B14, B15 fixed. Expressway ban: `use_highways: 0` + every Valhalla route post-checked with `/trace_attributes` for `road_class: motorway`, replanned once with `exclude_polygons`, else throws to BRouter (`callValhallaBanningMotorways` in `valhalla.ts`); `search_filter.max_road_class` only affects snapping. `route` router: `plan({waypoints 2–500, curvy, avoid?, heading?, alternates?, elevation?, lang?})`, `roundTrip → {best, alternatives}`, `reroute`, `attributes`, `elevation`, `importUrl`. `npx turbo run test` 73/73. Holidays: Meeus can drift a day near midnight; Calendarific stays source of truth.
Known native breakages left for stream D: `map.tsx:196` expects flat `RouteResult` from `roundTrip` (now `{best, alternatives}`); `modules/roto-media-keys/index.ts:102` `addListener` missing on the native module type.

### (Original brief) Stream A: `@roto-app/core` + routing rewrite (plan §3.2, §3.3, B1, B8, B14, B15, D14)
Owned: new `packages/core/**`; `packages/api/src/lib/**`; `packages/api/src/routers/route.ts`; `packages/api/package.json`; `apps/web/src/app/plan/**`; `apps/web/package.json`; root `package.json`/`turbo.json` (test task only).
Check:
- `packages/core/package.json` exists with exports for geo, gpx, import, curvature, maneuvers, holidays, i18n, types.
- `packages/api/src/lib/routing/` folder exists (valhalla, brouter, osrm, loops, attributes, elevation, match, index); `valhalla.ts` uses `use_highways: 0` and `use_trails`, not `use_hills`/`use_primary`.
- `npx turbo run test` runs Vitest in core and api.
- `apps/web/src/app/plan/page.tsx` imports from `@roto-app/core` and no longer sends >25 points to `route.plan`.
- `packages/db/src/seed/curated.ts` still compiles against the routing exports.

### Stream B: DONE (2026-09-27)
Migration `packages/db/src/migrations/0006_good_iron_lad.sql` generated, hand-edited (dedupe + orphan cleanup before PKs/FKs), applied to local Docker Postgres. New `schema/safety.ts` (`push_tokens`), `routers/safety.ts` (`contacts.list/add/update/remove/reorder`, `registerPushToken`; LK phone normalisation; `linkedUserId` by email match only since `user` has no phone column). groups/events/rides/privacy upgraded as planned; all return shapes backward compatible (`rides.mine` still returns a plain array; optional `{limit, before}` input). check-types 7/7 green at the time.
Windows gotcha found: `npm run db:generate|db:migrate` fail through turbo ("Cannot run interactive task ... without Terminal UI") and plain `npx drizzle-kit` fails because varlock's Windows fallback runs `execFileSync` on a path with spaces under `shell:true`. Working command, from `roto-app/packages/db`:
```powershell
$env:PATH = "$(Resolve-Path ..\..\node_modules\.bin);$env:PATH"; npx drizzle-kit generate   # or: migrate
```

### (Original brief) Stream B: schema integrity + routers (plan §3.1, B3, B6, B7, B11/B12 server side, B16, D3 tables)
Owned: `packages/db/**` except `seed/curated.ts`; `packages/api/src/routers/{groups,events,rides,privacy,index,safety}.ts`.
Check:
- `packages/db/src/migrations/0006_*.sql` exists, starts with duplicate/orphan cleanup before composite PKs and FKs; journal updated.
- Applied locally? Run `npm run db:migrate` from `roto-app/` (DB: docker `tiles-postgres-1`, port 54322, password `postgres`; URL in `apps/server/.env`). Run `node scripts/patch-varlock-windows.mjs` first if varlock errors with EBUSY.
- New `packages/api/src/routers/safety.ts` (contacts CRUD with LK number normalisation `07XXXXXXXX` → `+947XXXXXXXX`, `registerPushToken`) registered in `routers/index.ts`; `push_tokens` table; `sos_contacts` has `relation, lang, sortOrder, linkedUserId, email`.
- groups: upsert position, inline 120 s prune, `leave/setRoute/setRegroup/end`; events leaderboard grouped by user id.

### Stream C: DONE (2026-09-28)
Local Valhalla rebuilt with `admins.sqlite`, `timezones.sqlite`, SRTM `elevation_tiles/` (LK bbox), `include_construction: true` via `tiles/scripts/build-valhalla.ps1` (`.sh` twin). Build must use `-j 1` (parallel build corrupts tiles on Docker Desktop bind mounts). `valhalla_build_config --merge-config` does not override existing keys, so the script regenerates with explicit flags. This Valhalla ignores `GET /status?verbose=true`; use `POST /status {"verbose":true}` (`service_limits.status.allow_verbose: true` set). `tiles/scripts/smoke.mjs`: 8/8 pass. `style.json` replaced by `style.template.json`, rendered by `serve-style.mjs` with host from `STYLE_PUBLIC_HOST` or request Host. Server `GET /status` added. Large data now gitignored (`tiles/valhalla/*.sqlite`, `elevation_tiles/`).
**Key finding:** LK OSM does NOT tag expressways `motorcycle=no` (`/locate` near Kottawa shows `access.motorcycle: true`). The expressway ban must be enforced in our routing code (`use_highways: 0` + `search_filter.max_road_class` + post-check of returned road classes). Sent to stream A.
Unverified: live curl of the server `/status` route (port 3010 phantom EADDRINUSE and the `rtk` hook mishandles the path with spaces under cmd.exe).

### (Original brief) Stream C: tiles/Valhalla infra (plan §3.4, B2, B9)
Owned: `tiles/**`; `/status` route in `apps/server/src/index.ts`.
Check:
- `tiles/scripts/build-valhalla.ps1` (+ `.sh`) exists; `curl http://localhost:8002/status?verbose=true` shows `has_admins` and `has_timezones` true; `/height` returns non-zero heights near Kandy.
- `tiles/style.template.json` + `serve-style.mjs` substitutes host (`STYLE_PUBLIC_HOST` or request Host).
- `tiles/scripts/smoke.mjs` exists; note its answer on whether LK expressways are tagged `motorcycle=no` (the routing needs it; if not tagged, keep the `search_filter` road-class exclusion).
- `GET /status` on the server proxies Valhalla status.
- `tiles/README.md` updated.

### Streams E/F/G: Android native modules (started early, independent)
Owned: `roto-app/apps/native/modules/roto-safety/**`, `modules/roto-car/**`, `modules/roto-media-keys/**` respectively. Plan §4.12, §4.5, §4.18. These agents only write module code, a config plugin and a `README.md` with integration steps; they do NOT edit app.json/package.json or wire the modules into the app, and they could not compile Kotlin (no prebuild). Check: each module folder has `expo-module.config.json`, `index.ts` with a JS fallback, `android/` Kotlin sources, `plugin/`, `README.md`. Integration (add plugins to app.json, call sites, `npx expo prebuild` + gradle build to catch Kotlin errors) belongs to Phase 1.

- Stream G `roto-media-keys`: DONE (not compiled yet). `MediaSessionCompat` + a silent `AudioTrack` holding transient-duck audio focus (Android 14 needs real playback for a session to win media buttons). `androidx.media:media:1.7.0`. Config plugin is a no-op. Limitations in its README: a playing music app keeps button priority; volume keys best-effort; long-press needs remotes that send key-up; only runs while the ride foreground service keeps the process alive. Integration: add `"roto-media-keys": "./modules/roto-media-keys"` to `apps/native/package.json`, plugin to app.json, rebuild dev client, wire in `lib/use-navigation.ts`.

- Stream E `roto-safety`: DONE (not compiled yet). Package `lk.roto.safety`. Files: `RotoSafetyModule.kt`, `RotoSafetyBridge.kt`, `CrashDetectorService.kt` (foreground service; impact ≥ 4 g after dividing SensorManager m/s² by gravity; speed ≥ 15 km/h in prior 10 s via FusedLocation `play-services-location:21.0.1` or JS `updateSpeed`; then 10 s stillness < 3 km/h and accel variance < 0.35 g²; one event per 5 min; `setLowRate` never off), `CrashAlertPresenter.kt`, `CrashAlertActivity.kt` (lock-screen countdown), plugin adds permissions + service/activity. JS API: `isAvailable, start, stop, updateSpeed, setLowRate, canUseFullScreenIntent, requestFullScreenIntent, showCrashAlert, dismissCrashAlert, debugSimulate` + `crashSuspected/alertOk/alertSend` listeners, safe stubs on iOS. Risks: variance constant needs on-device tuning; gyroscope registered but unused; notification actions route through the activity (no BroadcastReceiver yet). Note: the agent's claim that the old JS `lib/safety.ts` compared m/s² is wrong (expo-sensors Accelerometer reports g); the old bug is only the missing debounce/stillness logic (B4). Integration per its README in Phase 1.

- Stream F `roto-car`: DONE (not compiled yet). `androidx.car.app:app:1.7.0`; `RotoCarModule.kt`, `RotoCarStore.kt`, `RotoCarAppService.kt` (debug allow-all hosts, release `hosts_allowlist_sample`), `RotoCarSession.kt`, `NavigationScreen.kt` (map-less NavigationTemplate/MessageTemplate, text ActionStrip Stop/Repeat/SOS), `ManeuverMapping.kt` (Valhalla type → `Maneuver.TYPE_*`; roundabouts use clockwise variants for left-hand traffic). JS API `isAvailable, isConnected, startNavigation, updateTrip, stopNavigation` + `connected/disconnected/action` events. Follow-ups: map surface, `CarIcon`s, `onAutoDriveEnabled` (needed for Play navigation review). DHU test: `adb forward tcp:5277 tcp:5277`, run `desktop-head-unit.exe`.

If a stream is incomplete, finish it using its plan section and the ownership above. Then run `npm run check-types` (all 7 tasks) from `roto-app/` and fix breakages.

## Status as of 2026-09-28 (all five build phases done; device test remains)

Build is complete across Phases 0–5 (D17: one device-test pass at the end, not yet done). Nine parallel streams landed, then an integration pass fixed the drift between them.

**Gates, all green:** `npx turbo run check-types` 8/8; `npx turbo run test` 7/7 (core 57 tests, api 35); `tiles/scripts/smoke.mjs` 8/8; `node scripts/capture.mjs --audit` 0 failures on `/`, `/plan`, `/routes`, `/learn`; server boots and answers `route.plan` (valhalla, 56 maneuvers), `route.roundTrip`, `route.elevation`, `curated.list`, `pois.list`, `hazards.near`, `holidays.today`, `fuel.current`, `challenges.list`; web serves `/`, `/plan`, `/routes`, `/dealers`, `/learn`, `/learn/[module]`, `/learn/[module]/quiz`, `/t/[token]`, `/dashboard/*`, `/admin/*`, `/u/[username]`, `/r/[slug]`, `/ride/[slug]`. Migrations 0006–0019 applied to local Docker Postgres (44 tables).

**Android now builds.** `npx expo prebuild --platform android` succeeds and `scripts\gradlew-roto.bat :app:assembleDebug` produces a 312 MB debug APK. All three Kotlin modules compile (`roto-safety`, `roto-car`, `roto-media-keys`) and their manifest entries land in the merged manifest — the crash service, the crash alert activity, the Android Auto `CarAppService` with the `NAVIGATION` category, and the automotive meta-data. Three environment fixes were needed and are documented in AGENTS.md: `app.json` must point plugins at `app.plugin.js` (not the module folder, which made Node try to type-strip `expo-modules-core` under `node_modules`), the NDK install on this machine was a truncated 639 MB of 781 MB download that had to be completed and extracted, and gradle must run from the real `D:\` path rather than the `R:` subst drive because `@react-native/codegen` rejects mixed roots.

### What landed
- `packages/core` (geo, privacy, gpx, import, curvature, maneuvers, holidays, brands, `learn/**` five D12 modules + 4 guides, i18n, types).
- `packages/api/src/lib/routing/**` (Valhalla → BRouter → OSRM, expressway ban, attributes, elevation, match) plus `sms.ts` / `email.ts` / `push.ts` / `geo-query.ts`.
- Routers: `route`, `rides`, `groups`, `curated`, `events`, `privacy`, `safety` (contacts, trips, trigger, resolve), `pois`, `hazards` (+closures), `holidays`, `fuel`, `routes`, `community`, `challenges`, `moderation`, `garage`.
- Server: `/upload` (Vercel Blob), Postgres rate-limit store, `/cron/holidays` (Calendarific, daily Vercel cron), `/status` Valhalla proxy, better-auth organization/admin/username plugins (mirrored in web + native auth clients).
- Web: planner rebuild (`plan/_lib/use-planner.ts` + 10 components), share pages with OG images, `/routes`, `/dealers`, `/learn` (real content + quiz), `/u/[username]`, dashboard rides/detail/privacy/safety, admin reports + fuel, header language switcher.
- Web PDF export: `GET /api/route-pdf/[slug]?lang=en|si|ta` renders the route sheet server-side with `takumi-pdf` through the `pdfcn` component set (shadcn registry `@pdfcn/takumi/*`, added to `components.json`). Real vector text, selectable body, embedded Noto Sans Sinhala/Tamil subsets (required — takumi throws "No registered font covers" on the si/ta sheets without them, see `src/lib/pdf-fonts.ts`). Route line is drawn as SVG from the coordinates (`src/lib/pdf-route-line.tsx`), not a maplibre canvas grab, because maplibre is not configured with `preserveDrawingBuffer`. Elevation comes from `route.elevation` at render time (a saved route has no elevation column). Linked from `/r/[slug]` and `/r/[slug]/export`; the print-CSS view is kept as the zero-dependency fallback.
- Native: local Drizzle DB (2 migrations incl. `photo_queue`), `lib/location-task.ts`, `lib/use-navigation.ts`, `lib/safety.ts` (sosFlow + native crash module), `lib/garage.ts`, `lib/i18n-more.ts`, ride detail with charts + photos + replay, learn screens, dealers, privacy editor, SOS contacts, charts, photo components, three Kotlin modules wired into `app.json`/`package.json`.

### Integration fixes this session (the drift the parallel streams left)
- `challenges.checkin` missing required `at`; `curated.rate` passed `null` to a `boolean notNull` column.
- `curated.list` now returns `{items, nextCursor}`: fixed the 3 legacy callers (web home, native drawer, native map) and left the planner hook tolerant of both shapes.
- Installed `expo-image-picker`, `expo-notifications`, `expo-sharing`, `expo-task-manager` (plus `@vercel/blob`, `hono-rate-limiter`) and re-ran the varlock patch.
- `Container` now merges `scrollViewProps.contentContainerStyle` instead of rejecting it.
- Wired all 9 new routers into `routers/index.ts`; added organization/admin/username client plugins to both auth clients.
- **varlock on Windows:** the second patch now spawns `node node_modules/varlock/bin/cli.js` instead of the `varlock.cmd` shim. The old quote-only fix still died with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`, which killed the server, the web app and drizzle-kit. Documented in AGENTS.md along with the `subst R:` workaround for `.cmd` shims and `next typegen`.
- `next typegen` only writes `.next/types` when `next dev` is not running; while dev is up, delete `.next/types` before typechecking.

### Emulator attempt (partial — read this before trusting any "it works" claim)
Ran the AVD `Medium_Phone_API_36.1` (Android 16, software GPU). What is proven:
- The 328 MB debug APK installs cleanly (`adb install -r` → Success).
- The JS bundle builds and every module resolves (19.6 MB, ~3400 modules) — this is what proved the Metro fix.
- The app process launches and reaches `lk.roto.app/.MainActivity`.

At the time, the app ANR'd during startup on this emulator twice. The S24 Ultra check above now proves the home screen renders on hardware; the emulator-specific cause remains undiagnosed.

The dev-client flow that works, for reference:
```
cd roto-app/apps/native
npx expo start --port 8081 --clear            # must run from the real D:\ path
adb shell am start -a android.intent.action.VIEW -d "roto-app://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081"
```
`10.0.2.2` is the host loopback as seen from the emulator. On the USB-connected S24, `adb reverse` forwards the three local ports listed above.
- Device test pass (plan §9 checklist) on the Samsung S24 Ultra + Android Auto Desktop Head Unit. The APK launches on hardware, but background recording with the screen off, crash detection, the full-screen SOS alert, Android Auto and the media-key remotes still need testing. The crash-threshold constants (`CrashDetectorService`, 4 g impact / 15 km/h / 10 s stillness / 0.35 g² variance) are unverified guesses and must be tuned on device.
- Open decisions unchanged: D2 prod Postgres, D4 next-intl, D6 satellite, D7 OSM extract host, D8 RainViewer, D9 Strava, D10 Serwist, D11 LK speed limits, D13 Riyasewana.
- `sync.delta` (offline delta sync) is live: `packages/api/src/routers/sync.ts` (`delta`, `pendingRides`, `pushTrack`), the native `lib/sync.ts` client (5-minute debounce, cursor in `kv`, up to 5 drain rounds when `truncated`), wired into `lib/location-task.ts` and `app/_layout.tsx`. Verified against the live server: 500 POIs + 4 hazards + 13 holidays + 1 challenge on a full pull, correct `truncated` at `limit: 3`, 0 rows on a cursor replay, and `pendingRides` 401s an anonymous caller.
- Real LK geodata is loaded: 12 410 OSM POIs (5 151 hotels, 4 646 food, 961 fuel, 898 hospitals, 494 police, 64 dealers, 62 EV) and 29 143 scored ways in `road_curvature`, seeded by `packages/db/src/seed/import-osm-pois.ts` and `curvature-ways.ts`. martin publishes the twisty-roads layer (`tiles/martin.yaml`, source id `curvature`) and `style.template.json` styles it (≥1000 solid, ≥300 dashed) with real tiles confirmed at z9–z12. `packages/db/src/seed/lk-reference.ts` seeds the 12 monthly 500 km challenges and offline Poya days. Elephant corridors are seeded (4 rows).
- PDF fonts are fetched from Google Fonts on first use (`src/lib/pdf-fonts.ts`). Self-host the woff2 files and switch to `fontFromUrl` if a deploy environment has no outbound network.
- All si/ta copy still needs native-speaker review before any store release.

### Bugs found and fixed in the last pass (all were live, not theoretical)
- **Metro could not resolve any `@roto-app/core` subpath import at runtime.** `tsc` passed because it follows the same `exports` map, but the bundle died with `Unable to resolve module @roto-app/core/learn` and the app never started. Two causes: the npm workspace junctions in the root `node_modules` pointed at `R:\` (they had been created while the subst drive was mounted), and `apps/native/metro.config.js` had no `watchFolders` / `unstable_enableSymlinks`, so Metro refused to follow a symlink out of the app's projectRoot. Fixed both; the bundle now builds (19.6 MB, ~3400 modules). **This is the bug to check first if a native change "type-checks but won't run".**
- **`apps/native/.env.schema` had a broken validator.** `@type=string(matches="^(https?://|/(?!/))")` — varlock stringifies the function-valued attribute, so it reported `Value must start with "function startsWith()"` and refused to start Metro at all. Replaced with `@type=url(prependHttps=false)`.
- **`EXPO_PUBLIC_TILE_URL` was unset**, so the map style fell back to the maplibre demo tiles. Now `http://localhost:3006/style.json` (the local style server) in `.env`, and `EXPO_PUBLIC_SERVER_URL` points at 3010 where the server actually listens.
- `db.execute` with the node-postgres driver returns a `QueryResult` object, not an array. Every raw-SQL call site that indexed it directly got `undefined` and threw. Added `rowsOf()` in `apps/server/src/lib/rate-limit.ts` and used it in both the limiter store and the cron route.
- The limiter and cron wrote to a quoted camelCase `"resetAt"` column, but migration 0018 generated snake_case `reset_at`. Every insert failed with Postgres `42703`, which is why `GET /cron/holidays` returned 500 instead of 503/401 and why the rate limiter 500'd on `/upload` and `/cron/*`. Verified fixed: 401 on a bad secret, `{"skipped":true,"reason":"no-api-key","year":2027}` with a good one.
- `poi_cache` only stored `name_en`, so offline map labels would have been English-only — a trilingual-invariant violation. Added `name_si`/`name_ta` (drizzle migration `0003`) and mapped them in `lib/sync.ts`.
- `expo-notifications` was installed but missing from `app.json`, so scheduled garage reminders were silently dropped across a reboot. Added the plugin plus `RECEIVE_BOOT_COMPLETED` and `SCHEDULE_EXACT_ALARM`; both confirmed in the merged manifest after prebuild.

## Rules that bite

- Windows. Run everything from `roto-app/`. After any `npm install`, run `node scripts/patch-varlock-windows.mjs`.
- Git is read-only for agents (`.claude/rules/no-git-write.md`). Give the owner commit commands; never run them. Nothing from this session is committed yet.
- Kebab-case file and folder names (`.claude/rules/kebab-case-names.md`).
- Don't run `npm run check` (biome) repo-wide; match 2-space style by hand.
- Web is Next.js 16: read `roto-app/node_modules/next/dist/docs/` before writing Next code. Web components come from shadcn on Base UI (`npx shadcn@latest add <name> -c packages/ui`); native stays HeroUI Native.
- Invariants: crash watch/SOS never gated; privacy-zone points trimmed on device before any send; every rider-facing string in en/si/ta; signal yellow `#FFB300` only accent with `#1A1200` text; OSM/OpenMapTiles attribution on every map; `// ponytail:` for deliberate minimal choices.
- Dev servers: web :3001, server :3010 (per `apps/server/.env`), Metro; tiles: postgres :54322, martin :3005, Valhalla :8002, style server :3006 (`node tiles/serve-style.mjs`). Stale node processes hold ports: `Get-NetTCPConnection -LocalPort <port> -State Listen`.
