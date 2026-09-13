# Architecture — roto-app (LK FOSS moto)

Goal: free, open-source, offline-first motorcycle app for Sri Lanka. Speed + UI/UX first. See `about.md` for why.

## Monorepo (better-t-stack)

`roto-app/` — turborepo + npm workspaces. From `bts.jsonc` v3.43.0:
`next + native-uniwind | hono/node + trpc | postgres/drizzle + supabase(manual) | better-auth | turborepo,pwa,biome | vercel/vercel`.

- `apps/web` — Next.js 16 planner (port 3001), Tailwind, shadcn via `packages/ui`. `/plan` page: presets + curvy slider → tRPC `route.plan` → maplibre-gl line + GPX download (builds clean).
- `apps/native` — Expo 57 + expo-router, Uniwind, HeroUI native (dev builds only). `eas.json` (development/internal APK + preview + production; LAN IPs baked at build time). Ride tab: session banner → Home sign-in (SignIn/SignUp exist), SOS contacts load when logged in, sync/SOS degrade gracefully logged-out.
- `apps/server` — Hono + tRPC (port 3000) via `@trpc/server/adapters/fetch` (NOT @hono/trpc-server: v0.4.2 speaks v10 protocol, breaks v11 client inputs). Default transformer = identity: batch clients send RAW input, no `{"json"}` envelope. `process.loadEnvFile()` in index.ts for infra URLs varlock skips. Orphan servers squat on :3000 across shell calls — kill via `/tmp/opencode/freeport.py`, never `pkill -f` (matches own cmdline).
- `packages/api|auth|db|ui|config` — shared tRPC routers, better-auth, Drizzle schema, shadcn primitives
- Root: `turbo.json`, `biome.json`, `vercel.json`, `bts.jsonc`

## Mobile / maps

- Expo SDK 57 / RN 0.86.3 / React 19.2.3 pinned everywhere (web+ui+native). `@types/react ~19.2.18`. Fixes duplicate-React `check-types` failure.
- MapLibre `^11.3.10` (Native Android 13.2 / iOS 6.26, RN≥0.80, new-arch only). Plugin in `apps/native/app.json`. No Expo Go.
- `apps/native/lib/maps.ts` — `MAP_STYLE` from `EXPO_PUBLIC_TILE_URL` (self-hosted, demo fallback), `LK_REGIONS` [w,s,e,n]: colombo-metro, kandy-nuwara-eliya, ella, galle-coast, z10-16 via `OfflineManager.createPack`. `components/moto-map.tsx` — minimal `<Map>`. Tiles CDN-free: 119MB mbtiles (martin :3005) + style :3006, local glyphs (Noto Sans/Sinhala/Tamil × Reg/Bold, 8 layers patched) + local sprite.

## Data / auth

- Postgres via Supabase (manual mode) AND compose `postgis/postgis:16-3.4` (`tiles/docker-compose.yml`, vol `roto-pgdata`, :54322). Drizzle ORM. Tables live: rides/pois/sos_contacts + 10 POI seeds. PostGIS ext on.
- better-auth (not Supabase Auth). tRPC end-to-end types web+native.

## Workflows

- `npm install` (~1350 pkgs), `npm run check-types` (7 tasks must pass), `npm run dev` (web :3001, api :3000), native: set `EXPO_PUBLIC_SERVER_URL=http://<LAN-IP>:3000`, `expo run:android/ios` (prebuild for MapLibre).
- Template fixes applied: `ui/input.tsx`, `ui/input-group.tsx` → `ComponentProps<typeof InputPrimitive/Input>`.

## Wired (Sept 13, 2026, 7/7 check-types green)

1. Tiles: `roto-app/tiles/docker-compose.yml` (martin :3005 + valhalla :8002), `tiles/README.md`, `MAP_STYLE` from `EXPO_PUBLIC_TILE_URL` fallback demo, 4 LK offline packs z10-16
2. Routing: `packages/api/src/lib/routing.ts` — Valhalla self-host LIVE (:8002, 129MB LK tiles, polyline6 decoded) > BRouter public trekking (verified live) > OSRM demo; dead/missing Valhalla falls through (verified: bogus URL → brouter). `VALHALLA_URL` set locally, absent in prod by design. Curvy weighting + circle-bearings round-trip, tRPC `route.plan/roundTrip`, native GPX builder
3. Data: `packages/db/src/schema/rides.ts` (rides/pois/sos_contacts) + `migrations/0002_postgis.sql`, tRPC `rides.*`, native `lib/ride-queue.ts` (expo-sqlite pending_rides)
4. Safety/i18n/POI: `lib/safety.ts` (4g watch, SMS→119 fallback, 1990), `lib/i18n.ts` (en/si/ta + si-LK/ta-LK voice), `packages/db/src/seed/pois.lk.ts` (10 seeds)
5. Groups (polling v1, 5s): `ride_groups`/`group_members`/`live_positions` tables, tRPC `groups.*` (create/code/join/positions), Ride-tab SHARE/JOIN + blue member dots. Proven: 2 users → code → join → both visible. Positions in-DB (multi-instance safe); SSE only if polling measurably lags.
6. Prod: `vercel.json` split (web :3001→/, server→/api), `DEPLOY.md` env map, web+server builds green, `VALHALLA_URL` unset-by-design in prod.
7. Completion round: `planRoute` returns maneuver `steps` (valhalla 80/loop, osrm narrated, brouter none); native active-route line + 120m voice follow + LOOP/IMPORT/HAZARD + km/min/kmh + Open-Meteo widget with rain voice alert; web Loop + GPX import; `rides.reportPoi` (hazard kind). Proven: loop 107.5km/80 steps, hazard round-trips to DB.
8. Missing-four round: 5 curated Valhalla-generated LK routes (`curated.*` + ROUTES cycler + web presets hookup pending); events/RSVPs + derived monthly leaderboard + Rides tab (proven: RiderA 77.5km board, maxLean 28.5° stored); lean peak via DeviceMotion roll → `rides.max_lean_deg` → readout + sync; in-app Ride HUD (speed/arrow/instruction/distance). CarPlay NOT installed (react-native-carplay unmaintained for RN 0.86/new-arch; needs Apple entitlement + MFi + macOS build + car — HUD covers the glanceable value on any phone).
9. Final halves: privacy zones (`privacy_zones` + `privacy.*` setHome/list/remove; `trimEnds` masks start/end on GPX export + suppresses live broadcast inside zones; ⌂ HOME button + Rides-tab manager; proven: set→list→trim 5→3pts) + battery-saver (SecureStore-persisted toggle: Balanced/50m GPS, IMU off, 30s member poll; crash watch never gated).
10. UI/UX pass: OMT attribution on map (license), ROTO branding (drawer/tabs/home/web hero), theme-aware Ride tab, persisted en/si/ta switcher driving UI+voice (si/ta need native-speaker review), busy spinners + error toasts on all async buttons, SafeArea overlay, HUD SafeArea + translated exit.

## Next

- Device test: offline packs + trilingual labels + HUD + lean readout on real hardware (see `roto-app/DEVICE-TEST.md`)
- CarPlay/Android Auto (blocked: entitlement + MFi + macOS + car hardware; HUD is the interim)
- BRouter on-device (needs native Java + Android build env; public-API tier covers costing till then)
- Supabase Storage GPX/photos (DB stores GPX text today — fine to 100s of rides)
- `VALHALLA_URL` in Vercel only when a hosted Valhalla exists (fallback covers prod today)
