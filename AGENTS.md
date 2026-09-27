# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Roto is a free, offline-first, trilingual (en/si/ta) motorcycle app for Sri Lanka. The repo root holds product and design docs. All code lives in `roto-app/`, a Better-T-Stack monorepo (npm workspaces + Turborepo).

- `PRODUCT.md`: users, principles, hard constraints. `DESIGN.md`: the "night highway" visual system and its named rules. Read both before UI work.
- `context/architecture.md`: running log of what is wired and verified. `context/about.md`: why the app exists.
- `roto-app/DEPLOY.md` (Vercel), `roto-app/DEVICE-TEST.md` (real-phone test), `roto-app/tiles/README.md` (tiles and Valhalla builds).

An earlier agent wrote some of these docs on Linux. Commands they cite, such as `python3 /tmp/opencode/freeport.py`, don't exist on this machine.

## Commands

Run everything from `roto-app/`. There is no test framework. Verification means type-checking and running the app.

```bash
npm run dev             # all apps: web :3001, server :3000, native Metro
npm run dev:web         # also dev:server, dev:native
npm run check-types     # tsc --noEmit, 7 turbo tasks, ~1.5 min uncached; the main gate
npm run build           # web: next build; server: tsdown -> dist/index.mjs
npm run db:generate     # schema -> new SQL in packages/db/src/migrations
npm run db:migrate      # apply migrations (db:push and db:studio also exist)
npm run env:generate    # regenerate src/env.ts after editing any .env.schema
```

- One workspace: `npx turbo run check-types -F @roto-app/api`. Workspace names are `web`, `server`, `native`, `@roto-app/{api,auth,db,ui,config}`.
- Native needs a dev build. MapLibre is new-architecture only, so Expo Go does not work: `cd apps/native && npx expo run:android`.
- Local infra: `cd tiles && docker compose up -d` starts PostGIS (:54322), martin vector tiles (:3005) and Valhalla (:8002). The style, glyph and sprite server is separate: `node tiles/serve-style.mjs` (:3006, sends CORS headers). `tiles/data/`, `tiles/fonts/` and the Valhalla tiles are gitignored. Rebuild them per `tiles/README.md`.
- Seeds are one-shot scripts. They skip if rows exist and read `DATABASE_URL` from the shell, not from `.env`. Run them from `packages/db`: `npx tsx src/seed/seed.ts` (10 POIs) and `npx tsx src/seed/curated.ts` (5 curated routes, also needs `VALHALLA_URL`).
- Visual QA: `node scripts/capture.mjs [--route /plan] [--theme dark] [--slice 1100] [--audit]` screenshots web routes in light/dark at desktop and mobile widths, using the system Chrome. It defaults to port 3000, so set `VISUAL_QA_BASE=http://localhost:3001` for the web app. Output goes to `.visual-qa/`, which is not gitignored.

### Windows gotchas

- After every `npm install`, run `node scripts/patch-varlock-windows.mjs`. Without the patch, varlock's subprocess fails with `EBUSY`, and the server, the web app and drizzle-kit all die at env load. The patch is idempotent.
- Stale node processes keep :3000 after a shell ends (`EADDRINUSE`). Find the owner with `Get-NetTCPConnection -LocalPort 3000 -State Listen` and stop that PID.
- `npm run check` is `biome check --write .` and rewrites files in place. `biome.json` asks for tabs, but the code was never formatted with it (about 145 of 154 files would change) and is 2-space indented. Don't run it repo-wide unless a mass reformat is the goal. Match the surrounding style by hand.

## Architecture

### API surface

- `packages/api` holds every tRPC router. `routers/index.ts` builds `appRouter` from `route`, `rides`, `groups`, `curated`, `events` and `privacy`. `publicProcedure` and `protectedProcedure` live in `src/index.ts`. The context is `{ db, session, auth: null }`.
- `apps/server` is Hono. It mounts tRPC at `/trpc/*` with `@trpc/server/adapters/fetch`. Don't switch to `@hono/trpc-server`: v0.4.2 speaks the v10 protocol and breaks v11 client inputs. better-auth is mounted at `/api/auth/*`. `GET /` returns `OK`.
- There is no transformer (no superjson). Batch inputs are raw JSON, for example `/trpc/rides.pois?batch=1&input={"0":{}}`, and `Date` values arrive at clients as strings.
- Prod runs as Vercel Services (`vercel.json`). `/api/*` goes to the server, and a route transform strips the `/api` prefix from every path except `/api/auth/*`. That is why the mounts are asymmetric: auth sits at `/api/auth` everywhere, and tRPC sits at `/trpc` (public path `/api/trpc`). Web builds with `NEXT_PUBLIC_SERVER_URL=/api`.
- Clients: the web app uses `src/utils/trpc.ts` and `src/lib/auth-client.ts`, which resolve a relative server URL. The native app (`utils/trpc.ts`) sends the better-auth cookie by hand (`authClient.getCookie()`, `credentials: "omit"`).

### Packages and env

- Workspace packages export TypeScript source through `exports` maps and have no build step. Import deep paths such as `@roto-app/db/schema/rides` or `@roto-app/api/lib/routing`. The server bundle inlines `@roto-app/*` (tsdown `alwaysBundle`).
- `packages/db` (`createDb(env)`) and `packages/auth` (`createAuth(env, db)`) receive config from the app. Only `apps/server/src/services.ts` creates them.
- Env uses Varlock. Each app commits a `.env.schema`. `src/env.ts` is generated (gitignored) on postinstall or by `npm run env:generate`. Import `ENV` from it.
  - `packages/db/.env.schema` imports `DATABASE_*` from `apps/server/`, so the DB URL lives in `apps/server/.env`.
  - The server also calls `process.loadEnvFile()` for infra URLs that varlock leaves empty. Read those values, such as `VALHALLA_URL`, from `process.env` at call time, never at module init.
  - Web client code must prefer the inlined `process.env.NEXT_PUBLIC_*` literal, because the `ENV` proxy is not always hydrated in the client bundle.
  - Native `EXPO_PUBLIC_*` values are baked in at build time (EAS reads the `env` block in `eas.json`). A phone needs the laptop's LAN IP, never `localhost`.

### Routing and geodata

- `planRoute` (`packages/api/src/lib/routing.ts`) tries three engines in order. First is self-hosted Valhalla (motorcycle costing, maneuver steps), used only when `VALHALLA_URL` is set. Next is public BRouter (trekking profile, no steps). Last is the OSRM demo server. A failure falls through silently. `VALHALLA_URL` is unset in prod on purpose.
- `curvy` (0 to 1) maps to Valhalla `use_hills` and `use_primary`. Round trips come from circle-bearing waypoints (`roundTripPoints`).
- Geometry is `[lon, lat][]` (GeoJSON order) everywhere. API inputs are `{ lat, lon }` objects. Keep the two apart.
- Drizzle schema is in `packages/db/src/schema/*`. Coordinates are plain `real` lat/lon columns. No migration enables PostGIS, even though a schema comment says one does; the local `postgis` image provides the extension. Ride GPX is text in `rides.gpx`. Curated route geometry is jsonb.
- Live group positions are DB rows, so multi-instance deploys agree. Clients poll every 5 s (30 s in battery saver), and the server drops positions older than 120 s.

### Native app (`apps/native`)

- Stack: Expo SDK 57, expo-router (typed routes, React Compiler), Uniwind (Tailwind for RN) and HeroUI Native.
- Routes: the drawer home `app/(drawer)/index.tsx` handles account and stats. The tabs are Home (`(tabs)/index.tsx`), Ride (`(tabs)/map.tsx`, which holds most feature logic: recording, HUD, SOS, groups, offline packs, weather, GPX import) and Rides (`(tabs)/two.tsx`: events, leaderboard, privacy zones).
- `lib/` holds the feature logic:
  - `ride-recorder.ts`: GPS, DeviceMotion lean peak, crash watch.
  - `ride-queue.ts`: offline ride queue in expo-sqlite.
  - `safety.ts`: crash detection at 4 g or more, SMS with a `tel:119` fallback.
  - `privacy.ts`: trims start and end points inside privacy zones, on the device.
  - `maps.ts`: `MAP_STYLE` and the four LK offline-pack regions.
  - `i18n.ts`: en/si/ta strings plus si-LK/ta-LK voice.
- Theme: web tokens are in `packages/ui/src/styles/globals.css` (`.dark` is the Roto identity). Native can't read CSS variables, so the `ROTO` consts in `apps/native/lib/roto-theme.ts` mirror those tokens. Change both together.

### Web app (`apps/web`)

- The web app runs Next.js 16, and its APIs differ from training data. Read `roto-app/node_modules/next/dist/docs/` before writing Next code. `apps/web/AGENTS.md` says the same; `next dev` rewrites that file, so commit it as is.
- shadcn primitives live in `packages/ui`: `import { Button } from "@roto-app/ui/components/button"`. Add new ones with `npx shadcn@latest add <name> -c packages/ui`.
- Pages: `/` (hero with live DB stats), `/plan` (maplibre-gl planner: curated presets with a static fallback, GPX import and export), `/dashboard`, `/login`.

### Version pins

Expo SDK 57, RN 0.86.3, React 19.2.3 and `@types/react ~19.2.18` are pinned across web, ui and native. Keep them identical, or `check-types` fails on duplicate React types.

## Invariants from PRODUCT.md and DESIGN.md

- Never gate crash watch or SOS behind battery saver, login or any other mode.
- Privacy-zone start and end points never leave the phone. Trim before sync or export, and never broadcast live positions from inside a zone.
- Every rider-facing string needs en, si and ta versions (native: `lib/i18n.ts`). The si/ta text needs native-speaker review before a store release.
- Signal yellow `#FFB300` is the only accent (10% of a screen or less), and text on it is `#1A1200`. Use Ionicons on native and Lucide on web, never emoji as icons. Show OSM/OpenMapTiles attribution on every map.

## Conventions

- A `// ponytail:` comment records why a choice is deliberately minimal and when to upgrade it. Read it before "improving" that code, and use the same tag for new decisions of that kind.
