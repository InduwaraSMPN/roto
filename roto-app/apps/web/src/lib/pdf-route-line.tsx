// Route line as an inline SVG for PDF documents (plan §4.7). Same equirectangular projection
// with a cos(lat) squash as the on-screen `RouteTrace`, so the printed shape matches the map.
//
// ponytail: equirectangular with a cos(lat) squash is plenty at island scale. A Web Mercator
// projection is only worth it if a shared route ever spans more than a few degrees.
import { Path, Rect, Svg } from "@/lib/pdf-svg";

type LonLat = [number, number];

/** Douglas-Peucker-ish decimation by index stride: the line has no vertices worth keeping
 *  beyond what fits legibly in print. Keeps the last point so the end marker is the real end. */
function decimate(coords: LonLat[], maxPoints: number): LonLat[] {
  if (coords.length <= maxPoints) return coords;
  const step = Math.ceil(coords.length / maxPoints);
  const out: LonLat[] = [];
  for (let i = 0; i < coords.length; i += step) out.push(coords[i] as LonLat);
  const last = coords[coords.length - 1];
  if (last) out.push(last);
  return out;
}

export function projectRoute(coords: LonLat[], width: number, height: number, pad: number) {
  const pts = decimate(coords, 500);
  const midLat = pts.reduce((s, [, la]) => s + la, 0) / pts.length;
  const k = Math.cos((midLat * Math.PI) / 180);
  const xs = pts.map(([lo]) => lo * k);
  const ys = pts.map(([, la]) => la);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  // Uniform scale on both axes so the shape is not distorted; the shorter axis is centred.
  const scale = (Math.min(width, height) - pad * 2) / Math.max(spanX, spanY);
  const drawW = spanX * scale;
  const drawH = spanY * scale;
  const offX = (width - drawW) / 2;
  const offY = (height - drawH) / 2;
  return {
    path: pts
      .map((_, i) => {
        const x = offX + ((xs[i] ?? 0) - minX) * scale;
        const y = height - (offY + ((ys[i] ?? 0) - minY) * scale);
        return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(""),
    start: {
      x: offX + ((xs[0] ?? 0) - minX) * scale,
      y: height - (offY + ((ys[0] ?? 0) - minY) * scale),
    },
    end: {
      x: offX + ((xs[xs.length - 1] ?? 0) - minX) * scale,
      y: height - (offY + ((ys[ys.length - 1] ?? 0) - minY) * scale),
    },
  };
}

/** Road bed under the signal line, start/end markers, all as one SVG. Returned as elements so
 *  the caller can place it between sections; sizes itself to the page width. */
export function coordsToPolylineSvg(
  coords: LonLat[],
  signal: string,
  options?: { asphalt?: string; ink?: string },
): React.ReactNode {
  const width = 480;
  // Sized so the route line and the elevation profile both fit on page one of A4 with the
  // header and stats above them; the graph refuses to split across a page break, so a taller
  // drawing pushes it onto page two and leaves a gap.
  const height = 210;
  const pad = 18;
  const { path, start, end } = projectRoute(coords, width, height, pad);
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Rect x={0} y={0} width={width} height={height} fill="#FAFAFA" />
      <Path d={path} fill="none" stroke={options?.asphalt ?? "#E5E7EB"} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d={path} fill="none" stroke={signal} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        d={`M${start.x - 5} ${start.y} a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0`}
        fill="#FFFFFF"
        stroke={options?.ink ?? "#111827"}
        strokeWidth={2}
      />
      <Path d={`M${end.x - 5} ${end.y} a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0`} fill={options?.ink ?? "#111827"} />
    </Svg>
  );
}
