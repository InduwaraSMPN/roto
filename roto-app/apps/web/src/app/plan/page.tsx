"use client";

import { useQuery } from "@tanstack/react-query";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

import { Download, RefreshCcw, TriangleAlert, Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@roto-app/ui/components/alert";
import { Button } from "@roto-app/ui/components/button";
import { Card, CardContent } from "@roto-app/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@roto-app/ui/components/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@roto-app/ui/components/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@roto-app/ui/components/select";
import { Slider } from "@roto-app/ui/components/slider";
import { Spinner } from "@roto-app/ui/components/spinner";
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
  const [curvy, setCurvy] = useState(0.7);
  const [imported, setImported] = useState<{ coords: [number, number][]; km: number } | null>(null);
  const [curatedId, setCuratedId] = useState<string | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const curatedList = useQuery(trpc.curated.list.queryOptions({}));
  const curatedGet = useQuery({
    ...trpc.curated.get.queryOptions({ id: curatedId ?? "" }),
    enabled: curatedId !== null,
  });
  const curatedCoords = (curatedGet.data?.coords as [number, number][] | undefined) ?? null;
  // Curated presets come from the DB (Valhalla-generated); static points are the offline fallback.
  const PRESET_OPTIONS = (curatedList.data ?? []).map((r) => ({ id: r.id, label: r.nameEn }));
  const preset: string = curatedId ?? "Colombo → Kandy";
  const setPreset = (v: string) => {
    const hit = (curatedList.data ?? []).find((r) => r.id === v || r.nameEn === v);
    if (hit) {
      setCuratedId(hit.id);
    } else if (v in PRESETS) {
      setCuratedId(null);
    }
    // Unknown values are ignored so the Select never lands on a dead option.
  };
  const fallbackKey = (Object.keys(PRESETS) as (keyof typeof PRESETS)[]).includes(preset as keyof typeof PRESETS)
    ? (preset as keyof typeof PRESETS)
    : "Colombo → Kandy";
  // Stabilized label: curated name, or the static fallback name.
  const presetLabel =
    (curatedList.data ?? []).find((r) => r.id === curatedId)?.nameEn ?? fallbackKey;
  const presetPoints: { lat: number; lon: number }[] =
    curatedCoords?.map(([lon, lat]) => ({ lat, lon })) ?? [...PRESETS[fallbackKey]];

  const plan = useQuery({ ...trpc.route.plan.queryOptions({ points: presetPoints, curvy }), enabled: false });
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

  // Home links here with ?route=<curated id>. Read once on mount; useSearchParams would force a Suspense boundary.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("route");
    if (id) setCuratedId(id);
  }, []);

  const busy = plan.isFetching || loop.isFetching;
  const presetItems =
    PRESET_OPTIONS.length > 0 ? PRESET_OPTIONS : Object.keys(PRESETS).map((k) => ({ id: k, label: k }));

  const download = () => {
    if (!shown) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toGpx(trim(shown.coords), presetLabel)], { type: "application/gpx+xml" }));
    a.download = "roto-ride.gpx";
    a.click();
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[22rem_1fr] lg:py-8">
      <aside className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Plan a ride</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Pick a road, set how twisty it should be, then send the GPX to your phone. Privacy zones trim
            the start and end before the file leaves this page.
          </p>
        </div>

        <Card size="sm">
          <CardContent>
            <FieldGroup className="gap-6">
              <Field>
                <FieldLabel htmlFor="roto-preset">Route</FieldLabel>
                <Select
                  value={preset}
                  items={presetItems.map((o) => ({ value: o.id, label: o.label }))}
                  onValueChange={(v) => v != null && setPreset(v)}
                >
                  <SelectTrigger id="roto-preset" className="h-10 w-full">
                    <SelectValue placeholder={curatedList.isLoading ? "Loading routes…" : "Pick a route"} />
                  </SelectTrigger>
                  <SelectContent>
                    {presetItems.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>Curated roads come from the server. Three built-in ones work offline.</FieldDescription>
              </Field>
              <Field>
                <div className="flex items-baseline justify-between">
                  <FieldLabel id="roto-curvy-label">Twistiness</FieldLabel>
                  <span className="numerals text-lg">{Math.round(curvy * 100)}%</span>
                </div>
                <Slider
                  aria-labelledby="roto-curvy-label"
                  min={0}
                  max={100}
                  step={10}
                  value={[Math.round(curvy * 100)]}
                  onValueChange={(v) => setCurvy(((Array.isArray(v) ? v[0] : v) ?? 70) / 100)}
                  className="py-2"
                />
                <FieldDescription>Higher prefers hill roads over main roads.</FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <div className="grid gap-2">
          <Button size="lg" onClick={() => plan.refetch()} disabled={busy} className="h-11 text-base font-bold">
            {plan.isFetching && <Spinner />}
            {plan.isFetching ? "Planning" : "Plan route"}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" onClick={() => loop.refetch()} disabled={busy}>
              {loop.isFetching ? <Spinner /> : <RefreshCcw />}
              {loop.isFetching ? "Drawing" : "60 km loop"}
            </Button>
            <Button variant="outline" size="lg" onClick={() => fileRef.current?.click()}>
              <Upload />
              Import GPX
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".gpx"
            aria-label="Import a GPX file"
            className="hidden"
            onChange={(e) => void importFile(e.target.files?.[0])}
          />
        </div>

        {(plan.error || loop.error) && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Couldn&apos;t plan this route</AlertTitle>
            <AlertDescription>
              Check the connection and try again. Offline packs on the phone still work.
            </AlertDescription>
          </Alert>
        )}

        {shown && (
          <Card size="sm" aria-live="polite">
            <CardContent className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="numerals text-3xl">
                  {imported ? imported.coords.length : shown.km.toFixed(0)}
                  <span className="ml-1 text-sm font-semibold text-muted-foreground">
                    {imported ? "points" : "km"}
                  </span>
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {imported ? "Imported GPX" : `${presetLabel}, via ${(shown as { engine: string }).engine}`}
                </p>
              </div>
              <Button variant="outline" onClick={download}>
                <Download />
                Export GPX
              </Button>
            </CardContent>
          </Card>
        )}
      </aside>

      <section aria-label="Route preview" className="flex flex-col gap-2">
        <div className="relative">
          {!shown && !busy && (
            <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
              <Empty className="max-w-sm flex-none border bg-background/95 py-4 backdrop-blur">
                <EmptyHeader>
                  <EmptyTitle>No route yet</EmptyTitle>
                  <EmptyDescription>Pick a road and press Plan route, or draw a 60 km loop.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          )}
          <div
            ref={mapEl}
            role="application"
            aria-label="Route preview map"
            className="h-[60vh] min-h-[420px] w-full overflow-hidden rounded-2xl border lg:h-[calc(100svh-9rem)]"
          />
        </div>
        <p className="text-xs text-muted-foreground">Map data © OpenMapTiles © OpenStreetMap contributors</p>
      </section>
    </div>
  );
}