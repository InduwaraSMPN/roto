"use client";

import { useQuery } from "@tanstack/react-query";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

import { trpc } from "@/utils/trpc";

const STYLE = process.env.NEXT_PUBLIC_TILE_URL || "https://demotiles.maplibre.org/style.json";
const PRESETS = {
  "Colombo → Kandy": [
    { lat: 6.9271, lon: 79.8612 },
    { lat: 7.2906, lon: 80.6337 },
  ],
  "Galle loop": [
    { lat: 6.0535, lon: 80.221 },
    { lat: 6.1, lon: 80.3 },
    { lat: 6.0535, lon: 80.221 },
  ],
  Ella: [
    { lat: 6.8667, lon: 81.0466 },
    { lat: 6.9, lon: 81.1 },
  ],
} as const;

// ponytail: 5-line GPX, not a shared package for one use
const toGpx = (coords: [number, number][], name: string) =>
  `<?xml version="1.0"?><gpx version="1.1" creator="roto"><trk><name>${name}</name><trkseg>${coords
    .map(([lo, la]) => `<trkpt lat="${la}" lon="${lo}"/>`)
    .join("")}</trkseg></trk></gpx>`;

export default function Plan() {
  const [preset, setPreset] = useState<keyof typeof PRESETS>("Colombo → Kandy");
  const [curvy, setCurvy] = useState(0.7);
  const [imported, setImported] = useState<{ coords: [number, number][]; km: number } | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const plan = useQuery({ ...trpc.route.plan.queryOptions({ points: [...PRESETS[preset]], curvy }), enabled: false });
  const loop = useQuery({
    ...trpc.route.roundTrip.queryOptions({ center: { lat: 6.9271, lon: 79.8612 }, km: 60, curvy }),
    enabled: false,
  });
  const shown = imported ?? loop.data ?? plan.data ?? null;

  const importFile = async (f: File | undefined) => {
    if (!f) return;
    const xml = await f.text();
    const re = /<trkpt[^>]*lat="([\d.-]+)"[^>]*lon="([\d.-]+)"|<trkpt[^>]*lon="([\d.-]+)"[^>]*lat="([\d.-]+)"/g;
    const coords: [number, number][] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      const lat = Number(m[1] ?? m[4]);
      const lon = Number(m[2] ?? m[3]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) coords.push([lon, lat]);
    }
    if (coords.length > 1) setImported({ coords, km: 0 });
  };

  useEffect(() => {
    if (!mapEl.current || map.current) return;
    map.current = new maplibregl.Map({
      container: mapEl.current,
      style: STYLE,
      center: [79.8612, 6.9271],
      zoom: 8,
    });
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const coords = shown?.coords;
    if (!m || !coords?.length) return;
    const id = "roto-route";
    const geo = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } } as const;
    const draw = () => {
      if (m.getSource(id)) {
        (m.getSource(id) as maplibregl.GeoJSONSource).setData(geo as never);
      } else {
        m.addSource(id, { type: "geojson", data: geo as never });
        m.addLayer({ id, type: "line", source: id, paint: { "line-color": "#e11d48", "line-width": 4 } });
      }
      const b = coords.reduce((a, c) => a.extend(c as [number, number]), new maplibregl.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number]));
      m.fitBounds(b, { padding: 40 });
    };
    if (m.loaded()) draw();
    else m.once("load", draw);
  }, [shown]);

  const download = () => {
    if (!shown) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toGpx(shown.coords, preset)], { type: "application/gpx+xml" }));
    a.download = "roto-ride.gpx";
    a.click();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Plan a ride</h1>
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <select value={preset} onChange={(e) => setPreset(e.target.value as keyof typeof PRESETS)} className="border rounded px-3 py-2">
          {Object.keys(PRESETS).map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <label className="flex items-center gap-2">
          Curvy {Math.round(curvy * 100)}%
          <input type="range" min={0} max={1} step={0.1} value={curvy} onChange={(e) => setCurvy(Number(e.target.value))} />
        </label>
        <button onClick={() => plan.refetch()} disabled={plan.isFetching} className="bg-green-700 text-white px-5 py-2 rounded-lg font-semibold disabled:opacity-50">
          {plan.isFetching ? "Planning…" : "Plan"}
        </button>
        <button onClick={() => loop.refetch()} disabled={loop.isFetching} className="bg-emerald-700 text-white px-5 py-2 rounded-lg font-semibold disabled:opacity-50">
          Loop 60km
        </button>
        <button onClick={() => fileRef.current?.click()} className="border px-4 py-2 rounded-lg">
          Import GPX
        </button>
        <input ref={fileRef} type="file" accept=".gpx" className="hidden" onChange={(e) => void importFile(e.target.files?.[0])} />
        {shown && (
          <>
            <span>
              {imported ? `imported · ${imported.coords.length} pts` : `${(shown as { engine: string }).engine} · ${shown.km.toFixed(0)} km`}
            </span>
            <button onClick={download} className="border px-4 py-2 rounded-lg">
              GPX
            </button>
          </>
        )}
      </div>
      {plan.error && <p className="text-red-600 mb-3">Planning failed — is the API (:3000) running?</p>}
      <div ref={mapEl} className="w-full h-[60vh] rounded-xl border" />
    </div>
  );
}
