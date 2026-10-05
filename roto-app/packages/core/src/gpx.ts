// GPX 1.1 writer. Produces both <rte> (planned route) and <trk> (ridden track) plus <wpt>
// when given, so files round-trip cleanly through REVER / Scenic / Kurviger (manual check
// list lives in roto-app/DEVICE-TEST.md per the plan's §5.5 GPX interop item).
import type { LonLat } from "./types";

export type GpxPoint = { lon: number; lat: number; ele?: number; time?: string | Date };
export type GpxWaypoint = GpxPoint & { name?: string };

export type ToGpxOptions = {
  name: string;
  /** Ridden track (<trk><trkseg>). */
  track?: GpxPoint[];
  /** Planned route (<rte>). */
  route?: GpxPoint[];
  waypoints?: GpxWaypoint[];
  creator?: string;
};

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function timeIso(t: string | Date | undefined): string | undefined {
  if (t === undefined) return undefined;
  return typeof t === "string" ? t : t.toISOString();
}

function pointTag(tag: "trkpt" | "rtept" | "wpt", p: GpxPoint, name?: string): string {
  const attrs = `lat="${p.lat}" lon="${p.lon}"`;
  const time = timeIso(p.time);
  const inner = [
    p.ele !== undefined ? `<ele>${p.ele}</ele>` : "",
    time ? `<time>${time}</time>` : "",
    name ? `<name>${xmlEscape(name)}</name>` : "",
  ].join("");
  return inner ? `<${tag} ${attrs}>${inner}</${tag}>` : `<${tag} ${attrs}/>`;
}

/** Writes a GPX 1.1 document. At least one of `track`/`route`/`waypoints` should be given. */
export function toGpx(opts: ToGpxOptions): string {
  const creator = opts.creator ?? "roto";
  const name = xmlEscape(opts.name);
  const parts: string[] = [];
  parts.push(
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="${xmlEscape(creator)}" xmlns="http://www.topografix.com/GPX/1/1">`,
  );
  if (opts.waypoints?.length) {
    for (const w of opts.waypoints) parts.push(pointTag("wpt", w, w.name));
  }
  if (opts.route?.length) {
    parts.push(`<rte>`, `<name>${name}</name>`, ...opts.route.map((p) => pointTag("rtept", p)), `</rte>`);
  }
  if (opts.track?.length) {
    parts.push(
      `<trk>`,
      `<name>${name}</name>`,
      `<trkseg>`,
      ...opts.track.map((p) => pointTag("trkpt", p)),
      `</trkseg>`,
      `</trk>`,
    );
  }
  parts.push(`</gpx>`);
  return parts.join("");
}

/** Convenience: a GPX track from bare [lon, lat] coords, no elevation/time. */
export function coordsToGpx(coords: LonLat[], name: string, kind: "track" | "route" = "track"): string {
  const points: GpxPoint[] = coords.filter((c): c is LonLat => !!c).map(([lon, lat]) => ({ lon, lat }));
  return toGpx(kind === "track" ? { name, track: points } : { name, route: points });
}
