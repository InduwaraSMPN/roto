#!/usr/bin/env node
// Smoke test for the local Valhalla build (B2). No deps, run from anywhere:
//   node tiles/scripts/smoke.mjs
// or point at a different instance: VALHALLA_URL=http://host:8002 node tiles/scripts/smoke.mjs
//
// Checks, in order:
//   1. /status?verbose=true -> has_admins, has_timezones true
//   2. Colombo -> Kandy motorcycle route with use_highways:0 -> no maneuver street name
//      mentions an expressway (E01/E03/"Expressway"/"Southern Expressway"/"Colombo-Katunayake")
//   3. Same route with elevation_interval:30 -> legs[0].elevation is a non-empty array with
//      real values, not Valhalla's -500 "no elevation data" sentinel
//   4. /height in Kandy returns a non-zero, non-sentinel height
//   5. /trace_attributes on that route's shape -> some edge reports a speed_limit > 0
//   6. /locate near the Southern Expressway (Kottawa, ~6.84,79.96) -> reports whether OSM
//      tags it motorcycle=no (edge.access.motorcycle), which the routing agent needs to know
//      whether use_highways:0 alone is enough or an explicit exclusion is required.
//
// NOTE: Valhalla returns -500 (roughly) for shape points where it has no elevation tile
// coverage - a route/trace request with elevation_interval "succeeding" with an all -500
// array looks like a pass if you only check array length. Always check for real values.

const BASE = (process.env.VALHALLA_URL ?? "http://localhost:8002/route").replace(/\/route\/?$/, "");

const COLOMBO = { lat: 6.9271, lon: 79.8612 };
const KANDY = { lat: 7.2906, lon: 80.6337 };
// A point directly on the Southern Expressway (E01) near the Kottawa interchange.
const SOUTHERN_EXPRESSWAY_KOTTAWA = { lat: 6.8408, lon: 79.9636 };

const EXPRESSWAY_MARKERS = [
  "E01",
  "E02",
  "E03",
  "E04",
  "Expressway",
  "Southern Expressway",
  "Outer Circular",
  "Colombo-Katunayake",
  "Colombo–Katunayake",
];

let failures = 0;
function report(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failures++;
}

async function postJson(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path} -> ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function main() {
  console.log(`Valhalla base: ${BASE}\n`);

  // 1. /status
  // ponytail: a bare `GET /status?verbose=true` is silently ignored by this Valhalla
  // version - it needs the verbose flag as request JSON, either `GET /status?json={...}`
  // or a POST body. Confirmed by testing against the container directly; don't "fix" this
  // back to a plain query string without re-checking.
  let status;
  try {
    status = await postJson("/status", { verbose: true });
    report("status: has_admins", status.has_admins === true, `has_admins=${status.has_admins}`);
    report("status: has_timezones", status.has_timezones === true, `has_timezones=${status.has_timezones}`);
  } catch (e) {
    report("status endpoint reachable", false, String(e));
  }

  // 2. Colombo -> Kandy, motorcycle, use_highways: 0
  let route;
  try {
    route = await postJson("/route", {
      locations: [
        { lat: COLOMBO.lat, lon: COLOMBO.lon, type: "break" },
        { lat: KANDY.lat, lon: KANDY.lon, type: "break" },
      ],
      costing: "motorcycle",
      costing_options: { motorcycle: { use_highways: 0 } },
      directions_type: "maneuvers",
    });
    const streetNames = (route.trip.legs ?? []).flatMap((leg) =>
      (leg.maneuvers ?? []).flatMap((m) => m.street_names ?? []),
    );
    const hit = streetNames.find((name) => EXPRESSWAY_MARKERS.some((marker) => name.includes(marker)));
    report(
      "Colombo->Kandy motorcycle route avoids expressways",
      !hit,
      hit ? `found "${hit}" in maneuver street names` : `${streetNames.length} street names checked, none matched`,
    );
    report(
      "route has_highway flag is false",
      route.trip.summary?.has_highway === false,
      `has_highway=${route.trip.summary?.has_highway}`,
    );
  } catch (e) {
    report("Colombo->Kandy route request", false, String(e));
  }

  // 3. elevation_interval
  try {
    const withElevation = await postJson("/route", {
      locations: [
        { lat: COLOMBO.lat, lon: COLOMBO.lon, type: "break" },
        { lat: KANDY.lat, lon: KANDY.lon, type: "break" },
      ],
      costing: "motorcycle",
      costing_options: { motorcycle: { use_highways: 0 } },
      elevation_interval: 30,
    });
    const elevation = withElevation.trip.legs?.[0]?.elevation;
    // Valhalla's "no elevation data" sentinel is ~-500m; Sri Lanka has no terrain anywhere
    // near that, so any sample above -100 proves real SRTM data is loaded, not just an
    // array of placeholders.
    const realSamples = Array.isArray(elevation) ? elevation.filter((v) => v > -100) : [];
    report(
      "elevation_interval returns real (non-sentinel) elevation values",
      realSamples.length > 0,
      Array.isArray(elevation)
        ? `${realSamples.length}/${elevation.length} samples above -100m (min=${Math.min(...elevation)}, max=${Math.max(...elevation)})`
        : `got ${typeof elevation}`,
    );
  } catch (e) {
    report("elevation_interval route request", false, String(e));
  }

  // 4. /height in Kandy (hilly, should be well above sea level)
  const KANDY_CITY = { lat: 7.2906, lon: 80.6337 };
  try {
    const heightResp = await postJson("/height", {
      shape: [KANDY_CITY, { lat: KANDY_CITY.lat + 0.01, lon: KANDY_CITY.lon + 0.01 }],
    });
    const heights = heightResp.height ?? [];
    const realHeights = heights.filter((v) => v != null && v > -100);
    report(
      "/height in Kandy returns non-zero, non-sentinel heights",
      realHeights.length > 0 && realHeights.some((v) => v > 50),
      `heights=${JSON.stringify(heights)}`,
    );
  } catch (e) {
    report("/height request in Kandy", false, String(e));
  }

  // 5. trace_attributes speed_limit
  try {
    // 2 break locations -> exactly one leg, so its shape is the whole route polyline.
    const encodedShape = route?.trip?.legs?.[0]?.shape;
    if (encodedShape) {
      const attrs = await postJson("/trace_attributes", {
        encoded_polyline: encodedShape,
        costing: "motorcycle",
        shape_match: "edge_walk",
      });
      const speedLimits = (attrs.edges ?? []).map((e) => e.speed_limit).filter((v) => v != null && v > 0);
      report(
        "trace_attributes reports at least one speed_limit",
        speedLimits.length > 0,
        `${speedLimits.length} edges with a speed_limit out of ${attrs.edges?.length ?? 0}`,
      );
    } else {
      report("trace_attributes reports at least one speed_limit", false, "no route shape from step 2 to trace");
    }
  } catch (e) {
    report("trace_attributes request", false, String(e));
  }

  // 6. /locate on the Southern Expressway - is it tagged motorcycle=no in the pbf?
  try {
    const located = await postJson("/locate", {
      locations: [{ lat: SOUTHERN_EXPRESSWAY_KOTTAWA.lat, lon: SOUTHERN_EXPRESSWAY_KOTTAWA.lon, type: "break" }],
      costing: "auto",
      verbose: true,
    });
    const edges = located[0]?.edges ?? [];
    const motorcycleAccess = edges.map((e) => e.edge?.access?.motorcycle);
    const anyMotorcycleNo = motorcycleAccess.some((v) => v === false);
    const anyMotorcycleYes = motorcycleAccess.some((v) => v === true);
    console.log(
      `INFO  Southern Expressway (Kottawa) /locate: ${edges.length} edge(s), motorcycle access = [${motorcycleAccess.join(", ")}]`,
    );
    if (edges.length === 0) {
      console.log(
        "INFO  No edge found at that point (may have snapped off the expressway, or motorway class is excluded from auto costing search) - could not determine pbf tagging this way.",
      );
    } else if (anyMotorcycleNo) {
      console.log(
        "ANSWER  OSM tags the Southern Expressway motorcycle=no (or equivalent access=no) in this pbf - Valhalla's own access model already refuses motorcycles here regardless of use_highways.",
      );
    } else if (anyMotorcycleYes) {
      console.log(
        "ANSWER  OSM does NOT tag the Southern Expressway motorcycle=no in this pbf (access.motorcycle=true) - the expressway ban must be enforced purely through routing preference (use_highways:0) and/or an explicit max_road_class search_filter, not through OSM access tags.",
      );
    } else {
      console.log("ANSWER  motorcycle access flag was undefined/null for every edge found - inconclusive.");
    }
  } catch (e) {
    report("locate request on Southern Expressway", false, String(e));
  }

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  // ponytail: process.exitCode (not process.exit()) lets pending AbortSignal.timeout
  // handles unwind naturally - calling exit() here trips a libuv assertion on Windows
  // Node (src/win/async.c) when a timer handle is still mid-close.
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error("smoke.mjs crashed:", e);
  process.exit(1);
});
