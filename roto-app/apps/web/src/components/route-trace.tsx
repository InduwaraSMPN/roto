import { cn } from "@roto-app/ui/lib/utils";

// ponytail: equirectangular projection with a cos(lat) squash is plenty at island scale; swap for
// maplibre's projection only if traces ever span more than a few degrees.
function toPath(coords: [number, number][], size: number, pad: number) {
  const step = Math.max(1, Math.floor(coords.length / 400));
  const pts = coords.filter((_, i) => i % step === 0 || i === coords.length - 1);
  const midLat = pts.reduce((s, [, la]) => s + la, 0) / pts.length;
  const k = Math.cos((midLat * Math.PI) / 180);
  const xs = pts.map(([lo]) => lo * k);
  const ys = pts.map(([, la]) => la);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1;
  const scale = (size - pad * 2) / span;
  const offX = (size - (Math.max(...xs) - minX) * scale) / 2;
  const offY = (size - (Math.max(...ys) - minY) * scale) / 2;
  const proj = pts.map((_, i) => [
    offX + ((xs[i] ?? 0) - minX) * scale,
    size - (offY + ((ys[i] ?? 0) - minY) * scale),
  ]);
  const d = proj.map(([x, y], i) => `${i ? "L" : "M"}${x?.toFixed(1)} ${y?.toFixed(1)}`).join("");
  return { d, start: proj[0] ?? [0, 0], end: proj[proj.length - 1] ?? [0, 0] };
}

export function RouteTrace({
  coords,
  className,
  label,
}: {
  coords: [number, number][];
  className?: string;
  label: string;
}) {
  const size = 400;
  const { d, start, end } = toPath(coords, size, 28);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      className={cn("h-auto w-full", className)}
    >
      {/* Road bed under the signal line, like a lane on asphalt. */}
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.12}
        strokeWidth={14}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={d}
        pathLength={1}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="route-draw"
      />
      <circle cx={start[0]} cy={start[1]} r={7} fill="var(--road)" stroke="currentColor" strokeWidth={3} />
      <circle cx={end[0]} cy={end[1]} r={7} fill="currentColor" />
    </svg>
  );
}
