# Architecture — roto-app (LK FOSS moto)

Goal: free, open-source, offline-first motorcycle app for Sri Lanka. Speed + UI/UX first. See `about.md` for why.

## Monorepo (better-t-stack)

`roto-app/` — turborepo + npm workspaces. From `bts.jsonc` v3.43.0:
`next + native-uniwind | hono/node + trpc | postgres/drizzle + supabase(manual) | better-auth | turborepo,pwa,biome | vercel/vercel`.

- `apps/web` — Next.js 16 planner (port 3001), Tailwind, shadcn via `packages/ui`
- `apps/native` — Expo 57 + expo-router, Uniwind, HeroUI native (dev builds only)
- `apps/server` — Hono + tRPC (port 3000)
- `packages/api|auth|db|ui|config` — shared tRPC routers, better-auth, Drizzle schema, shadcn primitives
- Root: `turbo.json`, `biome.json`, `vercel.json`, `bts.jsonc`

## Mobile / maps

- Expo SDK 57 / RN 0.86.3 / React 19.2.3 pinned everywhere (web+ui+native). `@types/react ~19.2.18`. Fixes duplicate-React `check-types` failure.
- MapLibre `^11.3.10` (Native Android 13.2 / iOS 6.26, RN≥0.80, new-arch only). Plugin in `apps/native/app.json`. No Expo Go.
- `apps/native/lib/maps.ts` — `MAP_STYLE` from `EXPO_PUBLIC_TILE_URL` (self-hosted, demo fallback), `LK_REGIONS` [w,s,e,n]: colombo-metro, kandy-nuwara-eliya, ella, galle-coast, z10-16 via `OfflineManager.createPack`. `components/moto-map.tsx` — minimal `<Map>`. Tiles CDN-free: 119MB mbtiles (martin :3005) + style :3006, local glyphs (Noto Sans/Sinhala/Tamil × Reg/Bold, 8 layers patched) + local sprite.

## Data / auth

- Postgres via Supabase (manual mode: `supabase init/start` in `packages/db`, `DATABASE_URL` in `apps/server/.env`). Drizzle ORM. PostGIS / Realtime / Storage not wired yet.
- better-auth (not Supabase Auth). tRPC end-to-end types web+native.

## Workflows

- `npm install` (~1350 pkgs), `npm run check-types` (7 tasks must pass), `npm run dev` (web :3001, api :3000), native: set `EXPO_PUBLIC_SERVER_URL=http://<LAN-IP>:3000`, `expo run:android/ios` (prebuild for MapLibre).
- Template fixes applied: `ui/input.tsx`, `ui/input-group.tsx` → `ComponentProps<typeof InputPrimitive/Input>`.

## Wired (Sept 13, 2026, 7/7 check-types green)

1. Tiles: `roto-app/tiles/docker-compose.yml` (martin :3005 + valhalla :8002), `tiles/README.md`, `MAP_STYLE` from `EXPO_PUBLIC_TILE_URL` fallback demo, 4 LK offline packs z10-16
2. Routing: `packages/api/src/lib/routing.ts` — Valhalla self-host LIVE (:8002, 129MB LK tiles, polyline6 decoded) > BRouter public trekking (verified live) > OSRM demo; dead/missing Valhalla falls through (verified: bogus URL → brouter). `VALHALLA_URL` set locally, absent in prod by design. Curvy weighting + circle-bearings round-trip, tRPC `route.plan/roundTrip`, native GPX builder
3. Data: `packages/db/src/schema/rides.ts` (rides/pois/sos_contacts) + `migrations/0002_postgis.sql`, tRPC `rides.*`, native `lib/ride-queue.ts` (expo-sqlite pending_rides)
4. Safety/i18n/POI: `lib/safety.ts` (4g watch, SMS→119 fallback, 1990), `lib/i18n.ts` (en/si/ta + si-LK/ta-LK voice), `packages/db/src/seed/pois.lk.ts` (10 seeds)

## Next

- Device test: offline packs + trilingual labels on real hardware (emulator localhost ≠ device LAN)
- BRouter on-device (needs native Java + Android build env; public-API tier covers costing till then)
- Supabase Realtime group ride + Storage GPX/photos
- `VALHALLA_URL` in Vercel only when a hosted Valhalla exists (fallback covers prod today)
