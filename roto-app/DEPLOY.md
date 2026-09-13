# Prod deploy — Vercel (web + API)

`vercel.json` already splits services: `/api/*` → Hono server, everything else → Next.js.
Web builds with `NEXT_PUBLIC_SERVER_URL=/api` (same-origin, no CORS pain).

## 0. Hosted Postgres (do this first — prod has no localhost)

Any Postgres 16 + PostGIS works (Supabase, Neon + `postgis` ext, etc.). Then from `roto-app/packages/db`:

```bash
DATABASE_URL="<prod-url>" npx drizzle-kit migrate
DATABASE_URL="<prod-url>" npx tsx src/seed/seed.ts
```

## 1. Env (Vercel dashboard → both services unless noted)

| Var | Service | Value |
|---|---|---|
| `DATABASE_URL` | server | prod Postgres URL |
| `BETTER_AUTH_SECRET` | server | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | server | `https://YOUR-APP.vercel.app/api/auth` |
| `CORS_ORIGIN` | server | `https://YOUR-APP.vercel.app` |
| `VALHALLA_URL` | — | LEAVE UNSET. Absence is the design: routing falls back Valhalla→BRouter→OSRM (proven live). Set only when a hosted Valhalla exists. |

## 2. Ship

```bash
npm run deploy:setup        # vercel link (once)
npm run env:production      # sync env before first deploy
npm run deploy:prod         # ship it
```

## 3. Verify prod (replace host)

- `GET /api/` → `OK`
- `GET /api/trpc/rides.pois?batch=1&input={"0":{}}` → 10 POIs  _(default transformer = identity: RAW input, no `{"json"}` envelope)_
- `/plan` → Colombo→Kandy plans via BRouter in prod (no Valhalla there)

Verified locally: server bundle boots (`dist/index.mjs` 378KB, `/` → OK, 0 errors),
web `next build` clean with `/plan`, `check-types: 7/7`.
