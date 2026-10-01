#!/usr/bin/env bash
# Build Valhalla admin/timezone/elevation data and routing tiles for Sri Lanka (B2),
# inside the running `tiles-valhalla-1` container, then swap them in atomically.
#
# Today tiles/valhalla/valhalla.json points at admin/timezone/elevation files that
# don't exist, so Valhalla has no country access rules, no elevation, and no
# elevation_interval support. This script builds all three plus fresh routing tiles
# into a staging directory (tiles/valhalla/build-new/) and only overwrites the live
# files after every build step succeeds, restarting the container to pick them up.
# If any step fails, it reports the exact error and leaves the old tiles untouched.
#
# valhalla_build_config's -m/--merge-config flag only ADDS missing keys, it does not
# override existing ones (verified against this image's -h output and behavior), so
# this script generates a full config from explicit flags instead and diffs it
# against the old one to confirm no service_limits (motorcycle max_distance/
# max_locations/max_alternates) were silently reset.
#
# Usage:
#   cd roto-app/tiles
#   docker compose up -d valhalla
#   ./scripts/build-valhalla.sh [bbox] [container] [concurrency] [pbf]
#
# Twin of build-valhalla.ps1 for Linux/macOS dev machines.

set -euo pipefail

BBOX="${1:-79,5,82,10}"
CONTAINER="${2:-tiles-valhalla-1}"
CONCURRENCY="${3:-4}"
PBF="${4:-sri-lanka-latest.osm.pbf}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TILES_DIR="$(dirname "$SCRIPT_DIR")"
VALHALLA_DIR="$TILES_DIR/valhalla"
STAGING_HOST="$VALHALLA_DIR/build-new"
STAGING_C="/custom_files/build-new"

log() { echo -e "\033[36m$*\033[0m"; }
warn() { echo -e "\033[33mWARNING: $*\033[0m" >&2; }
fail() {
  echo -e "\033[31mBuild failed: $*\033[0m" >&2
  echo "Old tiles/config were not touched (staging dir is tiles/valhalla/build-new/ for inspection)." >&2
  exit 1
}

trap 'fail "unexpected error at line $LINENO"' ERR

if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)" != "true" ]; then
  fail "Container '$CONTAINER' is not running. Start it first: docker compose up -d valhalla (from tiles/)."
fi

log "== Roto Valhalla build (Sri Lanka: admins, timezones, elevation, tiles) =="

log "-- Cleaning previous staging dir"
rm -rf "$STAGING_HOST"
docker exec "$CONTAINER" mkdir -p "$STAGING_C/valhalla_tiles" "$STAGING_C/elevation_tiles"

log "-- [1/5] valhalla_build_config"
# NOTE: no -m/--merge-config here - it only adds missing keys, it will not point
# mjolnir.admin/timezone/tile_dir or additional_data.elevation at the new paths.
docker exec "$CONTAINER" valhalla_build_config \
  --mjolnir-admin "$STAGING_C/admins.sqlite" \
  --mjolnir-timezone "$STAGING_C/timezones.sqlite" \
  --mjolnir-tile-dir "$STAGING_C/valhalla_tiles" \
  --mjolnir-tile-extract "$STAGING_C/valhalla_tiles.tar" \
  --additional-data-elevation "$STAGING_C/elevation_tiles" \
  --mjolnir-include-construction true \
  -o "$STAGING_C/valhalla.json"

log "-- [2/5] valhalla_build_admins"
docker exec "$CONTAINER" valhalla_build_admins -c "$STAGING_C/valhalla.json" "/custom_files/$PBF"

log "-- [3/5] valhalla_build_timezones (downloads world tz shapefile, ~120MB)"
docker exec "$CONTAINER" valhalla_build_timezones > "$STAGING_HOST/timezones.sqlite"

log "-- [4/5] valhalla_build_elevation (bbox $BBOX, needs internet)"
docker exec "$CONTAINER" valhalla_build_elevation -b "$BBOX" -o "$STAGING_C/elevation_tiles" -p "$CONCURRENCY" -v

log "-- [5/5] valhalla_build_tiles"
docker exec "$CONTAINER" valhalla_build_tiles -c "$STAGING_C/valhalla.json" -j "$CONCURRENCY" "/custom_files/$PBF"

# Sanity: confirm no service_limits regressed relative to the live config.
node -e "
const fs = require('fs');
const oldC = JSON.parse(fs.readFileSync('$VALHALLA_DIR/valhalla.json', 'utf8'));
const newC = JSON.parse(fs.readFileSync('$STAGING_HOST/valhalla.json', 'utf8'));
for (const mode of ['motorcycle', 'motor_scooter']) {
  const o = oldC.service_limits[mode], n = newC.service_limits[mode];
  if (o.max_distance !== n.max_distance || o.max_locations !== n.max_locations) {
    console.warn(\`WARNING: \${mode} service_limits changed: old=\${JSON.stringify(o)} new=\${JSON.stringify(n)}\`);
  }
}
if (oldC.service_limits.max_alternates !== newC.service_limits.max_alternates) {
  console.warn(\`WARNING: max_alternates changed: old=\${oldC.service_limits.max_alternates} new=\${newC.service_limits.max_alternates}\`);
}
"

log "-- All build steps succeeded. Swapping into place."

docker stop "$CONTAINER" >/dev/null

BACKUP="$VALHALLA_DIR/build-old"
rm -rf "$BACKUP"
mkdir -p "$BACKUP"
for name in valhalla_tiles admins.sqlite timezones.sqlite valhalla.json; do
  if [ -e "$VALHALLA_DIR/$name" ]; then
    mv "$VALHALLA_DIR/$name" "$BACKUP/$name"
  fi
done
for name in valhalla_tiles elevation_tiles admins.sqlite timezones.sqlite valhalla.json; do
  mv "$STAGING_HOST/$name" "$VALHALLA_DIR/$name"
done

# The moved valhalla.json still has its mjolnir.admin/timezone/tile_dir/tile_extract and
# additional_data.elevation paths pointing at the staging location ($STAGING_C), since it
# was generated before the swap. Rewrite them to the final in-place paths, or the
# container starts with has_tiles/has_admins/has_timezones all false (found this the hard
# way - always verify with the smoke test after a swap, not just after the build).
sed -i "s#${STAGING_C}/#/custom_files/#g" "$VALHALLA_DIR/valhalla.json"

docker start "$CONTAINER" >/dev/null || fail "docker start $CONTAINER failed - old tiles are in tiles/valhalla/build-old, restore manually"

log "-- Swapped. Verifying with the smoke test..."
sleep 2
if node "$SCRIPT_DIR/smoke.mjs"; then
  log "-- Smoke test passed. Removing backup (tiles/valhalla/build-old) and staging dir."
  rm -rf "$BACKUP" "$STAGING_HOST"
else
  warn "Smoke test failed after swap. Old tiles are preserved in tiles/valhalla/build-old/ - roll back manually if needed: stop the container, move build-old/* back over valhalla_tiles/admins.sqlite/timezones.sqlite/valhalla.json, restart."
fi

log "== Done =="
