// ponytail: Valhalla self-host > BRouter true bike costing > OSRM demo fallback
export type LatLon = { lat: number; lon: number };
export type Step = { instruction: string; lon: number; lat: number };

const OSRM = "https://router.project-osrm.org/route/v1/motorcycle";
const BROUTER = "https://brouter.de/brouter";
// ponytail: read lazily — server .env (varlock) loads after module init

// ponytail: 20-line polyline6 decoder, not a new dep
function decodePolyline(str: string, precision = 6): [number, number][] {
  let lat = 0, lon = 0, i = 0;
  const out: [number, number][] = [];
  const f = 10 ** precision;
  while (i < str.length) {
    let b = 0, shift = 0, res = 0;
    do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += res & 1 ? ~(res >> 1) : res >> 1;
    b = 0; shift = 0; res = 0;
    do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lon += res & 1 ? ~(res >> 1) : res >> 1;
    out.push([lon / f, lat / f]);
  }
  return out;
}

async function viaBrouter(points: LatLon[]) {
  const lonlats = points.map((p) => `${p.lon},${p.lat}`).join("|");
  const r = await fetch(
    `${BROUTER}?lonlats=${lonlats}&profile=trekking&alternativeidx=0&format=geojson`,
    { signal: AbortSignal.timeout(25000) },
  );
  if (!r.ok) throw new Error(`brouter ${r.status}`);
  const j = (await r.json()) as any;
  const f = j.features?.[0];
  if (!f) throw new Error("brouter empty");
  return {
    coords: f.geometry.coordinates as [number, number][],
    km: Number(f.properties?.["track-length"] ?? 0) / 1000,
    min: Number(f.properties?.["total-time"] ?? 0) / 60,
    engine: "brouter" as const,
    steps: [] as Step[], // ponytail: BRouter messages need custom profile; voice degrades gracefully
  };
}

export async function planRoute(points: LatLon[], curvy = 0.5) {
  const coord = points.map((p) => `${p.lon},${p.lat}`).join(";");
  const VALHALLA = process.env.VALHALLA_URL; // e.g. http://localhost:8002/route
  if (VALHALLA) {
    try {
      const r = await fetch(`${VALHALLA}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locations: points.map((p) => ({ lat: p.lat, lon: p.lon })),
          costing: "motorcycle",
          costing_options: { motorcycle: { use_hills: curvy, use_primary: 1 - curvy * 0.7 } },
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new Error(`valhalla ${r.status}`);
      const j = (await r.json()) as any;
      const coords: [number, number][] = [];
      const steps: Step[] = [];
      for (const leg of j.trip.legs ?? []) {
        const pts: [number, number][] = typeof leg.shape === "string" ? decodePolyline(leg.shape) : (leg.shape ?? []);
        for (const m of leg.maneuvers ?? []) {
          const p = pts[m.begin_shape_index] ?? pts[0];
          if (p && m.instruction) steps.push({ instruction: m.instruction, lon: p[0], lat: p[1] });
        }
        coords.push(...pts);
      }
      return { coords, steps, km: j.trip.summary.length, min: j.trip.summary.time / 60, engine: "valhalla" as const };
    } catch {
      // down/unset Valhalla (e.g. prod) → BRouter → OSRM below
    }
  }
  try {
    return await viaBrouter(points);
  } catch {
    // fall through to OSRM demo
  }
  const url = `${OSRM}/${coord}?overview=full&geometries=geojson${curvy > 0.6 ? "&alternatives=2" : ""}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`osrm ${r.status}`);
  const j = (await r.json()) as any;
  const routes = j.routes ?? [];
  routes.sort((a: any, b: any) => Math.abs(a.distance / 1000 - 25) - Math.abs(b.distance / 1000 - 25));
  const pick = routes[curvy > 0.6 ? routes.length - 1 : 0] ?? routes[0];
  if (!pick) throw new Error("no route");
  const steps: Step[] = (pick.legs ?? []).flatMap((l: any) =>
    (l.steps ?? []).map((s: any) => ({
      instruction: `${s.maneuver?.type ?? ""} ${s.maneuver?.modifier ?? ""} ${s.name ?? ""}`.trim() || "continue",
      lon: s.maneuver?.location?.[0] ?? 0,
      lat: s.maneuver?.location?.[1] ?? 0,
    })),
  );
  return {
    coords: pick.geometry.coordinates as [number, number][],
    steps,
    km: pick.distance / 1000,
    min: pick.duration / 60,
    engine: "osrm" as const,
  };
}

// ponytail: circle-bearings loop, replace with Valhalla trace_attributes when self-hosted
export function roundTripPoints(center: LatLon, km = 60, bearings = [0, 120, 240]): LatLon[] {
  const deg = km / 111 / bearings.length;
  return [
    center,
    ...bearings.map((b) => {
      const rad = (b * Math.PI) / 180;
      return { lat: center.lat + deg * Math.cos(rad), lon: center.lon + deg * Math.sin(rad) };
    }),
    center,
  ];
}
