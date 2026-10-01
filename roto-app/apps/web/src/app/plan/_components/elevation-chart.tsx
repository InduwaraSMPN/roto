"use client";

import { useMemo, useState } from "react";

import type { Planner } from "../_lib/use-planner";

type Props = {
  elevation?: { distM: number[]; heightM: number[] } | null;
  loading?: boolean;
  onHover: (distM: number | null) => void;
  t: Planner["t"];
};

const W = 300;
const H = 110;
const PAD = 8;

export function ElevationChart({ elevation, loading, onHover, t }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    if (!elevation || elevation.heightM.length < 2) return null;
    const hs = elevation.heightM;
    const ds = elevation.distM;
    let min = Infinity;
    let max = -Infinity;
    let gain = 0;
    let loss = 0;
    for (let i = 0; i < hs.length; i++) {
      const h = hs[i] ?? 0;
      if (h < min) min = h;
      if (h > max) max = h;
      if (i > 0) {
        const d = h - (hs[i - 1] ?? h);
        if (d > 0) gain += d;
        else loss -= d;
      }
    }
    const span = Math.max(1, max - min);
    const x = (i: number) => PAD + (i / (hs.length - 1)) * (W - PAD * 2);
    const y = (h: number) => PAD + (1 - (h - min) / span) * (H - PAD * 2 - 14);
    const line = hs.map((h, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(h).toFixed(1)}`).join(" ");
    const lastX = x(hs.length - 1).toFixed(1);
    const firstX = x(0).toFixed(1);
    return { min, max, gain, loss, line, area: `${line} L${lastX},${H} L${firstX},${H} Z`, x, count: hs.length, ds };
  }, [elevation]);

  if (loading) {
    return (
      <div aria-label={t.elevation} className="flex h-28 items-center justify-center rounded-xl border text-sm text-muted-foreground">
        {t.planning}
      </div>
    );
  }
  if (!model) {
    return (
      <div aria-label={t.elevation} className="flex h-28 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        {t.noElevation}
      </div>
    );
  }

  const setIdx = (i: number | null) => {
    setHover(i);
    onHover(i === null || !model ? null : (model.ds[i] ?? null));
  };

  return (
    <figure className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <figcaption className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t.elevation}</figcaption>
        <p className="numerals text-xs text-muted-foreground">
          ↑{model.gain.toFixed(0)}m · ↓{model.loss.toFixed(0)}m · {t.climb} {model.max.toFixed(0)}m
        </p>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        tabIndex={0}
        aria-label={`${t.elevation}: ${t.climb} ${model.gain.toFixed(0)}m, ${t.descent} ${model.loss.toFixed(0)}m`}
        className="h-28 w-full rounded-xl border"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
          setIdx(Math.round(f * (model.count - 1)));
        }}
        onMouseLeave={() => setIdx(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setIdx(Math.max(0, (hover ?? 0) - 1));
          else if (e.key === "ArrowRight") setIdx(Math.min(model.count - 1, (hover ?? 0) + 1));
          else if (e.key === "Escape") setIdx(null);
          else return;
          e.preventDefault();
        }}
      >
        <path d={model.area} fill="#FFB300" opacity={0.25} />
        <path d={model.line} fill="none" stroke="#FFB300" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {hover !== null && (
          <line x1={model.x(hover)} x2={model.x(hover)} y1={0} y2={H} stroke="#F2EFE6" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
    </figure>
  );
}
