// Elevation profile: Valhalla /height first (needs VALHALLA_URL and an elevation-enabled build,
// B2), falling back to the free Open-Meteo elevation API in chunks (its docs don't publish a
// hard per-request point cap; 100 keeps well clear of URL-length limits on typical route lengths).
import { haversineM } from "@roto-app/core/geo";
import type { ElevationProfile, LonLat } from "@roto-app/core/types";
import { valhallaActionUrl } from "./valhalla";

type HeightResponse = { range_height?: [number, number][] };

async function viaValhalla(coords: LonLat[]): Promise<ElevationProfile | null> {
  const url = valhallaActionUrl("height");
  if (!url) return null;
  const body = { shape: coords.map(([lon, lat]) => ({ lat, lon })), range: true, resample_distance: 50 };
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as HeightResponse;
  if (!j.range_height?.length) return null;
  const distM: number[] = [];
  const heightM: number[] = [];
  for (const pair of j.range_height) {
    distM.push(pair[0]);
    heightM.push(pair[1]);
  }
  return { distM, heightM };
}

const OPEN_METEO_CHUNK = 100;

function cumulativeDistances(coords: LonLat[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const prev = out[i - 1] ?? 0;
    out.push(a && b ? prev + haversineM(a[0], a[1], b[0], b[1]) : prev);
  }
  return out;
}

async function viaOpenMeteo(coords: LonLat[]): Promise<ElevationProfile> {
  const heightM: number[] = [];
  for (let i = 0; i < coords.length; i += OPEN_METEO_CHUNK) {
    const chunk = coords.slice(i, i + OPEN_METEO_CHUNK);
    const lat = chunk.map((c) => c[1]).join(",");
    const lon = chunk.map((c) => c[0]).join(",");
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`open-meteo elevation ${r.status}`);
    const j = (await r.json()) as { elevation?: number[] };
    heightM.push(...(j.elevation ?? []));
  }
  return { distM: cumulativeDistances(coords), heightM };
}

export async function elevationProfile(
  coords: LonLat[],
): Promise<{ profile: ElevationProfile; source: "valhalla" | "open-meteo" }> {
  const fromValhalla = await viaValhalla(coords).catch(() => null);
  if (fromValhalla) return { profile: fromValhalla, source: "valhalla" };
  return { profile: await viaOpenMeteo(coords), source: "open-meteo" };
}
