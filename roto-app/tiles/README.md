# LK tiles — LIVE (built Sept 13, 2026)

## What exists now
- `data/sri-lanka-latest.osm.pbf` (144MB, Geofabrik `asia/sri-lanka-260912`)
- `data/sri-lanka.mbtiles` (119MB, planetiler v0.10.2 OpenMapTiles profile, z0-14)
- `style.json` (OMT basic, 48 layers, sources → martin, glyphs → demotiles keyless)
- martin on :3005 serves `sri-lanka` (verified: Colombo z14 tile 131KB, TileJSON bounds LK)
- style on :3006/style.json (python http.server; martin doesn't serve styles)

## Rebuild
`java -Xmx4g -jar planetiler.jar --osm-path=data/sri-lanka-latest.osm.pbf --output=data/sri-lanka.mbtiles --download --force`
`docker compose up -d martin`

## Glyphs + sprites — SELF-HOSTED (no CDN)
- `fonts/` (8.6MB, 1536 ranges, git-ignored): 6 stacks — Noto Sans/Sinhala/Tamil ×
  Regular/Bold — built by `scripts/build-glyphs.cjs` (fontnik + Ubuntu fonts-noto-core).
  Regenerate: `node scripts/build-glyphs.cjs` from a dir with `fontnik` installed.
- `sprite/` (oneway arrow, from OMT basic style, tracked).
- `style.json` points glyphs+sprite at :3006 and adds Sinhala/Tamil fallback to all
  8 text layers. localhost in URLs → swap to LAN IP for devices (same as tiles).

## App wiring
`apps/native/.env`: `EXPO_PUBLIC_TILE_URL=http://<LAN-IP>:3006/style.json`
(localhost works for iOS sim only; Android emulator/device needs LAN IP —
same rule as EXPO_PUBLIC_SERVER_URL). Empty = demo-tiles fallback.
Re-run offline packs after switching. Glyphs/sprite still CDN (self-host later).

## Valhalla — LIVE (129MB LK tiles, :8002)
`valhalla/sri-lanka-latest.osm.pbf` + `valhalla.json` + `valhalla_tiles/` (built in 16s).
`docker compose up -d valhalla` → motorcycle costing verified:
Colombo→Kandy 114.5km/106min. Server uses `VALHALLA_URL` (set in
`apps/server/.env`); without it → BRouter public → OSRM demo.
