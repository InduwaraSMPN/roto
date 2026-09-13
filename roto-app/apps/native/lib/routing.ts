// ponytail: client GPX only, engine stays server-side for FOSS tile independence
export type RouteResult = { coords: [number, number][]; km: number; min: number; engine: string; steps?: { instruction: string; lon: number; lat: number }[] };

export function toGpx(r: RouteResult, name = "roto-ride"): string {
  const pts = r.coords.map(([lon, lat]) => `<trkpt lat="${lat}" lon="${lon}"/>`).join("");
  return `<?xml version="1.0"?><gpx version="1.1" creator="roto"><trk><name>${name}</name><trkseg>${pts}</trkseg></trk></gpx>`;
}
