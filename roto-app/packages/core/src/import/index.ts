// Route file import: dispatches by extension to GPX/KML (via @tmcw/togeojson +
// @xmldom/xmldom), KMZ (fflate unzipSync -> first .kml), ITN (hand-parsed) and TCX.
// .gdb (Garmin BaseCamp) and Furkot exports get a clear "export as GPX" error — GPSBabel
// server-side conversion is a possible later addition, not built here (plan §4.6).
import { DOMParser } from "@xmldom/xmldom";
import * as togeojson from "@tmcw/togeojson";
import { strFromU8, unzipSync } from "fflate";
import type { LonLat } from "../types";

export type ImportedRoute = {
  /** Ridden/GPX <trk> or KML LineString placemarks. */
  tracks: LonLat[][];
  /** Planned GPX <rte>. */
  routes: LonLat[][];
  waypoints: { lon: number; lat: number; name?: string }[];
};

function emptyResult(): ImportedRoute {
  return { tracks: [], routes: [], waypoints: [] };
}

// biome-ignore lint: togeojson's GeoJSON typings pull in ambient DOM/geojson globals this
// package's tsconfig doesn't include (core has no `lib: dom`); `any` avoids requiring them.
function fromGeoJson(fc: any): ImportedRoute {
  const out = emptyResult();
  for (const f of fc?.features ?? []) {
    const geom = f?.geometry;
    if (!geom) continue;
    const isRoute = f.properties?._gpxType === "rte";
    if (geom.type === "LineString") {
      (isRoute ? out.routes : out.tracks).push(geom.coordinates as LonLat[]);
    } else if (geom.type === "MultiLineString") {
      for (const line of geom.coordinates as LonLat[][]) (isRoute ? out.routes : out.tracks).push(line);
    } else if (geom.type === "Point") {
      const [lon, lat] = geom.coordinates as LonLat;
      out.waypoints.push({ lon, lat, name: f.properties?.name });
    }
  }
  return out;
}

function parseXml(text: string) {
  return new DOMParser().parseFromString(text, "text/xml");
}

// ponytail: TomTom .itn — pipe-delimited "lon*1e5|lat*1e5|name|flag" lines, no XML involved.
function parseItn(text: string): ImportedRoute {
  const out = emptyResult();
  const pts: LonLat[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split("|");
    const lonRaw = Number(parts[0]);
    const latRaw = Number(parts[1]);
    if (!Number.isFinite(lonRaw) || !Number.isFinite(latRaw)) continue;
    const lon = lonRaw / 1e5;
    const lat = latRaw / 1e5;
    const name = parts[2]?.trim();
    pts.push([lon, lat]);
    if (name) out.waypoints.push({ lon, lat, name });
  }
  if (pts.length > 1) out.routes.push(pts);
  return out;
}

const decoder = new TextDecoder();

/** Imports a route file by extension. `bytes` is the raw file content (works from either Node Buffer or browser File#bytes()). */
export async function importRouteFile(name: string, bytes: Uint8Array): Promise<ImportedRoute> {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "gpx":
      return fromGeoJson(togeojson.gpx(parseXml(decoder.decode(bytes)) as never));
    case "kml":
      return fromGeoJson(togeojson.kml(parseXml(decoder.decode(bytes)) as never));
    case "tcx": {
      const tcx = (togeojson as Record<string, unknown>).tcx;
      if (typeof tcx !== "function") {
        throw new Error("TCX import isn't supported by the installed @tmcw/togeojson version.");
      }
      return fromGeoJson(tcx(parseXml(decoder.decode(bytes))));
    }
    case "kmz": {
      const files = unzipSync(bytes);
      const kmlName = Object.keys(files).find((f) => f.toLowerCase().endsWith(".kml"));
      const entry = kmlName ? files[kmlName] : undefined;
      if (!entry) throw new Error("No .kml file found inside this .kmz archive.");
      return fromGeoJson(togeojson.kml(parseXml(strFromU8(entry)) as never));
    }
    case "itn":
      return parseItn(decoder.decode(bytes));
    case "gdb":
      throw new Error("Garmin .gdb files aren't supported — export as GPX from BaseCamp first.");
    default:
      throw new Error(`Unsupported file type ".${ext}". Use GPX, KML, KMZ, TCX or ITN.`);
  }
}
