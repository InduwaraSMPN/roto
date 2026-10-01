# Feature parity plan: full Feature Matrix + the five "Beyond" items

Status: draft for review, 2026-09-27. Nothing here is built yet.
Source brief: `context/sri-lanka-foss-motorcycle-app-research-and-feature-matrix.md` §4 (matrix) and §5 (Beyond).
Research inputs: codebase inventory (file:line), Context7 docs for Valhalla, BRouter, OSRM, Overpass, Open-Meteo, Expo SDK 57, MapLibre RN 11.3.10, maplibre-gl 6.9.0, tRPC 11.18, Drizzle 0.45.2, better-auth 1.7.3, Next 16.3.5 (local docs), shadcn chart, @react-pdf/renderer, @vercel/blob, hono-rate-limiter, next-intl.

How to read this: §1 lists what research changed about the brief. §2 records the architecture decisions the rest depends on. §3 is foundation work that every feature needs. §4 walks every matrix row, §5 every Beyond item, each with the files to touch and the change. §6 to §9 collect migrations, dependencies, phases and verification. §10 lists the decisions we need to make together before execution.

---

## 1. What research changed

### 1.1 Bugs found in the current code (fix first, they block features)

| # | Bug | Evidence | Effect |
|---|---|---|---|
| B1 | Twistiness slider does nothing on Valhalla | `packages/api/src/lib/routing.ts:53-57` sends `use_hills`/`use_primary` under `costing: "motorcycle"`. Those keys belong to `motor_scooter`; Valhalla ignores unknown keys silently (`src/sif/motorcyclecost.cc`) | Curvy routing is not curvy |
| B2 | Valhalla build has no admin, timezone or elevation data | `tiles/valhalla/valhalla.json:13-18,52` point at files that do not exist | No country access rules, no elevation, no `elevation_interval` |
| B3 | No UI to add SOS contacts | `rides.addSos` (`packages/api/src/routers/rides.ts:25-31`) has no caller | Every SOS SMS opens with zero recipients |
| B4 | Crash fires on every sample over 4 g | `apps/native/lib/safety.ts:8-15`, `map.tsx:114-119` | Repeated SMS composers from one pothole; no cancel |
| B5 | SOS SMS has no location | `map.tsx:118` | Contacts cannot find the rider |
| B6 | Missing unique keys | `group_members`, `live_positions`, `event_rsvps` (`schema/groups.ts:15-44`, `schema/events.ts:22-34`) | `onConflictDoNothing` is a no-op; duplicate rows |
| B7 | Leaderboard groups by `user.name` | `routers/events.ts:35` | Two riders with one name merge |
| B8 | Planner sends all curated coords to `route.plan` | `apps/web/src/app/plan/page.tsx` vs `max(25)` in `routers/route.ts:8` | Curated presets fail validation |
| B9 | `style.json` hardcodes `localhost` tile/glyph/sprite URLs | `tiles/style.json` | Phones on the LAN get no tiles |
| B10 | Weather always fetched for Colombo | `map.tsx:153-161` | Rain alert is for the wrong place |
| B11 | Live position only broadcast while recording; no leave on server | `map.tsx:143-151, 238-248` | Group sharing breaks when not recording |
| B12 | Ride GPX not sent on the online stop path; `startedAt`/`endedAt` never sent | `map.tsx:174-189`, `ride-recorder.ts:74-89` | Rides lose tracks and times |
| B13 | Turn voice hardcoded `en-LK`; `useLang` is per component | `map.tsx:136`, `i18n.ts:192-204` | Voice ignores language; language switch does not propagate |
| B14 | OSRM fallback never requests `steps=true` | `routing.ts:82-103` | No steps from OSRM |
| B15 | `roundTripPoints` ignores cos(lat) | `routing.ts:107-117` | Loops are ovals, distance off |
| B16 | `rides.user_id`, `sos_contacts.user_id` have no FK | `schema/rides.ts` | Orphans on account delete |

### 1.2 LK-specific facts the plan must respect

- Motorcycles are prohibited on Sri Lanka's expressways (E01–E04). Routing must never put a rider on a motorway. Valhalla `use_highways: 0` is a preference, not a ban, so we also exclude motorway class (see §3.3).
- Valhalla has no Sinhala or Tamil narrative locale (confirmed against `valhalla/locales`). Unsupported `language` falls back to `en-US`. Voice text for si/ta must be built on our side from maneuver `type`, street names and distances.
- Android TTS ships Sinhala (`si-LK`) and Tamil (`ta-IN`, no `ta-LK` pack) as separately downloaded voices. The app must detect and prompt.
- No free live-traffic source covers Sri Lanka (TomTom, HERE, Google checked). Open-Meteo has no weather-alerts product anywhere. Nager.Date has no LK; Calendarific does (500 calls/month).
- Emergency numbers: 119 police, 1990 Suwa Seriya ambulance, 110 fire.

### 1.3 Hard platform blockers (plan around them, do not pretend)

| Blocker | Why | Plan |
|---|---|---|
| Silent automatic SMS | Google Play restricts `SEND_SMS` to default SMS apps; `expo-sms` always shows a composer | Server-side SMS gateway when online; composer + `tel:` when offline (§4.12) |
| Crash watch with screen off | `expo-sensors` listeners are not guaranteed in background | Local Expo native module that samples sensors inside the location foreground service (§4.12) |
| Full-screen SOS over lock screen | Not in `expo-notifications` | Same native module adds `USE_FULL_SCREEN_INTENT`; heads-up notification with actions as fallback |
| CarPlay | `react-native-carplay` lacks new-arch support; Expo has no iOS Scenes support; needs Apple navigation entitlement | Spike only, gated on Expo Scenes (§4.5) |
| Android Auto | Only immature libraries | Own local Expo module on the Android for Cars App Library `NavigationTemplate` (§4.5) |
| Free Camera API | Not in maplibre-gl 6.9.0 | 3D flyover via chained `flyTo`/`easeTo` with terrain (§4.8) |
| Sub-daily cron on Vercel Hobby | Hobby crons run once a day | Daily jobs only; stale-row pruning happens inline in write endpoints |

---

## 2. Architecture decisions

**A1. New shared package `@roto-app/core`.** Pure TypeScript, no React, no Node APIs. Holds geo math, polyline, privacy trim, GPX/KML/KMZ/ITN parsing, GPX writing, curvature scoring, maneuver-to-text templates (en/si/ta), holiday/Poya calculation, shared types (`RouteResult`, `Maneuver`, `Waypoint`, `RideSample`). Today web and native duplicate GPX regex, `toGpx` and privacy trim (`apps/web/src/app/plan/page.tsx:38,82-117`, `apps/native/lib/gpx.ts`, `lib/privacy.ts`, `lib/routing.ts`). Layout mirrors `packages/ui`: `exports` map, source only, no build step.

**A2. Hosted Valhalla in production.** Most matrix rows need it: maneuvers, rerouting with heading, elevation, speed limits, surface, map matching, alternates, avoid options. BRouter and OSRM have no motorcycle profile and no posted-limit data. The LK graph is small (built in 16 s from a 137 MB pbf). Recommendation: one small VPS (2 vCPU, 4 GB) running the same `tiles/docker-compose.yml` Valhalla service behind HTTPS, `VALHALLA_URL` set in prod. The BRouter → OSRM chain stays as outage fallback with reduced features flagged in the response (`capabilities` field). **Decision D1.**

**A3. PostGIS turned on, additive.** New migration enables the extension. Add `geom` columns next to existing `lat`/`lon` (never replace), GIST indexes, `mode: 'tuple'` to match `[lon, lat]`. Needed for bbox POI queries, hazards near route, closures near route, heatmaps. Prod Postgres provider must allow PostGIS (Neon and Supabase both do). **Decision D2** (which provider).

**A4. Live data stays on polling.** tRPC SSE works with the fetch adapter but on Vercel it trades short polls for long-lived function instances. Keep 5 s / 30 s polling; prune expired rows inline.

**A5. Blob storage: Vercel Blob.** Ride photos and large GPX. Client-upload tokens from a Hono route (`handleUpload`), direct browser/phone upload. Supabase Storage caps free-plan files at 50 MB.

**A6. Native offline store: Drizzle on expo-sqlite.** The current hand-rolled `ride-queue.ts` table becomes one of several local tables (queued rides, saved routes, POI cache, hazards cache, holidays, learner progress, garage). Separate Drizzle config inside `apps/native` (`dialect: "sqlite", driver: "expo"`), migrations via `useMigrations`. `packages/db` stays Postgres-only.

**A7. Local Expo native modules** under `apps/native/modules/` (Expo Modules API, Kotlin + Swift): `roto-safety` (background crash detection + full-screen alert), `roto-car` (Android Auto), `roto-media-keys` (handlebar remotes). Each gets a `// ponytail:` note on scope.

**A8. SMS gateway on the server** for SOS and live-trip links. LK candidates to evaluate: Notify.lk, Text.lk, Dialog eSMS, or Twilio. **Decision D3.**

**A9. Web i18n.** Public pages (`/`, `/plan`, `/r/[slug]`, `/t/[token]`) get `[locale]` routing with next-intl for crawlable si/ta URLs; strings live in `@roto-app/core/i18n` so web and native share one source. **Decision D4** (next-intl vs plain dictionary).

**A10. Router file layout.** Each new domain gets its own router file in `packages/api/src/routers/` and is added to `routers/index.ts`. Errors move to `TRPCError` with proper codes.

---

## 3. Foundation (Phase 0)

### 3.1 Schema integrity and ride completeness

`packages/db/src/schema/rides.ts`
- `rides.userId` → `.references(() => user.id, { onDelete: "cascade" })`.
- Add `startedAt` (client-set), `endedAt`, `durationS integer`, `movingS integer`, `maxSpeedKmh real`, `avgSpeedKmh real`, `elevationGainM real`, `elevationLossM real`, `visibility text default 'private'` (`private|unlisted|public`), `hideMaxSpeed boolean default false`, `shareSlug text unique`, `samples jsonb` (compact `{t,lon,lat,spd,ele?,lean?}[]` columnar arrays, trimmed), `curvature real`, `matched boolean default false`.
- `sosContacts.userId` → FK cascade; add `relation text`, `lang text default 'en'`, `sortOrder integer`.

`packages/db/src/schema/groups.ts`
- `group_members`: `primaryKey({ columns: [groupId, userId] })`.
- `live_positions`: `primaryKey({ columns: [groupId, userId] })`; add `heading real`, `accuracyM real`.
- `ride_groups`: add `routeId text` (shared route), `regroupLat/Lon real`, `endsAt timestamp`.

`packages/db/src/schema/events.ts`
- `event_rsvps`: `primaryKey({ columns: [eventId, userId] })`.
- `events`: add `description`, `routeId`, `orgId` (club), `endsAt`.

`packages/api/src/routers/events.ts`: leaderboard groups by `user.id`, selects name; use `lt(nextMonthStart)` not `lte`.
`packages/api/src/routers/groups.ts`: `updatePosition` becomes a true upsert (`onConflictDoUpdate` on the new PK); delete rows older than 120 s for that group in the same call; add `leave`, `setRoute`, `setRegroup`; use `crypto.getRandomValues` for codes.
`packages/api/src/routers/rides.ts`: `create` accepts the new fields; `mine` orders by `startedAt desc` with pagination.

Migration `0006_integrity_and_rides.sql` via `npm run db:generate`. Pre-step in the same migration: delete duplicate rows before adding PKs.

### 3.2 `@roto-app/core` package

New files:
- `packages/core/package.json` (`"name": "@roto-app/core"`, `exports` for `./geo`, `./gpx`, `./import/*`, `./curvature`, `./maneuvers`, `./holidays`, `./i18n/*`, `./types`), `tsconfig.json` extending `@roto-app/config`.
- `src/types.ts`: `LatLon`, `LonLat`, `Waypoint {lat, lon, kind: 'break'|'via'|'through', name?}`, `Maneuver {type, instruction, verbalPre?, verbalPost?, streets: string[], lengthKm, timeS, beginIdx, endIdx, exitCount?}`, `RouteResult {coords, km, min, engine, maneuvers, elevation?, capabilities: {maneuvers, elevation, speedLimits, surface}}`, `RideSample`.
- `src/geo.ts`: `haversineM`, `bearing`, `destination`, `pointToSegmentM`, `nearestOnLine` (returns index + distance), `lineLengthKm`, `bbox`, `decodePolyline6` (moved from `routing.ts:10-24`).
- `src/privacy.ts`: `insideAny`, `trimEnds` (moved from `apps/native/lib/privacy.ts`), plus `maskInside` for optional mid-ride masking.
- `src/gpx.ts`: `toGpx({name, track?, route?, waypoints?})` writing GPX 1.1 with `<rte>` + `<trk>` + `<wpt>` and `<time>`/`<ele>` when present (REVER/Scenic/Kurviger compatible).
- `src/import/index.ts`: `importRouteFile(name, bytes)` dispatching by extension to `gpx`/`kml` (via `@tmcw/togeojson` + `@xmldom/xmldom`), `kmz` (`fflate` `unzipSync`, find first `.kml`), `itn` (pipe-delimited, ÷1e5), `tcx`. Returns `{tracks, routes, waypoints}`. `.gdb` returns a clear "export as GPX" error.
- `src/import/google-url.ts`: parse `?api=1&origin&destination&waypoints` and `/maps/dir/a/b/...` forms; short links are resolved server-side.
- `src/curvature.ts`: circumradius per 3-point window, weight buckets (≥1750 m → 0, 175–1750 → 1, 100–175 → 2, 30–100 → 4… per adamfranco/curvature), score = Σ length × weight, split on straights > 2.4 km; `upcomingCurves(coords, fromIdx, aheadM)` for the corner assistant.
- `src/maneuvers.ts`: `speakManeuver(m, lang, distanceM)` builds en/si/ta sentences from `type` + street + distance; English prefers Valhalla `verbalPre`.
- `src/holidays.ts`: `fullMoonsUtc(year)` (Meeus mean phase + corrections) as offline Poya fallback; `isPoya(date)`.
- `src/i18n/{en,si,ta}.ts` + `index.ts`: shared dictionary; native `lib/i18n.ts` and web import from here.

Consumers:
- `apps/native/lib/gpx.ts`, `lib/privacy.ts`, `lib/routing.ts`: delete, re-export or import from core.
- `apps/web/src/app/plan/page.tsx`: drop inline `toGpx`, regex import, `trim`.
- `packages/api/src/lib/routing.ts`: import `decodePolyline6`, types.
- Root `package.json` workspaces already cover `packages/*`; add `@roto-app/core` dependency in `apps/web`, `apps/native`, `packages/api`; add to server tsdown `alwaysBundle` (already `/@roto-app\/.*/`).

### 3.3 Routing module rewrite

Replace `packages/api/src/lib/routing.ts` with a folder (keep the import path working via `lib/routing/index.ts`):
- `lib/routing/types.ts`: `PlanOptions {waypoints: Waypoint[], curvy: 0..1, avoid: {tolls, ferries, unpaved, highways}, heading?, alternates?: 0..2, elevation?: boolean, lang: 'en'|'si'|'ta'}`.
- `lib/routing/valhalla.ts`:
  - Motorcycle costing: `use_highways: 0` always (expressway ban), `use_trails: curvy * 0.4` (0.6+ only when `avoid.unpaved` is false), `use_tolls: avoid.tolls ? 0 : 0.5`, `use_ferry: avoid.ferries ? 0 : 0.5`. Comment explains B1.
  - Expressway exclusion: per-location `search_filter: { max_road_class: "trunk" }` on every waypoint, plus a one-off check that LK expressways are tagged `motorcycle=no` in the pbf (if yes, costing already refuses them).
  - Send `locations` with `type`, `heading` + `heading_tolerance: 45` on the first point when rerouting, `directions_type: "maneuvers"`, `language: "en-US"`, `alternates` only when exactly two locations, `elevation_interval: 30` when requested.
  - Map every maneuver field into `Maneuver`. Return `elevation` when present.
  - Curvy ranking: when `alternates` returned, score each with `core/curvature` and pick by `curvy` (high curvy → highest score).
- `lib/routing/brouter.ts`: current fallback plus `timode=3` for voice hints mapped into `Maneuver` (verify GeoJSON output carries them; else steps stay empty and `capabilities.maneuvers=false`).
- `lib/routing/osrm.ts`: add `steps=true`, `User-Agent`, 15 s timeout; map steps.
- `lib/routing/loops.ts`: `roundTripCandidates(center, km, direction?, n=6)` with cos(lat) correction (B15), rotated bearings; plan each (bounded concurrency 3), score curvature, return best + the rest as "Shuffle" alternatives.
- `lib/routing/attributes.ts`: `routeAttributes(coords)` → Valhalla `/trace_attributes` with `shape_match: "edge_walk"`, filters `edge.speed_limit, edge.surface, edge.unpaved, edge.road_class, edge.length`; returns per-segment arrays; cached in-process LRU keyed by polyline hash.
- `lib/routing/elevation.ts`: Valhalla `/height` (`range: true`, `resample_distance: 50`); fallback Open-Meteo elevation API in chunks of 100 points.
- `lib/routing/match.ts`: `/trace_route` with `shape_match: "map_snap"` for recorded rides.
- `lib/routing/index.ts`: `planRoute(opts)` engine chain; `capabilities` computed from engine.

`packages/api/src/routers/route.ts`:
- `plan` input becomes `PlanOptions` (waypoints max 25; server simplifies anything longer with Douglas–Peucker before sending).
- `roundTrip` input `{center, km 5..600, direction?: 0..359, curvy, avoid, seed?}` returning `{best, alternatives}`.
- New `reroute({from, heading, remaining: Waypoint[], opts})`, `attributes({coords})`, `elevation({coords})`, `importUrl({url})` (server follows short-link redirects, then `core/import/google-url`).

Web B8: `plan/page.tsx` sends curated routes as start/end + up to 23 evenly spaced via points, or shows the curated geometry directly without re-planning.

### 3.4 Infra fixes

`tiles/README.md` + new `tiles/scripts/build-valhalla.sh` (and `.ps1`): documented build inside the Valhalla container:
1. `valhalla_build_admins -c valhalla.json sri-lanka-latest.osm.pbf`
2. `valhalla_build_timezones > timezones.sqlite`
3. `valhalla_build_elevation 79 82 5 10 ./elevation_tiles` (SRTM, LK bbox only)
4. `valhalla_build_config --mjolnir-admin ... --mjolnir-timezone ... --additional-data-elevation /custom_files/elevation_tiles --mjolnir-include-construction true`
5. `valhalla_build_tiles -c valhalla.json sri-lanka-latest.osm.pbf`

`tiles/valhalla/valhalla.json`: fix `additional_data.elevation` to `/custom_files/elevation_tiles`, remove `tile_extract` or build it.

B9: `tiles/style.json` → `tiles/style.template.json` with `{{TILE_HOST}}` placeholders; `serve-style.mjs` substitutes `STYLE_PUBLIC_HOST` (defaults to the request `Host` header) at request time. Native `EXPO_PUBLIC_TILE_URL` already points at the LAN IP.

Add to `tiles/docker-compose.yml`: nothing new for Phase 0. A prod compose file `tiles/docker-compose.prod.yml` (Valhalla + martin + Caddy TLS) for D1.

Health: `GET /status` proxy on server (`apps/server/src/index.ts`) calling Valhalla `/status?verbose=true` and reporting `has_admins`, `has_timezones`, elevation.

### 3.5 Native shared state and i18n

- `apps/native/contexts/lang-context.tsx` (new): `LangProvider` holding `lang`, persisted to SecureStore `roto-lang`; `useLang()` reads context. Mount in `app/_layout.tsx`. Fixes B13's propagation half.
- `apps/native/lib/i18n.ts`: import dictionaries from `@roto-app/core/i18n`; keep `VOICE_LOCALE`; add `ensureVoice(lang)` (retry `getAvailableVoicesAsync` up to 10× at 500 ms; Android returns `[]` on first call) and `voiceAvailable` state; move every hardcoded string listed in the inventory (map.tsx, two.tsx, drawer index, tabs index, layouts, sign-in/up) into keys.
- `apps/native/lib/voice.ts` (new): single `say(text, lang)` queue (no overlap), uses resolved voice or falls back to English and raises a one-time "download Sinhala/Tamil voice" prompt.
- Remove template leftovers: `app/modal.tsx`, the "+" header button in `app/(drawer)/_layout.tsx:59-65`, react logo assets, `apps/web/public/favicon/site.webmanifest`.

### 3.6 Native local DB (A6)

- `apps/native/db/schema.ts` (new): `pendingRides` (replaces `pending_rides`, adds `samples`, `startedAt`, `endedAt`, stats), `savedRoutes`, `poiCache`, `hazardCache`, `holidays`, `packs` (metadata mirror), `learnerProgress`, `garage`, `reminders`, `kv`.
- `apps/native/drizzle.config.ts`, `apps/native/drizzle/` migrations, `apps/native/db/index.ts` (`drizzle(openDatabaseSync("roto.db"))`), `useMigrations` gate in `app/_layout.tsx`.
- `apps/native/lib/ride-queue.ts`: rewrite over Drizzle; one-time copy from old `roto-rides.db` then drop it.
- `apps/native/metro.config.js`: add `.sql` to `resolver.sourceExts` (Drizzle expo migrations need it) and `babel-plugin-inline-import` per Drizzle docs.

---

## 4. Feature Matrix rows

Each row: target behavior (matching or beating the best incumbent in the matrix), then files.

### 4.1 Curvy / twisty routing (target: Kurviger 4 modes + calimoto environment)

Behavior: four modes (Fastest, Balanced, Curvy, Extra curvy) plus fine slider; avoid tolls, ferries, unpaved; environment preference (hills, coast) via curvature ranking and region bias; never expressways.

- `packages/core/src/types.ts`: `RideMode = 'fast'|'balanced'|'curvy'|'extra'` → curvy value map.
- `packages/api/src/lib/routing/valhalla.ts`: costing as §3.3; `extra` also sets `disable_hierarchy_pruning: true` and requests alternates to rank.
- `packages/api/src/lib/routing/curvy-bias.ts` (new, Phase 2): `linear_cost_factors` built from the top-scored LK ways (see §5.5 curvature layer) to pull routes onto known twisty roads.
- `apps/web/src/app/plan/page.tsx` → split into components under `apps/web/src/app/plan/_components/` (`route-controls.tsx`, `mode-toggle-group.tsx` using shadcn `ToggleGroup`, `avoid-options.tsx` using `Checkbox`/`Switch`).
- `apps/native/app/(drawer)/(tabs)/map.tsx`: extract planning UI into `apps/native/components/ride/plan-sheet.tsx` with HeroUI `Tabs` for modes and `Switch` for avoids.
- i18n keys: `modeFast`, `modeBalanced`, `modeCurvy`, `modeExtra`, `avoidTolls`, `avoidFerries`, `avoidUnpaved`.

### 4.2 Round-trip generator (target: Scenic distance/direction + Beeline Shuffle, free)

- `packages/api/src/lib/routing/loops.ts` (§3.3).
- `packages/api/src/routers/route.ts`: `roundTrip` returns best + alternatives.
- Web: start point by map click or "my location" (`navigator.geolocation`), distance slider 20–300 km, direction dial (8 compass points + "any"), Shuffle button cycles alternatives. `plan/_components/loop-controls.tsx`.
- Native: `components/ride/loop-sheet.tsx` with distance chips (30/60/100/150 km), direction, Shuffle; starts from current fix, not Colombo.

### 4.3 Turn-by-turn + voice + recalculation (target: Scenic detour behavior + Beeline compass mode + mid-ride edit)

Behavior: pre-announce at ~speed-scaled distances (e.g. 1 km/300 m/at turn above 60 km/h; 400/100/at turn in town), voice in en/si/ta, lane/exit counts for roundabouts, off-route detection and reroute with heading, choose "recalculate" or "return to route", compass mode for routes without maneuvers (GPX, curated), mid-ride edit (skip next waypoint, add fuel stop, end here), works offline for the loaded route.

- `apps/native/lib/navigation.ts` (new): pure state machine `createNavigator(route, opts)` with `update(fix)` → `{nextManeuver, distanceM, announce?: {text}, offRoute: boolean, progressIdx, remainingKm, etaMin}`. Uses `core/geo.nearestOnLine`. Off-route: > 40 m for 3 consecutive fixes above 5 km/h. Announce thresholds scale with speed. Never re-announces the same threshold.
- `apps/native/lib/use-navigation.ts` (new): React hook wiring navigator to location stream, voice queue (`lib/voice.ts`), and reroute calls (`route.reroute`), debounced (no more than one reroute per 15 s). Offline: switches to "return to route" (arrow to nearest route point) and retries when `expo-network` reports online.
- `apps/native/app/(drawer)/(tabs)/map.tsx`: delete `follow()`/`bearing()` (lines 121-141); consume `useNavigation`.
- `apps/native/components/ride/hud.tsx` (extract from map.tsx:309-332): maneuver icon per `type` (Ionicons mapping table), distance, street, lane/exit hint, speed, speed-limit badge (§4.11), compass-mode arrow.
- `apps/native/components/ride/route-edit-sheet.tsx` (new): skip waypoint, add stop (nearest fuel from POI cache), end navigation.
- Settings: `components/settings/navigation-settings.tsx` (detour behavior, voice on/off, announce verbosity). Persist in local `kv`.
- `packages/core/src/maneuvers.ts` supplies si/ta text.
- i18n: maneuver template keys (`mnvLeft`, `mnvSlightLeft`, `mnvSharpLeft`, `mnvRoundaboutExit`, `mnvArrive`, `inMeters`, `inKm`, `offRoute`, `rerouting`, `returnToRoute`, …).

### 4.4 Offline maps (target: REVER airplane-mode record + complete offline)

Behavior: download any of the four LK packs or the whole island, progress, size, delete, update (invalidate); offline POIs, hazards, holidays and the active route cached locally; rides record and queue offline; queue auto-syncs on reconnect.

- `apps/native/lib/maps.ts`: add `island` region (bbox ~79.5,5.9,82.0,9.9, z6–13 base + z14–16 per region), `getPackStatus`, `invalidatePack`, progress events via `OfflineManager.setProgressEventThrottle(500)`; drop console logging.
- `apps/native/app/(drawer)/offline.tsx` (new drawer screen): list regions with HeroUI `Card`, progress `ProgressBar`, size, delete/update buttons; storage total.
- `apps/native/lib/sync.ts` (new): `startAutoSync()` subscribes to `expo-network` state, flushes `pendingRides` (parallel-safe, continues past a single failure, exponential backoff), refreshes POI/hazard/holiday caches by bbox and `updatedAt` watermark.
- `packages/api/src/routers/sync.ts` (new): `delta({since, bbox})` returns changed POIs, hazards, closures, holidays since a timestamp (one round trip for cheap phones).
- Map style must work offline: glyphs and sprites are part of the style, so packs include them; confirm with MapLibre OfflineManager docs during Phase 1 device test.

### 4.5 CarPlay / Android Auto

Android Auto (real):
- `apps/native/modules/roto-car/` (new local Expo module): Kotlin `CarAppService` + `Session` + `NavigationScreen` using `androidx.car.app` `NavigationTemplate` (maneuver, distance, travel estimate) and `MapWithContentTemplate` fallback; JS API `RotoCar.updateTrip({maneuver, distanceM, etaMin, street})`, `RotoCar.onAction(cb)`.
- `apps/native/modules/roto-car/expo-module.config.json`, `plugin/with-roto-car.js` config plugin adding `<service>` with `androidx.car.app.CarAppService` intent filter, `automotive_app_desc.xml`, `com.google.android.gms.car.application` meta-data, category `androidx.car.app.category.NAVIGATION`.
- `apps/native/lib/use-navigation.ts`: push navigator state to `RotoCar` when connected.
- Distribution note: Play requires navigation-category review for Android Auto apps.

CarPlay (spike, blocked):
- `context/carplay-spike.md` (new): track Expo discussion #24354; needs Apple CarPlay navigation entitlement, Scenes support in prebuild. No code until both exist. **Decision D5**: accept CarPlay as "not yet" and ship Android Auto, or fund a custom iOS scene config plugin.

### 4.6 Import GPX / KML / KMZ / ITN / Google URL (target: Scenic's list minus GDB/Furkot)

- `packages/core/src/import/*` (§3.2).
- `packages/api/src/routers/route.ts`: `importUrl`.
- Web `plan/_components/import-button.tsx`: accept `.gpx,.kml,.kmz,.itn,.tcx`, and a "Paste Google Maps link" `InputGroup`. If a file has tracks and routes, let the user pick in a shadcn `Dialog`.
- Native: `map.tsx` import handler → `components/ride/import-sheet.tsx` using `expo-document-picker` + new `expo-file-system` `File` API (`new File(uri).bytes()`), replacing legacy `readAsStringAsync`.
- Imported track → optional "snap to roads" (Valhalla `map_snap`) → optional "get turn-by-turn" (plan through ≤25 sampled points).
- `.gdb` and Furkot: message "Export as GPX from BaseCamp / Furkot" (GPSBabel server conversion only if requested later).

### 4.7 Export / share link (target: REVER PDF + Cardo 3D recap, free)

- `packages/db/src/schema/routes.ts` (new): `saved_routes` (id, userId FK, folderId, name, waypoints jsonb, coords jsonb, maneuvers jsonb, options jsonb, km, min, engine, curvature, visibility, shareSlug unique, createdAt, updatedAt), `route_folders` (id, userId, name, sortOrder).
- `packages/api/src/routers/routes.ts` (new): `save`, `update`, `remove`, `mine({folderId?})`, `folders.*`, `bySlug({slug})` (public when visibility ≠ private), `setVisibility`.
- `packages/api/src/routers/rides.ts`: `setVisibility`, `bySlug`.
- Web share pages:
  - `apps/web/src/app/r/[slug]/page.tsx`: public route page, map, elevation chart, stats, GPX download, "Open in app" (`roto-app://route/<slug>`).
  - `apps/web/src/app/r/[slug]/opengraph-image.tsx`: `ImageResponse` from `next/og`, route line drawn from simplified coords (flex-only layout).
  - `apps/web/src/app/ride/[slug]/page.tsx` + `opengraph-image.tsx`: public ride page with replay (§4.10).
  - Use `cacheComponents: true` in `apps/web/next.config.ts` with `'use cache'` + `cacheTag('route:'+slug)` on the fetch helper; `updateTag` after edits. Verify no existing page relies on removed flags.
- PDF: `apps/web/src/app/r/[slug]/_components/pdf-export.tsx` using `@react-pdf/renderer` (client only, dynamic import), content: map snapshot from an offscreen export `Map` with `canvasContextAttributes: { preserveDrawingBuffer: true }`, elevation profile image, maneuver list, emergency numbers.
- Native share: `expo-sharing` for GPX files, RN `Share` for links; deep link routes `apps/native/app/route/[slug].tsx`, `apps/native/app/ride/[slug].tsx` (expo-router auto-links `roto-app://route/<slug>`).
- 3D recap: web ride page "Flyover" button (§4.8).

### 4.8 Web planner + folders (target: Kurviger no-account planner + Scenic folders)

Behavior: no account needed to plan and export; click to add via points, drag to move, reorder list, alternates shown and selectable, elevation profile, surface and speed-limit overlay, day/night/satellite/terrain styles, 3D flyover, saved routes in folders when signed in.

- `apps/web/src/app/plan/page.tsx`: becomes a thin shell; state in `plan/_lib/use-planner.ts` (waypoints, mode, avoids, alternatives, selected, attributes).
- `plan/_components/planner-map.tsx`: maplibre-gl map; one persistent GeoJSON source per concern (route, alternatives, surface segments, waypoints); draggable `Marker`s with keyboard support (`tabIndex`, arrow keys nudge, `stopPropagation`); click adds via point on nearest segment position.
- `plan/_components/waypoint-list.tsx`: shadcn `Item` list with reorder (up/down buttons, keyboard complete), remove, rename.
- `plan/_components/alternatives.tsx`: shadcn `ToggleGroup` of alternatives with km/min/curvature.
- `plan/_components/elevation-chart.tsx`: shadcn `chart` (Recharts AreaChart), hover syncs a map marker.
- `plan/_components/style-switcher.tsx`: `setStyle(url, { transformStyle })` re-inserting Roto sources/layers; styles: night (current), day (light variant `tiles/style.day.json`), terrain (hillshade from `raster-dem`), satellite (**Decision D6** source: EOX Sentinel-2 cloudless licence check, or skip).
- `plan/_components/flyover.tsx`: terrain on (`setTerrain({source:'dem', exaggeration:1.3})`), chained `easeTo` along simplified route with pitch 60, bearing from segment, respects `prefers-reduced-motion` (falls back to static fitBounds).
- `plan/_components/folders-panel.tsx`: saved routes by folder (signed-in only).
- `packages/ui`: `npx shadcn@latest add chart dialog sheet switch toggle-group scroll-area -c packages/ui` (toggle-group exists).
- DEM tiles: `tiles/` gets `dem` source served by martin from an MBTiles built from SRTM (same data as Valhalla elevation). New `tiles/scripts/build-dem.md`.

### 4.9 Curated roads (target: REVER Butler + Scenic ratings)

- `packages/db/src/schema/curated.ts`: add `slug unique`, `descriptionEn/Si/Ta`, `tags text[]` (coast, hills, tea, ancient, wildlife), `curvature real`, `surface text`, `bestSeason text`, `ratingAvg real`, `ratingCount integer`, `submittedBy text`, `status text default 'published'` (`draft|review|published`), `geom geometry(LineString, 4326)`.
- `packages/db/src/schema/community.ts` (new): `route_ratings` (routeId, userId, stars 1–5, comment, ridden boolean, PK routeId+userId).
- `packages/api/src/routers/curated.ts`: `list` filters (region, tag, difficulty, minCurvature, near {lat,lon,km} via `ST_DWithin`), sort (rating, curvature, distance), paging; `rate`, `submit` (from a saved route or ride, status `review`), `moderate` (admin).
- `packages/db/src/seed/curated.ts`: data moves to `seed/curated.lk.ts` with si/ta names; expand to the Beyond #5 list (§5.5).
- Web `/routes` (new `apps/web/src/app/routes/page.tsx`) and `/routes/[slug]`; native `app/(drawer)/(tabs)/routes.tsx` or a section in Rides.

### 4.10 Track + stats + replay (target: Scenic photos/elevation + ESR scrub replay + Beeline heatmap)

Behavior: background recording with screen off, auto-pause, distance, moving/total time, avg/max speed (hideable), elevation gain/loss and profile, max lean, photos pinned on the map, replay scrubber, history, lifetime heatmap.

- Background recording:
  - `apps/native/app.json`: add `expo-location` plugin with `isAndroidBackgroundLocationEnabled`, `isAndroidForegroundServiceEnabled`, `isIosBackgroundLocationEnabled`, permission strings (en); `expo-task-manager`; `expo-notifications`; iOS `UIBackgroundModes: ["location", "audio"]` (audio for voice while locked).
  - `apps/native/lib/location-task.ts` (new, imported first in `app/_layout.tsx`): `TaskManager.defineTask(RIDE_TASK, …)` appending fixes to a local buffer table and emitting to the foreground via an event emitter when mounted.
  - `apps/native/lib/ride-recorder.ts`: switch from `watchPositionAsync` to `startLocationUpdatesAsync(RIDE_TASK, { accuracy: High | Balanced, distanceInterval: 10 | 50, foregroundService: { notificationTitle, notificationBody, killServiceOnDestroy: false }, pausesUpdatesAutomatically: false, activityType: AutomotiveNavigation })`; request background permission with an explanation screen first; `activateKeepAwakeAsync` while navigating (not while pocket-recording).
  - Auto-pause: speed < 1.5 m/s for 15 s pauses moving time and distance; resumes above 3 m/s. Setting to disable.
  - Samples: 1 Hz buffer `{t, lon, lat, spd, alt, lean}`; stats computed on stop; privacy `trimEnds` applied to samples and GPX before enqueue.
  - B12: online stop path sends GPX, samples, times; single code path via `sync.ts`.
- Server post-processing on `rides.create`: `lib/rides/process.ts` (new) map-matches (`match.ts`) when Valhalla available, computes elevation via `/height` if device altitude is poor, computes curvature, sets `matched`.
- Photos:
  - `packages/db/src/schema/rides.ts`: `ride_photos` (id, rideId FK, userId FK, url, lat, lon, takenAt, caption).
  - `apps/server/src/index.ts`: `POST /upload` Hono route with `@vercel/blob/client` `handleUpload` (auth via session, 10 MB, `image/*`), `onUploadCompleted` inserts `ride_photos`.
  - Native `components/ride/photo-button.tsx` using `expo-image-picker` `launchCameraAsync({ exif: true })`; photos taken offline queue in local DB and upload on sync.
- Ride detail:
  - Native `app/ride/[id].tsx` (new): map with track, stats grid (HeroUI `Card`), elevation + speed + lean charts (react-native-svg, already installed; small `components/charts/line-chart.tsx`), photo strip, replay slider (HeroUI `Slider`) moving a marker along samples, share/visibility.
  - Web `apps/web/src/app/dashboard/rides/[id]/page.tsx`: same on shadcn (`chart`, `Slider`, `Card`).
- History: native `app/(drawer)/(tabs)/two.tsx` gets a "My rides" list; web dashboard list with pagination.
- Heatmap: `packages/api/src/routers/rides.ts` `heat({bbox?})` returns simplified points of the user's rides; web dashboard `heatmap` layer (maplibre `heatmap` type); native optional layer on the Ride map.
- Hide max speed: respected on public pages and leaderboards.

### 4.11 Lean / accel / G (target: Motobit map-linked + predictive corner assistant)

- `apps/native/lib/ride-recorder.ts`: store lean per sample (DeviceMotion `rotation.gamma` in degrees, low-pass filtered, calibrated at start by averaging 2 s upright), longitudinal/lateral g from `acceleration`; peak per corner.
- `packages/core/src/curvature.ts`: `segmentCorners(samples)` finds corners from heading change; per-corner max lean, entry/exit speed.
- Ride detail charts map-linked: hovering/scrubbing the chart moves the map marker and vice versa (§4.10 components).
- Corner assistant (native): `use-navigation.ts` calls `upcomingCurves(route, progressIdx, 400 m)`; for radius < 100 m announce "sharp left bend in 200 m" once (template in `core/maneuvers.ts`); disable-able in settings. Motobit calls this "predictive corner assistant".

### 4.12 Crash detection + SOS (target: ESR CRASHLIGHT AI + slide-cancel, Detecht 5 contacts + tracking, free)

Behavior: background crash detection with screen off; impact + stillness logic; 30 s countdown with slide-to-cancel and "I'm OK" notification action; on timeout: server SMS to every contact with a live trip link, fallback SMS composer and one-tap 119/1990 when offline; manual SOS button always visible; SOS contacts managed in-app (5+).

- Detection algorithm (in `modules/roto-safety`, Kotlin; iOS Swift via CoreMotion in the same background location session):
  1. Impact: resultant acceleration ≥ 4 g (configurable 3–6).
  2. Context: speed before impact ≥ 15 km/h within the last 10 s (from the location service).
  3. Stillness: in the next 10 s, speed < 3 km/h and low variance (no riding continuation).
  4. Only then raise `onCrashSuspected`. One event per 5 minutes.
- `apps/native/modules/roto-safety/`:
  - `android/src/main/java/.../RotoSafetyModule.kt` (Expo module), `CrashDetector.kt` (SensorManager listener registered inside the foreground service used by expo-location; if that is not reachable, the module runs its own `FOREGROUND_SERVICE_LOCATION` service), `CrashAlertActivity.kt` full-screen countdown when locked (`USE_FULL_SCREEN_INTENT`, requested at runtime on Android 14+).
  - `ios/RotoSafetyModule.swift` using `CMMotionManager` while the location background mode is active.
  - `plugin/with-roto-safety.js`: manifest permissions and activity; `expo-module.config.json`.
  - JS API: `start({thresholdG})`, `stop()`, `addListener('crashSuspected' | 'cancelled' | 'confirmed')`.
- `apps/native/lib/safety.ts`: replace `startCrashWatch` with the module (keep the JS accelerometer version as foreground fallback when the module is unavailable, e.g. dev builds without prebuild); `sosFlow({reason: 'crash'|'manual'})`:
  - Show `components/safety/sos-countdown.tsx` (full-screen, slide-to-cancel using gesture-handler, big "I'm OK", 30 s, voice + haptics).
  - Schedule `expo-notifications` notification in category `sos` with actions `ok` and `send-now`; channel `sos` importance MAX, bypass DND where allowed.
  - On timeout or send-now: `trpc.safety.trigger` (online) → server sends SMS to contacts; offline → `expo-sms` composer with prefilled text including `https://maps.google.com/?q=lat,lon` and the live link, then offer `tel:119` / `tel:1990`.
- Never gated: module starts with any recording or navigation regardless of saver/login; manual SOS works logged out (uses locally stored contacts in the local DB, synced when signed in).
- Server:
  - `packages/db/src/schema/safety.ts` (new): `live_trips` (id, userId FK, token unique, startedAt, endedAt, lastLat, lastLon, lastSpeed, lastHeading, updatedAt, reason), `sos_events` (id, userId, tripId, reason, lat, lon, createdAt, smsStatus jsonb, resolvedAt).
  - `packages/api/src/routers/safety.ts` (new): `startTrip` (returns token), `pingTrip({token, lat, lon, speed, heading})` (privacy zones enforced on device before sending), `endTrip`, `trigger({reason, lat, lon, tripToken?})`, `resolve({eventId})` (sends "I'm OK" follow-up SMS), `contacts.list/add/update/remove` (replaces `rides.addSos/sosList`; keep old names as aliases one release).
  - `packages/api/src/lib/sms.ts` (new): provider interface `sendSms(to[], text)` with the chosen gateway (D3); E.164 normalization for LK numbers (`07x` → `+947x`); per-user rate limit (§ rate limiting).
  - Public live page `apps/web/src/app/t/[token]/page.tsx`: polls `safety.tripByToken` every 10 s, shows last position, speed, time since update, "call rider", emergency numbers; token unguessable (128-bit), expires 24 h after trip end; no account needed.
- Contacts UI: native `app/(drawer)/safety.tsx` (new): contact list (HeroUI `ListGroup`), add/edit form (`TextField`), test SMS button, crash sensitivity slider, "test the countdown" button; web `dashboard/safety` equivalent.
- SMS text (all three languages, sent in each contact's `lang`): "Roto SOS: {name} may have crashed near {place}. Live location: {url}. Call 1990 for an ambulance."

### 4.13 Live group (target: Cardo groups + ESR private live map + calimoto synced route)

- `packages/api/src/routers/groups.ts`: `create({name, routeId?})`, `join`, `leave`, `mine` (used on app start to restore), `members` (adds speed, heading, stale flag), `setRoute`, `setRegroup({lat, lon})`, `end` (owner).
- Native:
  - Group state persisted in local `kv` so leaving the screen or restarting keeps the session.
  - Broadcast from the background location task whenever a group is active, recording or not (B11); suppressed inside privacy zones (already on device).
  - `components/group/group-sheet.tsx`: members list with distance behind/ahead along the shared route, stale badge, "navigate to regroup point", share code via RN `Share`.
  - Shared route: joining a group with `routeId` loads the route into the navigator.
- Web: `apps/web/src/app/g/[code]/page.tsx` (signed-in members only) live map for pillion/support crew.
- Polling unchanged (A4).

### 4.14 POI fuel / EV / moto / food / hotel / camp (target: Scenic POI set + LK brands)

- Data pipeline (A3): `tiles/scripts/extract-pois.sh`: `osmium tags-filter sri-lanka-latest.osm.pbf n/amenity=fuel,charging_station,hospital,police,restaurant,cafe n/tourism=hotel,guest_house,camp_site n/shop=motorcycle,motorcycle_repair n/highway=speed_camera r/type=enforcement -o pois.osm.pbf` then `osmium export -f geojsonseq`.
- `packages/db/src/seed/import-osm-pois.ts` (new): upsert by `osmId` into `pois` with `source='osm'`, brand, tags subset in `meta`; keeps `source='seed'|'user'` rows.
- `packages/db/src/schema/rides.ts` → move POIs to `packages/db/src/schema/pois.ts`: add `osmId text unique`, `brand`, `source`, `verified boolean`, `updatedAt`, `geom`, `phone`, `hours`; extend `kind` set: `fuel, ev, dealer, service, spares, hospital, police, food, hotel, camp, speed_camera, viewpoint`.
- `packages/api/src/routers/pois.ts` (new, `rides.pois` kept as alias): `list({kinds[], bbox, near, alongRoute?: {coords, bufferM}})` using `ST_DWithin`/`ST_Intersects`; `get`; `suggestEdit` (goes to moderation).
- Along-route search: "fuel in the next 30 km" in native navigation and web planner.
- Cron: `vercel.json` daily cron `/api/cron/osm-refresh` is not realistic on Vercel (osmium binary); instead a GitHub Action or the Valhalla VPS runs the extract nightly and calls a protected `POST /internal/pois/import`. **Decision D7**.
- Map rendering: native `Layer` symbol with per-kind Ionicons sprite images; web symbol layer with Lucide-derived sprite. OSM attribution already shown.

### 4.15 Weather / traffic / hazards (target: REVER radar + Motobit hazards free + Scenic closures/elevation/dirt)

Weather:
- `apps/native/lib/weather.ts`: `routeForecast(coords, departAt)` samples a point every ~15 km, one Open-Meteo call with comma-separated lat/lon, `hourly=precipitation_probability,precipitation,weather_code,wind_gusts_10m`, `timezone=Asia/Colombo`; maps to ETA per sample. `currentAt(lat, lon)` uses the rider's fix (B10), refreshed every 15 min while riding.
- Alerts: "Storm ahead" when `weather_code ≥ 95` or precipitation probability ≥ 70% on the next 30 km; spoken once per 30 min.
- Web planner `plan/_components/weather-strip.tsx`: forecast along the route for a chosen departure time.
- Radar: optional RainViewer overlay labeled "estimated rain" only if its coverage mask shows LK tiles (check at build); **Decision D8**.
- Official warnings: link to Department of Meteorology bulletins (no API).

Traffic: none available (§1.2). Shown as a documented absence; substitute hazards + closures.

Hazards (Motobit-style, LK flavored):
- `packages/db/src/schema/hazards.ts` (new): `hazards` (id, kind, lat, lon, geom, heading?, note, reporterId, createdAt, expiresAt, confirmations int, dismissals int, status), `hazard_votes` (hazardId, userId, vote, PK). Kinds: `pothole, gravel, oil, flood, landslide, animal_dog, animal_elephant, animal_cattle, checkpoint, speed_trap, accident, roadworks, closure, bus_stop_danger, fallen_tree`. Default expiry per kind (checkpoint 3 h, flood 24 h, pothole 30 days, elephant corridor permanent-seasonal).
- `packages/api/src/routers/hazards.ts`: `report` (rate limited), `near`, `alongRoute`, `vote` (confirm/gone; auto-expire at dismissals ≥ 3), `moderate`.
- Native: one-tap report sheet with big kind buttons (glove-friendly, Ionicons), voice warning 300 m ahead on route ("Elephant crossing reported ahead"), map layer.
- `rides.reportPoi` with `kind: 'hazard'` migrates to `hazards` (migration copies existing rows).

Cameras: OSM `highway=speed_camera` imported as POIs (§4.14) + user `speed_trap` hazards; optional voice alert.

Closures: `packages/db/src/schema/closures.ts` (new): (id, geom LineString/Point, reason, startsAt, endsAt, source `osm|user|holiday`, note). Import from OSM `highway=construction` and `*:conditional` tags during POI extract; user `closure` hazards promote after confirmations; holiday closures (Esala Perahera, Kandy; Vesak zones) from §5.2. Passed to Valhalla as `exclude_polygons` (buffered) when active.

Speed limits: from `route.attributes` (`edge.speed_limit`); native HUD badge; overspeed chime optional; web planner speed-limit strip. Where OSM lacks `maxspeed`, show nothing (no invented defaults) until §5.2 LK defaults are verified.

Elevation + dirt: elevation profile (§4.8, §4.10); surface overlay from `edge.unpaved`/`edge.surface` colored segments (web planner and native route preview).

### 4.16 Community / challenges (target: REVER communities + ESR points/boards + Scenic social page)

- Clubs and brand owner groups: better-auth `organization` plugin (`packages/auth/src/index.ts` add `organization({ teams: { enabled: true } })`; web and native clients add `organizationClient()`). Run `npx auth generate --adapter drizzle`, merge into `packages/db/src/schema/auth.ts`, then `db:generate`. Organization `metadata.kind = 'club' | 'brand'`, `metadata.brand` for brand groups.
- `packages/db/src/schema/community.ts`: `posts` (id, userId, orgId?, body, rideId?, routeId?, photoUrl?, createdAt, visibility), `post_comments`, `post_reactions` (PK postId+userId), `follows` (followerId, followeeId, PK), `badges` (userId, key, awardedAt).
- `packages/api/src/routers/community.ts`: `feed({scope: 'following'|'club'|'nearby', cursor})`, `post`, `comment`, `react`, `follow`, `profile({userId|username})`.
- Challenges (replace the derived-only approach noted in `schema/events.ts:4`): `packages/db/src/schema/challenges.ts` `challenges` (id, slug, name en/si/ta, kind `distance|route|checkin|streak`, target, startsAt, endsAt, orgId?), `challenge_progress` (derived on ride sync, PK challengeId+userId), `checkins` (userId, poiId|routeId, at, lat, lon). Points = km + route completions + check-ins; monthly 500 km stays as a seeded challenge.
- `packages/api/src/routers/challenges.ts`: `list`, `join`, `leaderboard({challengeId})` (by user id; B7), `checkin` (must be within 200 m of POI, from a recorded fix).
- Public rider page `apps/web/src/app/u/[username]/page.tsx` (better-auth `username` plugin) with public rides, badges; respects visibility and hide-max-speed.
- Native: Rides tab gets Feed / Challenges / Clubs segments (HeroUI `Tabs`).
- Moderation (§4.17 privacy) covers posts and comments.
- Strava / Health sync, GoPro, prizes: out of scope for FOSS v1 (Strava API needs app review and ToS acceptance). **Decision D9.**

### 4.17 Privacy (target: REVER zones/hide max/pause + ESR private-by-default + GDPR)

- Multiple named zones: `privacy.add({name, lat, lon, radiusM})`, `update`, keep `setHome` as a shortcut; native zone editor on a map (`app/(drawer)/privacy.tsx`) with radius slider; web `dashboard/privacy`.
- Private by default: `rides.visibility` default `private`; sharing asks explicitly.
- Hide max speed: per ride and a global default (user settings table or better-auth `additionalFields`).
- Auto-pause: §4.10.
- Optional mid-ride masking (`core/privacy.maskInside`) as a setting.
- GDPR: `privacy.exportMine` (zip-free JSON + GPX files via Blob, link emailed/downloaded), `privacy.deleteAccount` (better-auth `deleteUser` + cascade; blob cleanup job).
- Moderation: `packages/db/src/schema/moderation.ts` `reports` (polymorphic target, status, reviewer), `packages/api/src/routers/moderation.ts` (`report`, `queue`, `resolve`) gated by better-auth `admin` plugin role; web `apps/web/src/app/admin/reports/page.tsx`.
- Rate limiting: `apps/server/src/lib/rate-limit.ts` Postgres-backed `Store` for `hono-rate-limiter` (table `rate_limits(key, hits, resetAt)`), applied to hazard reports, SMS triggers, sign-up, uploads.

### 4.18 Glove / battery (target: Scenic glove + remotes, Beeline minimal)

- Glove mode setting: 56 pt minimum targets, larger HUD text, fewer controls on the Ride sheet; stored in `kv`.
- Handlebar remotes: `apps/native/modules/roto-media-keys/` local Expo module registering an Android `MediaSession` (and iOS `MPRemoteCommandCenter`) while navigating; maps play/pause → repeat last instruction, next → report hazard sheet, previous → toggle HUD, long-press (where the remote supports it) → manual SOS countdown (still cancellable). Volume keys via `react-native-volume-manager` only if media keys are insufficient.
- Battery: `expo-battery` auto-enables saver below 20% (user can override); saver lowers GPS accuracy and polling, turns off IMU lean, never turns off crash detection (the native module keeps its sensor at low rate).
- Keep-awake only in HUD/navigation.

### 4.19 Platform (target: iOS / Android / Web)

- Android: primary. iOS: same Expo app; background location and safety module iOS implementations included; CarPlay per D5.
- Web PWA: Serwist replaces `apps/web/public/sw.js` (precache shell, runtime cache planner tiles for viewed areas, offline page); verify Serwist support for Next 16.3 first (**Decision D10**). Remove the old template manifest.

---

## 5. "Beyond" items

### 5.1 Trilingual offline-first, low-data, battery-saver

- Shared strings in `@roto-app/core/i18n` (§3.2); every native hardcoded string moved (§3.5); web `[locale]` routing (A9) with `apps/web/src/i18n/*`, `middleware.ts` (next-intl) or a dictionary provider; language switcher in `components/header.tsx`.
- Voice: si/ta maneuver templates (§4.3), voice availability detection and download prompt (§3.5).
- Data in three languages: POI, curated, challenge, holiday, hazard kind names use `nameSi`/`nameTa` when present; add `name:si` and `name:ta` from OSM tags in the POI import.
- Low-data mode (setting): no weather radar, no photos auto-upload on mobile data (upload on Wi-Fi via `expo-network` type), smaller delta sync, text-only route previews.
- Offline packs per region (§4.4); battery saver (§4.18).
- Native-speaker review gate before store release (existing `ponytail:` in `i18n.ts:13`).

### 5.2 LK road reality

- Monsoon/weather: §4.15 route forecast; seasonal note on curated routes (`bestSeason`, SW monsoon May–Sep, NE monsoon Dec–Feb).
- Poya/holidays: `packages/db/src/schema/holidays.ts` (`date PK`, `nameEn/Si/Ta`, `kind poya|public|bank|mercantile`, `source`); seed from Calendarific (server key, once a year via daily-cron-with-year-check `/api/cron/holidays`) with `core/holidays.fullMoonsUtc` as offline cross-check; native caches the year. Planner and ride start show "Poya day: expect temple traffic and processions" and known perahera closures (`closures` rows with `source='holiday'`).
- Works/closures: §4.15.
- Hazards incl. elephants, dogs, buses, checkpoints: §4.15; seed known elephant corridors as permanent `animal_elephant` hazard zones (e.g. Habarana–Dambulla, Buttala–Kataragama, Udawalawe) after source verification.
- LK limits/cameras: OSM `maxspeed` via Valhalla; LK statutory default limits for motorcycles need a gazette source before any default is shown (**Decision D11**: who verifies). Cameras §4.14.
- Fuel prices: `packages/db/src/schema/fuel.ts` `fuel_prices` (fuelType `petrol92|petrol95|diesel|superDiesel|kerosene`, priceLkr, effectiveFrom, source, sourceUrl); admin-entered via `apps/web/src/app/admin/fuel/page.tsx` (Ceypetco revisions are monthly); `fuel.current` public procedure; shown on fuel POIs and home. Optional scraper later.
- EV charging for Revolt and others: `ev` POIs with socket types from OSM `socket:*`; filter by connector in POI list; EV range note in planner (user's bike profile, §5.3).
- Expressway ban enforced in routing (§1.2, §3.3).

### 5.3 New-rider / new-brand layer

- Learner theory: `packages/core/src/learn/` content modules (road signs, rules, riding skills) as JSON per language with a quiz bank; native `app/(drawer)/learn/index.tsx`, `learn/[module].tsx`, `learn/quiz.tsx`; progress in local DB; web `/learn`. Content source and licensing is **Decision D12** (DMT handbook material may be copyrighted; write our own).
- Service / spares / dealer directory: `pois` kinds `dealer|service|spares` with `brand`; brand list constant `packages/core/src/brands.ts` (Bajaj, Hero, Honda, Yamaha, TVS, KTM, Voge, Zonsen, Lifan, Haojue, Suzuki, Revolt, Demak); native `app/(drawer)/dealers.tsx` with brand filter chips and "call"/"navigate"; web `/dealers`. Dealer self-service edits via moderation (better-auth `admin` role `dealer` scoped to their POIs).
- Per-brand owner groups: organizations with `kind='brand'` (§4.16), auto-suggested from the garage bike.
- Riyasewana link: "Find parts or bikes on Riyasewana" deep link built from brand/model (`https://riyasewana.com/search/motorcycles/<brand>/<model>`, verify URL pattern); no hosted marketplace (legal and moderation load). **Decision D13.**
- Insurance / registration help: static guides in `core/learn/guides/*` (revenue licence renewal, emission test, insurance renewal, ownership transfer at DMT) + reminders.
- Garage and reminders (new, supports the above): local `garage` table (brand, model, year, reg no. stored only on device, odometer), `reminders` (revenue licence, insurance, emission test, oil change every N km computed from synced ride km); `expo-notifications` scheduled local notifications; optional server backup in `packages/db/src/schema/garage.ts` if signed in.

### 5.4 SOS that works on LK networks

Covered in §4.12: phone-sensor detection with background native module, server SMS via LK gateway, SMS composer fallback offline, 119/1990 + family contacts, live trip link `/t/[token]`, privacy zones respected in pings. Additions:
- Contact language per contact (§3.1) so family gets Sinhala/Tamil text.
- "Check-in timer" (solo rides): set an expected arrival; if not ended in time + grace, prompt then alert contacts (same `sosFlow`).
- Low-signal behavior: SMS composer uses plain text under 160 chars in English + one local-language line; retries server trigger when data returns and marks `sos_events.smsStatus`.

### 5.5 LK community routes + GPX interop

- Expand `packages/db/src/seed/curated.lk.ts` to named LK classics with si/ta names and tags: Colombo–Galle coast, Kandy–Nuwara Eliya, Nuwara Eliya–Ella, Ella–Wellawaya, Ancient Cities loop (Anuradhapura–Mihintale–Polonnaruwa–Sigiriya–Dambulla), Kandy–Mahiyangana 18 bends, Haputale–Belihuloya, Knuckles (Kandy–Corbet's Gap), Deniyaya–Sinharaja, Arugam Bay coast, Jaffna peninsula loop, Horton Plains approach. Each generated with our Valhalla at `curvy: 0.8`, marked `verified: 'generated'` until ridden (existing ponytail rule).
- Community submissions: `curated.submit` from a saved route or ride → moderation → published.
- Twisty roads layer: batch job `packages/db/src/seed/curvature-ways.ts` (new) scores OSM ways (from the pbf via osmium export of `highway=primary|secondary|tertiary|unclassified`) with `core/curvature`; stores `road_curvature(osmWayId, name, score, geom)`; served as a martin vector layer `curvature` (styled ≥300 fun, ≥1000 best) on web and native; feeds curvy bias (§4.1).
- GPX interop: `core/gpx.toGpx` writes `<rte>` (planned) + `<trk>` (ridden) + `<wpt>` with names; tested by importing exports into REVER, Scenic and Kurviger (manual check list in `roto-app/DEVICE-TEST.md`).

---

## 6. Database migrations (in order)

| # | Name | Content |
|---|---|---|
| 0006 | `integrity_and_rides` | FKs (B16), PKs with dedupe (B6), ride fields (§3.1), sos contact fields, group/event fields |
| 0007 | `postgis` | `CREATE EXTENSION IF NOT EXISTS postgis;` (custom migration via `drizzle-kit generate --custom`), `extensionsFilters: ['postgis']` in `drizzle.config.ts` |
| 0008 | `geom_columns` | `geom` on pois, curated_routes, events, privacy_zones; backfill from lat/lon; GIST indexes |
| 0009 | `pois_expand` | pois fields (§4.14), move to `schema/pois.ts` |
| 0010 | `routes_folders` | saved_routes, route_folders |
| 0011 | `safety` | live_trips, sos_events |
| 0012 | `hazards_closures` | hazards, hazard_votes, closures; copy `pois.kind='hazard'` rows |
| 0013 | `ride_photos` | ride_photos |
| 0014 | `auth_plugins` | better-auth organization, admin, username tables/columns (generated) |
| 0015 | `community` | posts, post_comments, post_reactions, follows, badges, route_ratings |
| 0016 | `challenges` | challenges, challenge_progress, checkins; seed monthly 500 km |
| 0017 | `lk_data` | holidays, fuel_prices, road_curvature |
| 0018 | `moderation_ratelimit` | reports, rate_limits |
| 0019 | `garage` | garage (server backup, optional) |

Every migration is generated with `npm run db:generate`, reviewed, and applied with `npm run db:migrate` locally before the next.

---

## 7. New dependencies

| Package | Workspace | Why |
|---|---|---|
| `@tmcw/togeojson`, `@xmldom/xmldom`, `fflate` | core | GPX/KML/KMZ import |
| `expo-task-manager`, `expo-notifications`, `expo-battery`, `expo-image-picker`, `expo-sharing`, `expo-audio` | native | background location, SOS actions, saver, photos, share, voice ducking |
| `expo-keep-awake` (make explicit) | native | already transitive |
| `drizzle-orm` (+ `drizzle-kit` dev), `babel-plugin-inline-import` | native | local DB (A6) |
| `react-native-volume-manager` (only if needed) | native | volume-key fallback |
| `recharts` (via `shadcn add chart`) | ui | charts |
| `@react-pdf/renderer` | web | PDF |
| `next-intl` (D4) | web | i18n routing |
| `@serwist/next`, `serwist` (D10) | web | PWA |
| `@vercel/blob` | server | photos |
| `hono-rate-limiter` | server | rate limits |

After every `npm install`: `node scripts/patch-varlock-windows.mjs` (AGENTS.md). Keep React/Expo pins identical.

New env (each app's `.env.schema`, then `npm run env:generate`): server `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_ID`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, `CALENDARIFIC_API_KEY`, `PUBLIC_WEB_URL` (for live links); web `NEXT_PUBLIC_DEM_URL`, `NEXT_PUBLIC_STYLE_DAY_URL`; native `EXPO_PUBLIC_WEB_URL`.

---

## 8. Phases

Order is by dependency and rider safety, not by matrix order.

**Phase 0 — Foundation (§3).** B1–B16, core package, routing rewrite, Valhalla admin/tz/elevation build, style LAN fix, shared lang context, local DB, SOS contacts UI. Exit: `check-types` green; curvy visibly changes routes (compare `use_trails` 0 vs 0.4 on Kandy–Nuwara Eliya); no route uses an expressway; contacts can be added.

**Phase 1 — Safety and navigation (§4.12, §4.3, §4.10 background recording, §4.4 auto-sync, §5.4).** roto-safety module, countdown, server SMS, live trip page, navigation engine with reroute and si/ta voice, background recording, auto-pause, keep-awake. Exit: device test on a real Android with screen off (crash simulation by drop test onto a cushion with the "test mode" threshold), reroute triggered by leaving the route, SMS received with working live link.

**Phase 2 — Planning and LK data (§4.1, §4.2, §4.6, §4.7, §4.8, §4.9, §4.14, §4.15, §5.2).** Planner rebuild, imports, saved routes/folders/share/PDF/OG, styles/terrain/flyover, POI import, hazards, closures, holidays, fuel prices, weather along route, speed limits and surface.

**Phase 3 — Tracking and community (§4.10 rest, §4.11, §4.13, §4.16, §4.17, §5.5).** Ride detail, photos, replay, lean graphs, corner assistant, heatmap, groups upgrade, feed, clubs/brand groups, challenges/check-ins, profiles, moderation, GDPR, curated expansion, twisty roads layer.

**Phase 4 — New-rider layer and web i18n (§5.1, §5.3).** Learner, dealers, garage/reminders, Riyasewana link, guides, web locale routing, low-data mode.

**Phase 5 — Platform (§4.5, §4.18 remotes, §4.19 PWA).** Android Auto module, media keys module, Serwist PWA, CarPlay spike per D5.

---

## 9. Verification

There is no test framework today. Recommendation (**Decision D14**): add Vitest to `packages/core` and `packages/api/src/lib` only (pure functions: geo, curvature, navigator state machine, importers, maneuver text, SMS number normalization, loop generation). UI stays verified by running the app, as now.

Per phase:
- `npm run check-types` (7 turbo tasks) green.
- `node scripts/capture.mjs` visual QA on changed web routes, light and dark, desktop and mobile.
- Valhalla smoke script `tiles/scripts/smoke.mjs` (new): `/status` has admins/timezones/elevation; Colombo → Kandy avoids E01/E03; `elevation_interval` returns data; `trace_attributes` returns `speed_limit` somewhere in LK.
- Device checklist additions to `roto-app/DEVICE-TEST.md`: background recording 30 min screen off; crash test mode; offline pack + airplane-mode ride + auto-sync; reroute; si/ta voice on a phone with and without voice packs; group of 2 phones; Android Auto on the Desktop Head Unit emulator.
- Invariant checks every phase: crash watch and SOS never gated (grep for any condition around `sosFlow`/module start), privacy trimming before every network send of coordinates (sync, live group, live trip, share), every new rider-facing string in en/si/ta, signal yellow ≤ 10%, attribution on every map.

---

## 10. Decisions to make together

### Decided (2026-09-27)

| ID | Outcome | Plan impact |
|---|---|---|
| D1 | Local Docker Valhalla for now, no hosted instance | Dev and device testing use `tiles/docker-compose.yml` Valhalla at the laptop's LAN IP. Prod on Vercel keeps `VALHALLA_URL` unset and runs on BRouter/OSRM, so every feature that needs Valhalla must read `RouteResult.capabilities` and degrade (no reroute-with-heading, no speed limits, no surface, no server map matching, Open-Meteo elevation). `tiles/docker-compose.prod.yml` is dropped from Phase 0. Revisit before a public launch. |
| D5 | No CarPlay; Android Auto only | §4.5 CarPlay spike removed; `context/carplay-spike.md` not created. |
| D12 | Five learner modules to start | §5.3 ships exactly five modules: (1) Road signs, (2) Right of way, lanes and overtaking, (3) Riding with buses, three-wheelers and animals, (4) Riding in rain and monsoon, (5) Licence, revenue licence and documents. Each en/si/ta with a 10-question quiz. Native-speaker review still required. |
| D14 | Vitest for pure logic in `packages/core` and `packages/api/src/lib` | Add `vitest` dev dependency and `test` scripts to those two workspaces plus a turbo `test` task. |
| D15 | Native modules are Android-only (Kotlin); iOS skipped | `roto-safety`, `roto-car`, `roto-media-keys` get no `ios/` folder. On iOS the app uses the JS foreground crash watch in `lib/safety.ts`, heads-up notification instead of full-screen alert, no remotes. `app.json` iOS background-location config stays so iOS recording still works. |
| D16 | App ID `lk.roto.app` | Phase 0: `apps/native/app.json` `android.package` and `ios.bundleIdentifier` → `lk.roto.app`; scheme stays `roto-app`; `packages/auth/src/index.ts` trusted origins unchanged. Reinstall the dev client after this change. |
| D17 | Build everything first, device-test at the end | Phases 0–5 run back to back. Per-phase gate becomes: `check-types` green, Vitest green, web visual QA with `scripts/capture.mjs`, Valhalla smoke script. All device checks in §9 move to one final test pass on the Samsung S24 Ultra (One UI, Android 14+) and the Android Auto Desktop Head Unit. Risk: native bugs surface late; mitigated by keeping each native module behind a JS fallback so the app still runs if a module fails. |

| D3 | Free alert channels now, SMS gateway when sponsored | Crash/SOS alerts go out on three free channels: (1) push notification to contacts who have Roto and an account (`expo-notifications` Expo push tokens; new table `push_tokens(userId, token, platform, updatedAt)`; contacts link to Roto users by phone or email via `sos_contacts.linkedUserId`), (2) email via a free-tier provider (`packages/api/src/lib/email.ts`, Resend; env `EMAIL_API_KEY`, `EMAIL_FROM`), (3) prefilled SMS composer + `tel:119`/`tel:1990` on the phone. `packages/api/src/lib/sms.ts` is built as a provider interface with a `none` provider by default; setting `SMS_PROVIDER` + key enables a paid gateway later with no other code change. `sos_events.channels jsonb` records what was sent. |
| D12 | Five learner modules confirmed | As listed above. |

Test hardware and toolchain: Samsung S24 Ultra; JDK 17 installed; `ANDROID_HOME` set to `C:\Users\induwara\AppData\Local\Android\Sdk` and `platform-tools` added to the user PATH (done 2026-09-27). Android Auto Desktop Head Unit v2.0 installed at `%ANDROID_HOME%\extras\google\auto\desktop-head-unit.exe`. Samsung note: One UI battery optimization kills background services; the final test pass sets Roto to "Unrestricted" battery use and the app shows that guidance on first ride.

### Open

| ID | Decision | Recommendation |
|---|---|---|
| D1 | ~~Host Valhalla in prod~~ | Decided: local Docker (above) |
| D2 | Prod Postgres provider with PostGIS | Whichever is in use; confirm it permits `CREATE EXTENSION postgis` |
| D4 | Web i18n | next-intl for public pages, shared dictionary |
| D5 | ~~CarPlay~~ | Decided: Android Auto only |
| D6 | Satellite imagery | Skip unless a CC-BY source is confirmed |
| D7 | Where the OSM extract job runs | On the Valhalla VPS nightly |
| D8 | RainViewer overlay | Only if LK coverage is real; label "estimated" |
| D9 | Strava/Health/GoPro sync | Out of v1 |
| D10 | Serwist for PWA | Adopt after a Next 16.3 build test |
| D11 | LK default speed limits | Show OSM data only until a gazette source is verified |
| D12 | ~~Learner content~~ | Decided: five modules |
| D13 | Marketplace | Link out to Riyasewana, no hosted listings |
| D14 | ~~Tests~~ | Decided: Vitest |
| D15 | ~~Native module work~~ | Decided: Android-only Kotlin modules |
| D3 | ~~SMS~~ | Decided below |
