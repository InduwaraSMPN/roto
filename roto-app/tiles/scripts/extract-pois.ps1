<#
.SYNOPSIS
  Extract rider POIs, highway=construction closures and the twisty-road ways from the Sri
  Lanka OSM extract (plan §4.14, §4.15, §5.5).

.DESCRIPTION
  One pass over the pbf writes three GeoJSONSeq files into $OutDir:

    pois.geojsonseq      nodes/ways/relations tagged amenity=fuel|charging_station|hospital|
                         police|restaurant|cafe|fast_food, tourism=hotel|guest_house|hostel|
                         motel|camp_site, shop=motorcycle|motorcycle_repair,
                         highway=speed_camera, type=enforcement   -> import-osm-pois.ts
    closures.geojsonseq  highway=construction ways                  -> closures import (§4.15)
    ways.geojsonseq      highway=primary|secondary|tertiary|unclassified ways
                                                                        -> curvature-ways.ts

  The reader is pyosmium (`pip install --user osmium`), not the osmium CLI: osmium-tool is a
  Linux-only package and is not installed on the dev machines, but the pbf reader works
  everywhere Python does. Plan §4.14's filter was node-scoped (`n/...`); ways and relations
  are matched here too because LK maps plenty of fuel stations, hospitals and speed-camera
  enforcement areas as areas, and the importer takes a representative point for those.

  Requires: `python` on PATH with pyosmium importable. The whole pass takes ~4 min and needs
  ~400 MB of scratch in $OutDir for the node-location index (deleted at the end).

.EXAMPLE
  cd roto-app\tiles
  .\scripts\extract-pois.ps1
#>
[CmdletBinding()]
param(
  [string]$Pbf = "data/sri-lanka-latest.osm.pbf",
  [string]$OutDir = "data",
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TilesDir = Split-Path -Parent $ScriptDir           # roto-app/tiles
Set-Location $TilesDir

if (-not (Get-Command $Python -ErrorAction SilentlyContinue)) {
  throw "python not found on PATH (needed for pyosmium)"
}
if (-not (Test-Path -LiteralPath $Pbf)) {
  throw "pbf not found: $Pbf"
}
& $Python -c "import osmium" 2>$null
if ($LASTEXITCODE -ne 0) {
  throw "pyosmium is not installed for '$Python' - run: $Python -m pip install --user osmium"
}
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

# KEEP IN SYNC with extract-pois.sh - same program, same tag filters.
$extract = @'
import json
import os
import osmium
import sys

PBF, OUTDIR = sys.argv[1], sys.argv[2]
STORE = os.path.join(OUTDIR, "node-locations.store")


def tagset(csv):
    return set(csv.split(","))


# (key, values) pairs: an object is written to a job's file when ANY pair matches.
# POI_TAGS is the plan 4.14 rider filter, WAY_TAGS the 5.5 twisty-roads input.
POI_TAGS = [
    ("amenity", tagset("fuel,charging_station,hospital,police,restaurant,cafe,fast_food")),
    ("tourism", tagset("hotel,guest_house,hostel,motel,camp_site")),
    ("shop", tagset("motorcycle,motorcycle_repair")),
    ("highway", tagset("speed_camera")),
    ("type", tagset("enforcement")),
]
CLOSURE_TAGS = [("highway", tagset("construction"))]
WAY_TAGS = [("highway", tagset("primary,secondary,tertiary,unclassified"))]

# first match wins; element letters are pyosmium ones (n/w/r)
JOBS = [
    ("pois", POI_TAGS, "nwr"),
    ("closures", CLOSURE_TAGS, "w"),
    ("ways", WAY_TAGS, "w"),
]


def match(tags, pairs):
    for key, values in pairs:
        v = tags.get(key)
        if v is not None and v in values:
            return True
    return False


def way_geometry(w):
    """Fallback for ways the geometry factory rejects (fewer than two nodes, or a gap in the
    node refs): split into contiguous runs so a multi-part road is not lost."""
    parts = []
    run = []
    prev = None
    for n in w.nodes:
        if prev is not None and n.id() != prev + 1 and len(run) >= 2:
            parts.append(run)
            run = []
        run.append([round(n.lon(), 7), round(n.lat(), 7)])
        prev = n.id()
    if len(run) >= 2:
        parts.append(run)
    if not parts:
        return None
    if len(parts) == 1:
        return json.dumps({"type": "LineString", "coordinates": parts[0]})
    return json.dumps({"type": "MultiLineString", "coordinates": parts})


class Extract(osmium.SimpleHandler):
    def __init__(self, out):
        super().__init__()
        self.factory = osmium.geom.GeoJSONFactory()
        self.files = dict((name, fh) for (name, _, _, fh) in out)
        self.rules = [(name, pairs, elements) for (name, pairs, elements, _) in out]
        self.counts = dict((name, 0) for (name, _, _, _) in out)
        self.nogeom = dict((name, 0) for (name, _, _, _) in out)

    def job_for(self, kind, tags):
        for name, pairs, elements in self.rules:
            if kind in elements and match(tags, pairs):
                return name
        return None

    def write(self, job, kind, oid, tags, geom):
        if geom is None:
            self.nogeom[job] += 1
            return
        self.files[job].write(
            '{"@id":"%s/%d","@type":"%s","tags":%s,"geometry":%s}\n'
            % (kind, oid, kind, json.dumps(dict(tags), ensure_ascii=False), geom)
        )
        self.counts[job] += 1

    def node(self, n):
        job = self.job_for("n", n.tags)
        if job:
            self.write(job, "node", n.id, n.tags, self.factory.create_point(n))

    def way(self, w):
        job = self.job_for("w", w.tags)
        if not job:
            return
        try:
            geom = self.factory.create_linestring(w)
        except Exception:
            geom = way_geometry(w)
        self.write(job, "way", w.id, w.tags, geom)

    def relation(self, r):
        job = self.job_for("r", r.tags)
        if not job:
            return
        try:
            geom = self.factory.create_multipolygon(r)
        except Exception:
            geom = None
        self.write(job, "relation", r.id, r.tags, geom)


os.makedirs(OUTDIR, exist_ok=True)
out = []
for name, pairs, elements in JOBS:
    fh = open(os.path.join(OUTDIR, name + ".geojsonseq"), "w", encoding="utf-8")
    out.append((name, pairs, elements, fh))
handler = Extract(out)
# locations=True builds a node-location index, because ways carry no coordinates in a pbf.
# It is file-backed: a flex_mem index for a country extract does not fit in RAM. The index
# file is removed by the caller, once this process has exited and released the mapping.
handler.apply_file(PBF, locations=True, idx="sparse_file_array," + STORE)
for _, _, _, fh in out:
    fh.close()
print(json.dumps({"counts": handler.counts, "no_geometry": handler.nogeom}))
'@

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("roto-extract-pois-" + [guid]::NewGuid().ToString("N") + ".py")
Set-Content -LiteralPath $tmp -Value $extract -Encoding Ascii
Write-Host "-> extracting from $Pbf (one pass, ~4 min)"
try {
  & $Python $tmp $Pbf $OutDir
  if ($LASTEXITCODE -ne 0) { throw "the extract program exited $LASTEXITCODE" }
}
finally {
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath "$OutDir/node-locations.store" -Force -ErrorAction SilentlyContinue
}

Write-Host "counts:"
Get-ChildItem "$OutDir/*.geojsonseq" | ForEach-Object {
  "{0,-20} {1,8} lines" -f $_.Name, (Get-Content -LiteralPath $_.FullName | Measure-Object -Line).Lines
}
Write-Host "next (from roto-app/packages/db, DATABASE_URL from the shell):"
Write-Host "  npx tsx src/seed/import-osm-pois.ts ../../tiles/$OutDir/pois.geojsonseq ../../tiles/$OutDir/closures.geojsonseq"
Write-Host "  npx tsx src/seed/curvature-ways.ts ../../tiles/$OutDir/ways.geojsonseq"
