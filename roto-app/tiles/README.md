# LK tiles

## What exists now
- `data/sri-lanka-latest.osm.pbf` (144MB, Geofabrik `asia/sri-lanka-260912`) - vector tile source data
- `valhalla/sri-lanka-latest.osm.pbf` (137.5MB, same extract) - routing graph source data (kept separate so a planetiler rebuild and a Valhalla rebuild never race on one file)
- `data/sri-lanka.mbtiles` (119MB, planetiler v0.10.2 OpenMapTiles profile, z0-14)
- `style.template.json` (OMT basic, 48 layers) with `{{TILE_HOST}}`/`{{STYLE_HOST}}` placeholders (B9) - `serve-style.mjs` renders it to `/style.json`
- martin on :3005 serves `sri-lanka` (verified: Colombo z14 tile 131KB, TileJSON bounds LK)
- style/sprite/fonts on :3006, served by `node serve-style.mjs` (see below)
- Valhalla on :8002, with admins/timezones/elevation built (see below)

## Rebuild the vector tiles
```
java -Xmx4g -jar planetiler.jar --osm-path=data/sri-lanka-latest.osm.pbf --output=data/sri-lanka.mbtiles --download --force
docker compose up -d martin
```

## Style, glyphs, sprites - self-hosted, LAN-aware (B9)
- `style.template.json` is the source of truth, not a static `style.json`. It has
  `{{TILE_HOST}}` (martin) and `{{STYLE_HOST}}` (this style server) placeholders instead
  of a hardcoded host, so a phone on the LAN gets working tile/glyph/sprite URLs without
  editing the file.
- `node serve-style.mjs` renders the template at request time and serves it at
  `GET /style.json` (the same path clients have always used), plus `sprite/` and `fonts/`
  as static files, all with `Access-Control-Allow-Origin: *` (martin already sets CORS;
  Python's `http.server`, which this replaced, does not - that's why this exists).
- Host substitution: set `STYLE_PUBLIC_HOST=<LAN IP>` to pin the host explicitly (e.g. for
  a reverse proxy), or leave it unset and the server infers the host from each request's
  own `Host` header - this is what makes `http://<laptop-LAN-IP>:3006/style.json` "just work"
  from a phone without any server-side config. `MARTIN_PORT` (default 3005) and `STYLE_PORT`
  (default 3006) override the ports if you've moved either service.
- `fonts/` (8.6MB, 1536 ranges, git-ignored): 6 stacks - Noto Sans/Sinhala/Tamil x
  Regular/Bold - built by `scripts/build-glyphs.cjs` (fontnik + Ubuntu fonts-noto-core).
  Regenerate: `node scripts/build-glyphs.cjs` from a dir with `fontnik` installed.
- `sprite/` (oneway arrow, from OMT basic style, tracked).

Run it: `node serve-style.mjs` (from `tiles/`). Nothing to rebuild after an IP change -
the template renders per-request.

## App wiring
`apps/native/.env`: `EXPO_PUBLIC_TILE_URL=http://<LAN-IP>:3006/style.json`
(localhost works for iOS sim only; Android emulator/device needs LAN IP - same rule as
`EXPO_PUBLIC_SERVER_URL`). Empty = demo-tiles fallback. Re-run offline packs after
switching.

## Valhalla - admins, timezones, elevation, tiles (B2)
`valhalla/sri-lanka-latest.osm.pbf` + `valhalla/valhalla.json` + `valhalla/valhalla_tiles/`
+ `valhalla/admins.sqlite` + `valhalla/timezones.sqlite` + `valhalla/elevation_tiles/`.

Build (or rebuild) all four with the bundled script, run from `tiles/`:
```powershell
docker compose up -d valhalla
.\scripts\build-valhalla.ps1
```
or on Linux/macOS: `./scripts/build-valhalla.sh`.

The script builds into `valhalla/build-new/` inside the container's mounted volume and
only swaps the files into place (`valhalla_tiles/`, `admins.sqlite`, `timezones.sqlite`,
`valhalla.json`) after every step succeeds and the swapped-in service passes
`scripts/smoke.mjs`. A failure at any step leaves the previously working tiles and config
untouched and prints the exact error; a failed *post-swap* smoke test leaves the old files
in `valhalla/build-old/` for manual rollback instead of deleting them.

What it runs, in order, and why each step exists:
1. `valhalla_build_config` with explicit `--mjolnir-admin`/`--mjolnir-timezone`/
   `--mjolnir-tile-dir`/`--additional-data-elevation`/`--mjolnir-include-construction`
   flags - **not** `-m/--merge-config`. That flag only adds keys missing from the old
   config, it does not override ones that already exist (verified against this image's
   `-h` output and by testing it), so it would silently keep pointing at the old,
   nonexistent paths. The script instead generates a fresh config and diffs
   `service_limits.motorcycle`/`motor_scooter`/`max_alternates` against the old file,
   warning if anything besides the intended admin/timezone/elevation/construction fields
   changed.
2. `valhalla_build_admins -c valhalla.json sri-lanka-latest.osm.pbf` - country/admin
   boundaries (10 admin areas for this extract: Sri Lanka plus slivers of India/Tamil
   Nadu at the edge of the bbox). The parser logs `NOT NULL constraint failed:
   admin_access.admin_id` for countries like the US, UK, France, etc. - expected and
   harmless on a regional extract; it only means the ISO country presets Valhalla ships
   for extract-only-partially-covered countries in the *reference* admin table has no
   matching row here. Sri Lanka's own row builds fine.
3. `valhalla_build_timezones > timezones.sqlite` - global timezone polygons (~120MB;
   Valhalla always ships one global DB, there's no way to scope this to Sri Lanka).
   Downloads a shapefile from the timezone-boundary-builder project on first run.
4. `valhalla_build_elevation -b "79,5,82,10" -o elevation_tiles -p 4` - downloads
   Tilezen/SRTM `.hgt.gz` tiles for the Sri Lanka bbox (15 one-degree tiles). Needs
   internet; a few hundred MB. `-b` takes `minLon,minLat,maxLon,maxLat`, not the
   positional args some older docs show.
5. `valhalla_build_tiles -c valhalla.json -j 4 sri-lanka-latest.osm.pbf` - the routing
   graph itself, now with `include_construction: true` and elevation-aware edges.

Verify manually any time with `node scripts/smoke.mjs` (also run automatically by the
build script right after a swap). It checks, against `VALHALLA_URL` (default
`http://localhost:8002`):
- `/status?verbose=true` reports `has_admins`/`has_timezones` true.
- A Colombo -> Kandy motorcycle route with `costing_options.motorcycle.use_highways: 0`
  never puts a maneuver on a road named for an expressway (E01/E03/"Expressway"/etc).
- The same route with `elevation_interval: 30` returns real elevation values in
  `legs[0].elevation`, not Valhalla's `-500` "no data" sentinel (an array of `-500`s
  looks like a pass if you only check its length).
- `/height` in Kandy returns a real, non-sentinel height above sea level.
- `/trace_attributes` on that route's shape reports a `speed_limit` on at least one edge.
- `/locate` near the Southern Expressway (Kottawa, ~6.84,79.96) reports whether OSM tags
  it `motorcycle=no` in this pbf (via `edge.access.motorcycle`) - see
  `context/feature-parity-plan.md` §3.3 for what this means for the routing rewrite: if
  the pbf already refuses motorcycle access there, `use_highways: 0` plus Valhalla's own
  access model is enough; if not, the routing code needs an explicit
  `search_filter.max_road_class` exclusion too.

The server reads `VALHALLA_URL` from `apps/server/.env` (unset in prod -> falls back to
public BRouter -> OSRM demo, per `context/feature-parity-plan.md` decision D1: local
Docker Valhalla only, no hosted instance yet). `GET /status` on the server proxies
Valhalla's own `/status?verbose=true` for a quick health check without hitting :8002
directly.

## POI + closures pipeline (§4.14, §4.15)

Extract rider POIs from the same Geofabrik extract, then import them into the `pois` table:

```powershell
cd roto-app\tiles
.\scripts\extract-pois.ps1            # or ./scripts/extract-pois.sh on Linux/macOS
```
This writes `data/pois.osm.pbf` + `data/pois.geojsonseq` (tag filter from plan §4.14:
fuel, charging, hospital, police, restaurant/cafe, hotel/guest_house/camp_site,
motorcycle shop/repair, speed cameras, enforcement relations) and
`data/closures.osm.pbf` + `data/closures.geojsonseq` (`highway=construction` ways for
the closures import, plan §4.15). Both outputs are gitignored — regenerate after each
fresh pbf download.

Import (from `roto-app/packages/db`, `DATABASE_URL` from the shell):
```
npx tsx src/seed/import-osm-pois.ts ../../tiles/data/pois.geojsonseq
npx tsx src/seed/hazards.lk.ts
```
`import-osm-pois` upserts by `osmId` (`source='osm'`): brand from `brand`/`operator`
tags, `name:si`/`name:ta` into `nameSi`/`nameTa`, a small `meta` subset (operator, fee,
cuisine, `socket:*`, `fuel:*`). Seed (`source='seed'`) and user rows have no `osmId`
and are never touched; `verified`/`source` on existing OSM rows are preserved.
Non-Point features (e.g. way geometries) are skipped and counted — the extract is
node-scoped, so this is expected, not data loss.

`hazards.lk` seeds four permanent `animal_elephant` corridor zones (Habarana–Dambulla,
Minneriya, Buttala–Kataragama, Udawalawe). Coordinates are approximate midpoints —
every row carries a "verify on device pass" note; corridor edits after verification go
through `hazards.report`/`hazards.vote`, not seed edits.

Nightly refresh is not a Vercel cron (no osmium binary there): per plan D7 it runs on
the Valhalla VPS / CI, which re-runs the extract and calls the protected import
endpoint; this directory's scripts are the manual equivalent.
