"use client";

import { useQuery } from "@tanstack/react-query";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

import { Button } from "@roto-app/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@roto-app/ui/components/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@roto-app/ui/components/select";
import { Slider } from "@roto-app/ui/components/slider";
import { trpc } from "@/utils/trpc";
import { authClient } from "@/lib/auth-client";

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
  const { data: session } = authClient.useSession();
  const zonesQuery = useQuery({ ...trpc.privacy.list.queryOptions(), enabled: !!session?.user });
  const trim = (coords: [number, number][]): [number, number][] => {
    const zones = (zonesQuery.data ?? []).map((z) => ({ lat: z.lat, lon: z.lon, radiusM: z.radiusM }));
    if (!zones.length || coords.length < 2) return coords;
    const inside = (lon: number, lat: number) =>
      zones.some((z) => {
        const R = 6371000;
        const dLa = ((lat - z.lat) * Math.PI) / 180;
        const dLo = ((lon - z.lon) * Math.PI) / 180;
        const s = Math.sin(dLa / 2) ** 2 + Math.cos((z.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLo / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(s)) <= z.radiusM;
      });
    let s = 0;
    let e = coords.length;
    while (s < e && coords[s] && inside(coords[s][0], coords[s][1])) s++;
    while (e > s + 1 && coords[e - 1] && inside(coords[e - 1][0], coords[e - 1][1])) e--;
    return coords.slice(s, e);
  };
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
        m.addLayer({ id, type: "line", source: id, paint: { "line-color": "#FFB300", "line-width": 4 } });
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
    a.href = URL.createObjectURL(new Blob([toGpx(trim(shown.coords), preset)], { type: "application/gpx+xml" }));
    a.download = "roto-ride.gpx";
    a.click();
  };

  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Plan a ride</h1>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Pick a preset, tune the twistiness, and preview it on the map. Export
          GPX for the phone — privacy zones trim the start and end on export.
        </p>
      </div>
      <div
        role="group"
        aria-label="Route controls"
        className="mb-4 rounded-2xl border bg-card p-4 text-card-foreground"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-44 flex-1">
            <label
              htmlFor="roto-preset"
              className="mb-1.5 block text-xs font-semibold text-muted-foreground"
            >
              Route preset
            </label>
            <Select value={preset} onValueChange={(v) => setPreset(v as keyof typeof PRESETS)}>
              <SelectTrigger id="roto-preset" aria-label="Route preset" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(PRESETS).map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-44 flex-1">
            <span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>Twistiness</span>
              <span className="font-bold tabular-nums text-foreground">
                {Math.round(curvy * 100)}%
              </span>
            </span>
            <Slider
              aria-label="Twistiness"
              min={0}
              max={100}
              step={10}
              value={[Math.round(curvy * 100)]}
              onValueChange={(v) => setCurvy(((Array.isArray(v) ? v[0] : v) ?? 70) / 100)}
              className="h-10"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            onClick={() => plan.refetch()}
            disabled={plan.isFetching || loop.isFetching}
            className="min-h-10 font-bold"
          >
            {plan.isFetching ? "Planning…" : "Plan route"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => loop.refetch()}
            disabled={plan.isFetching || loop.isFetching}
            className="min-h-10 font-bold"
          >
            {loop.isFetching ? "Drawing…" : "Loop 60 km"}
          </Button>
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            className="min-h-10"
          >
            Import GPX
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".gpx"
            aria-label="Import a GPX file"
            className="hidden"
            onChange={(e) => void importFile(e.target.files?.[0])}
          />
          {shown && (
            <>
              <span
                aria-live="polite"
                className="text-sm font-semibold tabular-nums"
              >
                {imported
                  ? `Imported · ${imported.coords.length} pts`
                  : `${(shown as { engine: string }).engine} · ${shown.km.toFixed(0)} km`}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={download}
                className="min-h-9"
              >
                Export GPX
              </Button>
            </>
          )}
        </div>
      </div>
      {(plan.error || loop.error) && (
        <p role="alert" className="mb-3 text-sm font-medium text-destructive">
          Planning failed — check the connection and try again. Offline packs on
          the phone still work.
        </p>
      )}
      <div className="relative">
        {!shown && !plan.isFetching && !loop.isFetching && (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
            <Empty className="border bg-background/95 py-4 shadow-lg backdrop-blur">
              <EmptyHeader>
                <EmptyTitle className="text-base">No route yet</EmptyTitle>
                <EmptyDescription>Pick a preset and press Plan route — or draw a 60 km loop.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
        <div
          ref={mapEl}
          role="application"
          aria-label="Route preview map"
          className="h-[60vh] w-full rounded-2xl border"
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Map data © OpenMapTiles © OpenStreetMap contributors
      </p>
    </div>
  );
}
