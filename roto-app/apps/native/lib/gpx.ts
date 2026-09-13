// ponytail: regex GPX, not an XML dep — tracks only, waypoints ignored
export function parseGpxTrack(xml: string): [number, number][] {
  const pts: [number, number][] = [];
  const re = /<trkpt[^>]*lat="([\d.-]+)"[^>]*lon="([\d.-]+)"|<trkpt[^>]*lon="([\d.-]+)"[^>]*lat="([\d.-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const lat = Number(m[1] ?? m[4]);
    const lon = Number(m[2] ?? m[3]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) pts.push([lon, lat]);
  }
  return pts;
}
