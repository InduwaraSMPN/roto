"use client";

import * as maplibregl from "maplibre-gl";
import { useState, type RefObject } from "react";
import { Plane } from "lucide-react";

import { bearing, simplify } from "@roto-app/core/geo";
import type { LonLat } from "@roto-app/core/types";
import { Button } from "@roto-app/ui/components/button";
import type { Planner } from "../_lib/use-planner";

type Props = { mapRef: RefObject<maplibregl.Map | null>; coords: LonLat[] | null; t: Planner["t"] };

export function Flyover({ mapRef, coords, t }: Props) {
  const [flying, setFlying] = useState(false);

  const fly = async () => {
    const m = mapRef.current;
    if (!m || !coords || coords.length < 2 || flying) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bounds = coords.reduce(
      (a, c) => a.extend(c as [number, number]),
      new maplibregl.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number]),
    );
    if (reduced) {
      m.fitBounds(bounds, { padding: 48 });
      return;
    }
    // ponytail: chained easeTo over ≤24 simplified frames, not a terrain fly-through —
    // DEM tiles are tiles-agent work; this is a cinematic preview on the flat style.
    const frames = simplify(coords, 150);
    const step = Math.max(1, Math.ceil(frames.length / 24));
    const stops = frames.filter((_, i) => i % step === 0);
    setFlying(true);
    try {
      m.fitBounds(bounds, { padding: 48, duration: 600 });
      await new Promise((r) => setTimeout(r, 650));
      for (let i = 0; i < stops.length && mapRef.current; i++) {
        const a = stops[i];
        const b = stops[i + 1] ?? stops[i];
        if (!a || !b) continue;
        const bng = bearing(a[0], a[1], b[0], b[1]);
        m.easeTo({ center: a as [number, number], zoom: 13.5, pitch: 60, bearing: bng, duration: 900 });
        await new Promise((r) => setTimeout(r, 950));
      }
    } finally {
      setFlying(false);
      m.easeTo({ pitch: 0, bearing: 0, duration: 500 });
    }
  };

  return (
    <Button variant="secondary" size="sm" onClick={() => void fly()} disabled={!coords || coords.length < 2 || flying}>
      <Plane />
      {flying ? t.flying : t.flyover}
    </Button>
  );
}
