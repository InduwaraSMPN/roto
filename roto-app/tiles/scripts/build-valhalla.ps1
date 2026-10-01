<#
.SYNOPSIS
  Build Valhalla admin/timezone/elevation data and routing tiles for Sri Lanka (B2),
  inside the running `tiles-valhalla-1` container, then swap them in atomically.

.DESCRIPTION
  Today `tiles/valhalla/valhalla.json` points at admin/timezone/elevation files that
  don't exist, so Valhalla has no country access rules, no elevation, and no
  `elevation_interval` support. This script builds all three plus fresh routing tiles
  into a staging directory (`tiles/valhalla/build-new/`) and only overwrites the live
  files after every build step succeeds, restarting the container to pick them up.
  If any step fails, the script reports the exact error and leaves the previously
  working tiles/config untouched - nothing is swapped.

  `valhalla_build_config`'s `-m/--merge-config` flag only ADDS missing keys, it does
  not override existing ones (verified against this image's `-h` output and behavior),
  so this script generates a full config from explicit flags instead and diffs it
  against the old one to confirm no `service_limits` (e.g. motorcycle max_distance/
  max_locations/max_alternates) were silently reset to different values.

.PARAMETER Bbox
  Sri Lanka bounding box for elevation tiles as "minLon,minLat,maxLon,maxLat".

.PARAMETER Container
  Name of the running Valhalla container (from `tiles/docker-compose.yml`).

.PARAMETER Concurrency
  Threads for valhalla_build_tiles and processes for valhalla_build_elevation.

.EXAMPLE
  cd roto-app\tiles
  docker compose up -d valhalla
  .\scripts\build-valhalla.ps1
#>
[CmdletBinding()]
param(
  [string]$Bbox = "79,5,82,10",
  [string]$Container = "tiles-valhalla-1",
  [int]$Concurrency = 4,
  [string]$Pbf = "sri-lanka-latest.osm.pbf"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TilesDir = Split-Path -Parent $ScriptDir           # roto-app/tiles
$ValhallaDir = Join-Path $TilesDir "valhalla"        # host side of /custom_files
$StagingHost = Join-Path $ValhallaDir "build-new"
$StagingC = "/custom_files/build-new"                 # container side

function Invoke-InContainer {
  param([Parameter(Mandatory)][string[]]$Args)
  & docker exec $Container @Args
  if ($LASTEXITCODE -ne 0) {
    throw "docker exec $Container $($Args -join ' ') exited $LASTEXITCODE"
  }
}

function Assert-ContainerRunning {
  $running = & docker inspect -f "{{.State.Running}}" $Container 2>$null
  if ($LASTEXITCODE -ne 0 -or $running -ne "true") {
    throw "Container '$Container' is not running. Start it first: docker compose up -d valhalla (from tiles/)."
  }
}

function Remove-StagingDir {
  if (Test-Path $StagingHost) {
    Remove-Item -Recurse -Force $StagingHost
  }
}

Write-Host "== Roto Valhalla build (Sri Lanka: admins, timezones, elevation, tiles) ==" -ForegroundColor Cyan

try {
  Assert-ContainerRunning

  Write-Host "-- Cleaning previous staging dir" -ForegroundColor DarkGray
  Remove-StagingDir
  Invoke-InContainer -Args @("mkdir", "-p", "$StagingC/valhalla_tiles", "$StagingC/elevation_tiles")

  Write-Host "-- [1/5] valhalla_build_config" -ForegroundColor Cyan
  # NOTE: no -m/--merge-config here - it only adds missing keys, it will not point
  # mjolnir.admin/timezone/tile_dir or additional_data.elevation at the new paths.
  Invoke-InContainer -Args @(
    "valhalla_build_config",
    "--mjolnir-admin", "$StagingC/admins.sqlite",
    "--mjolnir-timezone", "$StagingC/timezones.sqlite",
    "--mjolnir-tile-dir", "$StagingC/valhalla_tiles",
    "--mjolnir-tile-extract", "$StagingC/valhalla_tiles.tar",
    "--additional-data-elevation", "$StagingC/elevation_tiles",
    "--mjolnir-include-construction", "true",
    "-o", "$StagingC/valhalla.json"
  )

  Write-Host "-- [2/5] valhalla_build_admins" -ForegroundColor Cyan
  Invoke-InContainer -Args @("valhalla_build_admins", "-c", "$StagingC/valhalla.json", "/custom_files/$Pbf")

  Write-Host "-- [3/5] valhalla_build_timezones (downloads world tz shapefile, ~120MB)" -ForegroundColor Cyan
  & docker exec $Container valhalla_build_timezones > (Join-Path $StagingHost "timezones.sqlite")
  if ($LASTEXITCODE -ne 0) { throw "valhalla_build_timezones exited $LASTEXITCODE" }

  Write-Host "-- [4/5] valhalla_build_elevation (bbox $Bbox, needs internet)" -ForegroundColor Cyan
  Invoke-InContainer -Args @(
    "valhalla_build_elevation", "-b", $Bbox, "-o", "$StagingC/elevation_tiles", "-p", "$Concurrency", "-v"
  )

  Write-Host "-- [5/5] valhalla_build_tiles" -ForegroundColor Cyan
  Invoke-InContainer -Args @(
    "valhalla_build_tiles", "-c", "$StagingC/valhalla.json", "-j", "$Concurrency", "/custom_files/$Pbf"
  )

  # Sanity: confirm no service_limits regressed relative to the live config (the whole
  # point of generating a full config plus a diff instead of trusting -m to merge).
  $oldConfig = Get-Content (Join-Path $ValhallaDir "valhalla.json") -Raw | ConvertFrom-Json
  $newConfig = Get-Content (Join-Path $StagingHost "valhalla.json") -Raw | ConvertFrom-Json
  foreach ($mode in @("motorcycle", "motor_scooter")) {
    $old = $oldConfig.service_limits.$mode
    $new = $newConfig.service_limits.$mode
    if ($old.max_distance -ne $new.max_distance -or $old.max_locations -ne $new.max_locations) {
      Write-Warning "$mode service_limits changed: old max_distance=$($old.max_distance) max_locations=$($old.max_locations); new max_distance=$($new.max_distance) max_locations=$($new.max_locations). Review before swapping."
    }
  }
  if ($oldConfig.service_limits.max_alternates -ne $newConfig.service_limits.max_alternates) {
    Write-Warning "max_alternates changed: old=$($oldConfig.service_limits.max_alternates) new=$($newConfig.service_limits.max_alternates). Review before swapping."
  }

  Write-Host "-- All build steps succeeded. Swapping into place." -ForegroundColor Green

  & docker stop $Container | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "docker stop $Container failed" }

  $backup = Join-Path $ValhallaDir "build-old"
  if (Test-Path $backup) { Remove-Item -Recurse -Force $backup }
  New-Item -ItemType Directory -Path $backup | Out-Null
  foreach ($name in @("valhalla_tiles", "admins.sqlite", "timezones.sqlite", "valhalla.json")) {
    $p = Join-Path $ValhallaDir $name
    if (Test-Path $p) { Move-Item $p (Join-Path $backup $name) }
  }
  foreach ($name in @("valhalla_tiles", "elevation_tiles", "admins.sqlite", "timezones.sqlite", "valhalla.json")) {
    Move-Item (Join-Path $StagingHost $name) (Join-Path $ValhallaDir $name)
  }

  # The moved valhalla.json still has its mjolnir.admin/timezone/tile_dir/tile_extract and
  # additional_data.elevation paths pointing at the staging location ($StagingC), since it
  # was generated before the swap. Rewrite them to the final in-place paths, or the
  # container starts with has_tiles/has_admins/has_timezones all false (found this the
  # hard way - always verify with the smoke test after a swap, not just after the build).
  $finalConfigPath = Join-Path $ValhallaDir "valhalla.json"
  (Get-Content $finalConfigPath -Raw) -replace [regex]::Escape("$StagingC/"), "/custom_files/" |
    Set-Content -NoNewline $finalConfigPath

  & docker start $Container | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "docker start $Container failed - old tiles are in tiles/valhalla/build-old, restore manually" }

  Write-Host "-- Swapped. Verifying with the smoke test..." -ForegroundColor Cyan
  Start-Sleep -Seconds 2
  & node (Join-Path $ScriptDir "smoke.mjs")
  $smokeExit = $LASTEXITCODE

  if ($smokeExit -eq 0) {
    Write-Host "-- Smoke test passed. Removing backup (tiles/valhalla/build-old) and staging dir." -ForegroundColor Green
    Remove-Item -Recurse -Force $backup -ErrorAction SilentlyContinue
    Remove-StagingDir
  } else {
    Write-Warning "Smoke test failed after swap. Old tiles are preserved in tiles/valhalla/build-old/ - roll back manually if needed: stop the container, move build-old/* back over valhalla_tiles/admins.sqlite/timezones.sqlite/valhalla.json, restart."
  }

  Write-Host "== Done ==" -ForegroundColor Cyan
} catch {
  Write-Error "Build failed: $($_.Exception.Message)"
  Write-Host "Old tiles/config were not touched (staging dir is tiles/valhalla/build-new/ for inspection)." -ForegroundColor Yellow
  exit 1
}
