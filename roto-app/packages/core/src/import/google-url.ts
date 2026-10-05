// Parses already-expanded Google Maps URLs into a waypoint list. Short links
// (maps.app.goo.gl, goo.gl/maps) redirect to one of these forms but must be resolved with a
// network fetch first — that happens server-side (packages/api routers/route.ts `importUrl`),
// not here, so this module stays a pure string parser with no I/O.

export type GoogleUrlWaypoint = { lat: number; lon: number } | { name: string };

export type ParsedGoogleUrl = { waypoints: GoogleUrlWaypoint[] };

const LATLON_RE = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/;

function parseToken(token: string): GoogleUrlWaypoint {
  const decoded = decodeURIComponent(token.replace(/\+/g, " ")).trim();
  const m = LATLON_RE.exec(decoded);
  if (m?.[1] && m[2]) return { lat: Number(m[1]), lon: Number(m[2]) };
  return { name: decoded };
}

/**
 * Handles two URL shapes:
 * - `.../maps/dir/?api=1&origin=..&destination=..&waypoints=lat,lon|lat,lon&travelmode=..`
 * - `.../maps/dir/<origin>/<waypoint>/.../<destination>/@lat,lon,zoomz`
 * Each token may be a `lat,lon` pair or a place name (returned as `{name}` — the caller has to
 * geocode those separately; Roto has no geocoder, so named legs surface as "couldn't read this
 * stop" in the UI).
 */
export function parseGoogleMapsUrl(url: string): ParsedGoogleUrl {
  const u = new URL(url);

  if (u.searchParams.has("origin") || u.searchParams.has("destination")) {
    const waypoints: GoogleUrlWaypoint[] = [];
    const origin = u.searchParams.get("origin");
    if (origin) waypoints.push(parseToken(origin));
    const mid = u.searchParams.get("waypoints");
    if (mid) {
      for (const seg of mid.split("|")) if (seg) waypoints.push(parseToken(seg));
    }
    const destination = u.searchParams.get("destination");
    if (destination) waypoints.push(parseToken(destination));
    if (!waypoints.length) throw new Error("No origin/destination found in this Google Maps link.");
    return { waypoints };
  }

  const dirMatch = /\/maps\/dir\/(.+)/.exec(u.pathname);
  const dirRest = dirMatch?.[1];
  if (dirRest) {
    const segments = dirRest.split("/").filter((s) => s && !s.startsWith("@") && !s.startsWith("data="));
    const waypoints = segments.map(parseToken);
    if (!waypoints.length) throw new Error("No waypoints found in this Google Maps link.");
    return { waypoints };
  }

  throw new Error("Unrecognized Google Maps link format.");
}
