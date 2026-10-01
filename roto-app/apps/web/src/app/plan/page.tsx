"use client";

import * as maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { Download, LocateFixed, RefreshCcw, TriangleAlert } from "lucide-react";

import { LANGS, interpolate } from "@roto-app/core/i18n";
import type { RideMode } from "@roto-app/core/types";
import { Alert, AlertDescription, AlertTitle } from "@roto-app/ui/components/alert";
import { Button } from "@roto-app/ui/components/button";
import { Card, CardContent } from "@roto-app/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@roto-app/ui/components/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@roto-app/ui/components/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@roto-app/ui/components/select";
import { Slider } from "@roto-app/ui/components/slider";
import { Spinner } from "@roto-app/ui/components/spinner";
import { Switch } from "@roto-app/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@roto-app/ui/components/toggle-group";
import { Alternatives } from "./_components/alternatives";
import { ElevationChart } from "./_components/elevation-chart";
import { Flyover } from "./_components/flyover";
import { FoldersPanel } from "./_components/folders-panel";
import { ImportButton } from "./_components/import-button";
import { Maneuvers } from "./_components/maneuvers";
import { PlannerMap } from "./_components/planner-map";
import { NIGHT_STYLE, StyleSwitcher } from "./_components/style-switcher";
import { WaypointList } from "./_components/waypoint-list";
import { WeatherStrip } from "./_components/weather-strip";
import { usePlanner } from "./_lib/use-planner";

const MODES: RideMode[] = ["fast", "balanced", "curvy", "extra"];
const DIRS = [
  { deg: 0, key: "north" },
  { deg: 45, key: "northEast" },
  { deg: 90, key: "east" },
  { deg: 135, key: "southEast" },
  { deg: 180, key: "south" },
  { deg: 225, key: "southWest" },
  { deg: 270, key: "west" },
  { deg: 315, key: "northWest" },
] as const;

export default function Plan() {
  const p = usePlanner();
  const { t } = p;
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [styleUrl, setStyleUrl] = useState(NIGHT_STYLE);
  const [hoverDistM, setHoverDistM] = useState<number | null>(null);

  // Home links here with ?route=<curated id>. Read once on mount; useSearchParams would force a Suspense boundary.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("route");
    if (id) p.setPresetId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const curated = p.curatedRows;
  const presetOptions =
    curated.length > 0
      ? curated.map((r) => ({ id: r.id, label: r.nameEn }))
      : p.staticPresets.map((s) => ({ id: s.id, label: s.label }));
  const presetValue = p.presetId ?? presetOptions[0]?.id ?? "";
  const pickPreset = (v: string) => {
    const hit = curated.find((r) => r.id === v);
    if (hit) {
      p.setPresetId(hit.id);
      return;
    }
    const s = p.staticPresets.find((x) => x.id === v);
    if (s) {
      p.setPresetId(s.id);
      p.loadWaypoints(s.points);
    }
  };

  const shown = p.shown;
  const busy = p.busy;
  const altLines = p.loopOptions.map((o) => o.coords);

  const limits = (p.attrs?.segments ?? []).filter((s) => s.speedLimitKph !== undefined);
  const unpavedKm = (p.attrs?.segments ?? []).reduce((a, s) => a + (s.unpaved ? (s.lengthKm ?? 0) : 0), 0);

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[22rem_1fr] lg:py-8">
      <aside className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-black tracking-tight">{t.title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.subtitle}</p>
          </div>
          <Select value={p.lang} onValueChange={(v) => v && p.setLang(v as typeof p.lang)} aria-label={t.language}>
            <SelectTrigger className="h-9 w-24 flex-none" aria-label={t.language}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGS.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card size="sm">
          <CardContent>
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor="roto-preset">{t.route}</FieldLabel>
                <Select value={presetValue} onValueChange={(v) => v != null && pickPreset(v)}>
                  <SelectTrigger id="roto-preset" className="h-10 w-full">
                    <SelectValue placeholder={p.curatedList.isLoading ? "…" : t.route} />
                  </SelectTrigger>
                  <SelectContent>
                    {presetOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>{t.curatedHint}</FieldDescription>
              </Field>

              <Field>
                <FieldLabel id="roto-mode-label">{t.style}</FieldLabel>
                {/* ponytail: Base UI ToggleGroup is multi-select; single-select is emulated by keeping the last pressed value. */}
                <ToggleGroup
                  value={[p.mode]}
                  onValueChange={(v) => {
                    const last = v[v.length - 1];
                    if (last) p.setMode(last as RideMode);
                  }}
                  variant="outline"
                  aria-labelledby="roto-mode-label"
                  className="flex-wrap"
                >
                  {MODES.map((m) => (
                    <ToggleGroupItem key={m} value={m}>
                      {m === "fast" ? t.modeFast : m === "balanced" ? t.modeBalanced : m === "curvy" ? t.modeCurvy : t.modeExtra}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>

              <Field>
                <div className="flex items-baseline justify-between">
                  <FieldLabel id="roto-curvy-label">{t.twistiness}</FieldLabel>
                  <span className="numerals text-lg">{Math.round(p.curvy * 100)}%</span>
                </div>
                <Slider
                  aria-labelledby="roto-curvy-label"
                  min={0}
                  max={100}
                  step={5}
                  value={[Math.round(p.curvy * 100)]}
                  onValueChange={(v) => p.setCurvy(((Array.isArray(v) ? v[0] : v) ?? 70) / 100)}
                  className="py-2"
                />
                <FieldDescription>{t.twistHint}</FieldDescription>
              </Field>

              <Field>
                <FieldLabel id="roto-avoid-label">{t.avoid}</FieldLabel>
                <div className="flex flex-col gap-2" role="group" aria-labelledby="roto-avoid-label">
                  {(
                    [
                      ["tolls", t.avoidTolls],
                      ["ferries", t.avoidFerries],
                      ["unpaved", t.avoidUnpaved],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex min-h-10 cursor-pointer items-center justify-between gap-2 text-sm">
                      {label}
                      <Switch checked={!!p.avoid[key]} onCheckedChange={() => p.toggleAvoid(key)} aria-label={label} />
                    </label>
                  ))}
                </div>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent>
            <FieldGroup className="gap-4">
              <Field>
                <div className="flex items-baseline justify-between">
                  <FieldLabel>{t.stops}</FieldLabel>
                  <Button variant="ghost" size="sm" onClick={p.useMyLocation}>
                    <LocateFixed />
                    {t.myLocation}
                  </Button>
                </div>
                <WaypointList
                  waypoints={p.waypoints}
                  onMove={p.moveWaypoint}
                  onRemove={p.removeWaypoint}
                  onRename={p.renameWaypoint}
                  t={t}
                />
                <FieldDescription>{t.addStopHint}</FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <div className="grid gap-2">
          <Button size="lg" onClick={p.doPlan} disabled={busy || p.waypoints.length < 2} className="h-11 text-base font-bold">
            {p.plan.isFetching && <Spinner />}
            {p.plan.isFetching ? t.planning : t.planRoute}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" onClick={p.drawLoop} disabled={busy}>
              {p.loop.isFetching ? <Spinner /> : <RefreshCcw />}
              {p.loop.isFetching ? t.drawing : `${p.loopKm} ${t.km} ${t.loop}`}
            </Button>
            <Flyover mapRef={mapRef} coords={shown?.coords ?? null} t={t} />
          </div>
          <ImportButton
            onUseCoords={p.useImported}
            onPlanWaypoints={p.loadWaypoints}
            onSnap={p.snapImported}
            hasImport={p.imported !== null}
            onClear={p.clearImported}
            t={t}
          />
        </div>

        <Card size="sm">
          <CardContent>
            <FieldGroup className="gap-4">
              <Field>
                <div className="flex items-baseline justify-between">
                  <FieldLabel id="roto-loop-label">{t.loop}</FieldLabel>
                  <span className="numerals text-lg">{p.loopKm} {t.km}</span>
                </div>
                <Slider
                  aria-labelledby="roto-loop-label"
                  min={20}
                  max={300}
                  step={10}
                  value={[p.loopKm]}
                  onValueChange={(v) => p.setLoopKm((Array.isArray(v) ? v[0] : v) ?? 60)}
                  className="py-2"
                />
                <FieldDescription>{t.loopHint}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel id="roto-dir-label">{t.direction}</FieldLabel>
                <div className="grid grid-cols-5 gap-1" role="group" aria-labelledby="roto-dir-label">
                  <Button
                    variant={p.loopDirection === undefined ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => p.setLoopDirection(undefined)}
                    className="col-span-2"
                  >
                    {t.anyDirection}
                  </Button>
                  {DIRS.map((d) => (
                    <Button
                      key={d.deg}
                      variant={p.loopDirection === d.deg ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => p.setLoopDirection(p.loopDirection === d.deg ? undefined : d.deg)}
                      aria-pressed={p.loopDirection === d.deg}
                      aria-label={`${t.direction} ${t[d.key as keyof typeof t]}`}
                    >
                      {t[d.key as keyof typeof t]}
                    </Button>
                  ))}
                  <Button variant="ghost" size="sm" onClick={p.shuffle} disabled={busy} className="col-span-2">
                    <RefreshCcw />
                    {t.shuffle}
                  </Button>
                </div>
              </Field>
              <Alternatives options={p.loopOptions} selected={p.loopIdx} onSelect={p.showLoop} t={t} />
            </FieldGroup>
          </CardContent>
        </Card>

        {(p.error) && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>{t.failedPlan}</AlertTitle>
            <AlertDescription>{t.offlineHint}</AlertDescription>
          </Alert>
        )}

        {shown && (
          <Card size="sm" aria-live="polite">
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="numerals text-3xl">
                    {p.source === "import" ? shown.coords.length : shown.km.toFixed(0)}
                    <span className="ml-1 text-sm font-semibold text-muted-foreground">
                      {p.source === "import" ? t.points : t.km}
                    </span>
                    {p.source !== "import" && (
                      <span className="numerals ml-2 text-lg text-muted-foreground">
                        {shown.min.toFixed(0)} {t.min}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {p.source === "import"
                      ? t.importedRoute
                      : interpolate(t.viaEngine, { engine: shown.engine })}
                  </p>
                </div>
                <Button variant="outline" onClick={p.downloadGpx}>
                  <Download />
                  {t.exportGpx}
                </Button>
              </div>
              {p.attrs && limits.length > 0 && (
                <p className="numerals text-xs text-muted-foreground">
                  {t.speedLimit} {Math.min(...limits.map((s) => s.speedLimitKph ?? 0))}–
                  {Math.max(...limits.map((s) => s.speedLimitKph ?? 0))} km/h
                  {unpavedKm > 0.5 && ` · ${unpavedKm.toFixed(0)} ${t.km} ${t.unpaved}`}
                </p>
              )}
              {shown && !p.attrsLoading && limits.length === 0 && (
                <p className="text-xs text-muted-foreground">{t.noLimits}</p>
              )}
              <Maneuvers maneuvers={shown.maneuvers} capable={shown.capabilities.maneuvers} t={t} />
              <ElevationChart elevation={p.elevation} loading={p.elevLoading} onHover={setHoverDistM} t={t} />
              <WeatherStrip coords={shown.coords} t={t} />
            </CardContent>
          </Card>
        )}

        <FoldersPanel t={t} />
      </aside>

      <section aria-label={t.title} className="flex flex-col gap-2">
        <div className="relative h-[60vh] min-h-[420px] w-full overflow-hidden rounded-2xl border lg:h-[calc(100svh-9rem)]">
          {!shown && !busy && (
            <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
              <Empty className="max-w-sm flex-none border bg-background/95 py-4 backdrop-blur">
                <EmptyHeader>
                  <EmptyTitle>{t.emptyTitle}</EmptyTitle>
                  <EmptyDescription>{t.emptyHint}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          )}
          <PlannerMap
            waypoints={p.waypoints}
            onMoveWaypoint={p.setWaypointCoord}
            onInsertWaypoint={p.insertWaypoint}
            main={shown?.coords ?? null}
            alternatives={p.source === "loop" ? altLines.filter((_, i) => i !== p.loopIdx) : []}
            surface={p.attrs?.segments ?? null}
            hoverDistM={hoverDistM}
            styleUrl={styleUrl}
            mapRef={mapRef}
            t={t}
          />
          <div className="absolute top-3 left-3 z-10">
            <StyleSwitcher value={styleUrl} onChange={setStyleUrl} t={t} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t.attribution}</p>
      </section>
    </div>
  );
}
