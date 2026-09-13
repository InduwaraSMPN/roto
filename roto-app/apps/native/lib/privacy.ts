// ponytail: trim ends (like ESR) — a zone in the MIDDLE of a ride is kept, only start/end masked
export type Zone = { lat: number; lon: number; radiusM: number };

const distM = (lon1: number, lat1: number, lon2: number, lat2: number) => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

export const insideAny = (lon: number, lat: number, zones: Zone[]): boolean =>
  zones.some((z) => distM(lon, lat, z.lon, z.lat) <= z.radiusM);

export function trimEnds(coords: [number, number][], zones: Zone[]): [number, number][] {
  if (!zones.length || coords.length < 2) return coords;
  let start = 0;
  let end = coords.length;
  while (start < end) {
    const p = coords[start];
    if (!p || !insideAny(p[0], p[1], zones)) break;
    start++;
  }
  while (end > start + 1) {
    const p = coords[end - 1];
    if (!p || !insideAny(p[0], p[1], zones)) break;
    end--;
  }
  return coords.slice(start, end);
}
