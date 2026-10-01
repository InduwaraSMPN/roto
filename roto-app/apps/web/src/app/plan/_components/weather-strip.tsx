"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudFog, CloudLightning, CloudRain, Cloudy, Sun, TriangleAlert, Wind } from "lucide-react";

import { haversineM } from "@roto-app/core/geo";
import type { LonLat } from "@roto-app/core/types";
import { Field, FieldLabel } from "@roto-app/ui/components/field";
import { Input } from "@roto-app/ui/components/input";
import type { Planner } from "../_lib/use-planner";

type Props = { coords: LonLat[] | null; t: Planner["t"] };

type Sample = { at: string; code: number; prob: number; gust: number; distKm: number };

export function WeatherIcon({ code, className }: { code: number; className?: string }) {
  if (code >= 95) return <CloudLightning className={className} aria-hidden />;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return <CloudRain className={className} aria-hidden />;
  if (code === 45 || code === 48) return <CloudFog className={className} aria-hidden />;
  if (code >= 2 && code <= 3) return <Cloudy className={className} aria-hidden />;
  if (code === 1) return <Cloud className={className} aria-hidden />;
  return <Sun className={className} aria-hidden />;
}

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
}

// ponytail: client-side Open-Meteo, no key (plan §4.15). One call with comma-separated
// points sampled ~15 km apart, mapped to ETA at ~40 km/h. No radar overlay — RainViewer
// coverage for LK is unverified (decision D8, open).
export function WeatherStrip({ coords, t }: Props) {
  const [depart, setDepart] = useState(() => toLocalInput(new Date()));
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!coords || coords.length < 2) {
      setSamples(null);
      return;
    }
    // Sample a point every ~15 km along the route.
    const picks: { lon: number; lat: number; distKm: number }[] = [];
    let acc = 0;
    let nextAt = 0;
    for (let i = 0; i < coords.length; i++) {
      const c = coords[i];
      if (!c) continue;
      if (i > 0) {
        const p = coords[i - 1];
        if (p) acc += haversineM(p[0], p[1], c[0], c[1]) / 1000;
      }
      if (acc >= nextAt) {
        picks.push({ lon: c[0], lat: c[1], distKm: acc });
        nextAt += 15;
      }
    }
    const last = coords[coords.length - 1];
    if (last && picks.length && picks[picks.length - 1]?.distKm !== acc) {
      picks.push({ lon: last[0], lat: last[1], distKm: acc });
    }
    const start = new Date(depart);
    if (Number.isNaN(start.getTime())) return;

    const ctrl = new AbortController();
    const run = async () => {
      try {
        setFailed(false);
        const lat = picks.map((p) => p.lat.toFixed(4)).join(",");
        const lon = picks.map((p) => p.lon.toFixed(4)).join(",");
        const r = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&hourly=precipitation_probability,weather_code,wind_gusts_10m&timezone=Asia%2FColombo` +
            `&forecast_days=3&wind_speed_unit=kmh`,
          { signal: ctrl.signal },
        );
        if (!r.ok) throw new Error(`open-meteo ${r.status}`);
        const j = (await r.json()) as {
          hourly?: { time?: string[]; precipitation_probability?: number[][]; weather_code?: number[][]; wind_gusts_10m?: number[][] };
        };
        const times = j.hourly?.time ?? [];
        const out: Sample[] = picks.map((p, i) => {
          // ETA at an easy touring pace; clamp to the forecast window.
          const etaH = p.distKm / 40;
          const want = start.getTime() + etaH * 3600_000;
          let best = 0;
          let bestDiff = Infinity;
          for (let k = 0; k < times.length; k++) {
            const tk = new Date(times[k] ?? "").getTime();
            const d = Math.abs(tk - want);
            if (d < bestDiff) {
              bestDiff = d;
              best = k;
            }
          }
          return {
            at: times[best] ?? "",
            code: j.hourly?.weather_code?.[i]?.[best] ?? 0,
            prob: j.hourly?.precipitation_probability?.[i]?.[best] ?? 0,
            gust: j.hourly?.wind_gusts_10m?.[i]?.[best] ?? 0,
            distKm: p.distKm,
          };
        });
        setSamples(out);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setFailed(true);
          setSamples(null);
        }
      }
    };
    void run();
    return () => ctrl.abort();
  }, [coords, depart]);

  if (!coords || coords.length < 2) return null;

  const storm = samples?.some((s) => s.distKm <= 30 && (s.code >= 95 || s.prob >= 70)) ?? false;

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <Field>
        <FieldLabel htmlFor="roto-depart">{t.leavesAt}</FieldLabel>
        <Input
          id="roto-depart"
          type="datetime-local"
          value={depart}
          onChange={(e) => setDepart(e.target.value)}
          className="h-10"
        />
      </Field>
      {storm && (
        <p role="alert" className="flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold">
          <TriangleAlert className="h-4 w-4 flex-none" aria-hidden />
          {t.stormAhead}
        </p>
      )}
      {failed && <p className="text-sm text-muted-foreground">{t.weatherOff}</p>}
      {samples && (
        <ol className="flex gap-2 overflow-x-auto pb-1" aria-label={t.weather}>
          {samples.map((s, i) => (
            <li
              key={i}
              className="flex min-w-20 flex-col items-center gap-1 rounded-xl border px-2 py-2 text-center"
            >
              <span className="numerals text-xs font-bold">{s.distKm.toFixed(0)} {t.km}</span>
              <WeatherIcon code={s.code} className="h-5 w-5" />
              <span className="numerals text-xs text-muted-foreground">{s.prob}%</span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                <Wind className="h-3 w-3" aria-hidden />
                {s.gust.toFixed(0)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
