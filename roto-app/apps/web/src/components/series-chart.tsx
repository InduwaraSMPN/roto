// ponytail: plain SVG sparkline/area charts — no chart lib needed for single-series
// elevation/speed profiles, and SVGs print cleanly in the export view.
"use client";

export default function SeriesChart({
  values,
  label,
  unit,
  color = "#FFB300",
  height = 120,
}: {
  values: number[];
  label: string;
  unit: string;
  color?: string;
  height?: number;
}) {
  const width = 600;
  if (values.length < 2) {
    return <p className="text-sm text-muted-foreground">Not enough points for a {label.toLowerCase()} chart.</p>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => [i * step, height - 8 - ((v - min) / span) * (height - 24)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} chart`} className="h-auto w-full">
        <path d={`${line}L${width} ${height}L0 ${height}Z`} fill={color} opacity={0.18} />
        <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <figcaption className="mt-1 flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="numerals font-bold">
          {min.toFixed(0)}–{max.toFixed(0)} {unit}
        </span>
      </figcaption>
    </figure>
  );
}
