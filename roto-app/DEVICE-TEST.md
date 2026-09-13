# Device test — Roto Ride tab (one page)

Needs real hardware. Emulator can't prove GPS, SMS, or offline packs. MapLibre needs a
dev build — Expo Go will NOT work.

## 0. Prereqs

- Android phone + laptop on the SAME WiFi. Laptop IP below = `LAN` (e.g. 192.168.1.20).
- Docker running. Node 22, npm 12+.

## 1. Start infra (laptop)

```bash
cd roto-app/tiles && docker compose up -d    # postgres :54322, martin :3005, valhalla :8002
curl -s localhost:3005/catalog | head -c 100  # expect sri-lanka source
curl -s localhost:3006/style.json | head -c 60 # expect {"version":8...
docker exec tiles-postgres-1 psql -U postgres -tc "SELECT count(*) FROM pois;"  # expect 10
```
First DB setup ever (empty volume): `cd ../packages/db && DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npx drizzle-kit migrate && DATABASE_URL=... npx tsx src/seed/seed.ts`.
If a container ever loses its port mapping after a conflict: `docker compose up -d --force-recreate <service>`.

## 2. Point the app at your LAN (not localhost — phone isn't your laptop)

`apps/native/.env`:
```
EXPO_PUBLIC_SERVER_URL=http://LAN:3000
EXPO_PUBLIC_TILE_URL=http://LAN:3006/style.json
```
`apps/server/.env` already has `VALHALLA_URL=http://localhost:8002/route` (server-side, stays localhost).

## 3. Run both ends (two terminals, repo root `roto-app/`)

```bash
npm run dev:server   # :3000 — if EADDRINUSE, a stale server squats :3000: python3 /tmp/opencode/freeport.py
```
```bash
cd apps/native && npx expo run:android   # dev build, ~5-10 min first time
```

## 4. On the phone — Ride tab, expect:

| # | Do | Expect (all verified server-side) |
|---|----|-----------------------------------|
| 1 | Open Ride | OSM Colombo map + 10 POI dots/labels (dealers, fuel, EV, hospital, 119) |
| 2 | OFFLINE CMB | Pack downloads; then airplane mode → map still renders Colombo |
| 3 | START RIDE, walk/ride 200m | Live km counter climbs; STOP → "Sync queued rides" clears it |
| 4 | Server log / DB | New row in `rides`; queue empty |
| 5 | SOS 119 | SMS composer to saved contacts, else direct dial 119 + voice alert |
| 6 | Labels | Sinhala/Tamil place names render (local glyphs, no tofu) |

Reference numbers: Colombo test route = valhalla 13.8km/529pts; Colombo→Kandy = 114.5km/106min; BRouter fallback = same route via trekking profile.

## 5. If it fails

- Blank map → `TILE_URL` still localhost, or style :3006 down. `adb reverse` is NOT a substitute; use LAN.
- No POIs → server :3000 down or phone on mobile data, not WiFi.
- Route 400s → client/server tRPC mismatch; `npm run check-types` must be 7/7.
- `:3000` busy after killed shell → stale node holds it (known trap): `python3 /tmp/opencode/freeport.py`.
