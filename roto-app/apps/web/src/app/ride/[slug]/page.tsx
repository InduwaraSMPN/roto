// Public ride page with replay scrubber: an input range moves a marker along
// samples (preferred) or plain coords.
"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Download, Smartphone, TriangleAlert } from "lucide-react";

import { coordsToGpx } from "@roto-app/core/gpx";

import { Alert, AlertDescription, AlertTitle } from "@roto-app/ui/components/alert";
import { Button } from "@roto-app/ui/components/button";
import { buttonVariants } from "@roto-app/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@roto-app/ui/components/card";
import { Skeleton } from "@roto-app/ui/components/skeleton";
import { Slider } from "@roto-app/ui/components/slider";
import { cn } from "@roto-app/ui/lib/utils";

import RouteMap from "@/components/route-map";
import SeriesChart from "@/components/series-chart";
import { tx, useLang } from "@/lib/lang";
import { futureQuery } from "@/lib/future";

import { dict } from "./_components/i18n";

type Sample = { t: number; lon: number; lat: number; spd?: number; ele?: number; lean?: number };
type SharedRide = {
  name?: string;
  distanceKm?: number | null;
  movingS?: number | null;
  durationS?: number | null;
  avgSpeedKmh?: number | null;
  maxSpeedKmh?: number | null;
  hideMaxSpeed?: boolean | null;
  elevationGainM?: number | null;
  maxLeanDeg?: number | null;
  coords?: [number, number][] | null;
  samples?: Sample[] | null;
  photos?: { url: string; lat?: number | null; lon?: number | null; caption?: string | null }[] | null;
};

export default function SharedRidePage() {
  const { slug } = useParams<{ slug: string }>();
  const { lang } = useLang();
  const t = (k: string) => tx(lang, { en: dict.en[k] ?? k, si: dict.si[k] ?? k, ta: dict.ta[k] ?? k });
  const [pos, setPos] = useState(0);

  // rides.bySlug is parallel-built; guarded so the page renders a fallback until it lands.
  const shared = useQuery({
    queryKey: ["rides-bySlug", slug],
    queryFn: () => futureQuery<SharedRide>("rides.bySlug", { slug }),
    retry: false,
  });
  const ride = (shared.data ?? null) as SharedRide | null;

  const track: [number, number][] = useMemo(() => {
    if (ride?.samples?.length) return ride.samples.map((s) => [s.lon, s.lat]);
    if (Array.isArray(ride?.coords) && ride!.coords!.length > 1) return ride!.coords as [number, number][];
    return [];
  }, [ride]);
  const clamped = track.length ? Math.min(pos, track.length - 1) : 0;
  const markerPoint = track[clamped] as [number, number] | undefined;
  const speedSeries = useMemo(() => (ride?.samples ?? []).map((s) => (s.spd != null ? s.spd * 3.6 : 0)), [ride]);
  const eleSeries = useMemo(
    () => (ride?.samples ?? []).map((s) => s.ele).filter((e): e is number => typeof e === "number"),
    [ride],
  );
  const atSpeed = ride?.samples?.[clamped]?.spd != null ? ((ride.samples[clamped]!.spd as number) * 3.6).toFixed(0) : null;

  const download = () => {
    if (!track.length) return;
    const xml = coordsToGpx(track, ride?.name ?? "roto-ride", "track");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([xml], { type: "application/gpx+xml" }));
    a.download = `roto-ride-${slug}.gpx`;
    a.click();
  };

  if (shared.isLoading) {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-4 px-4 pt-10 pb-16 sm:px-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-[60vh] min-h-[320px]" />
      </div>
    );
  }
  if (shared.isError || !ride || !track.length) {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-4 px-4 pt-10 pb-16 sm:px-6">
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>{t("missing")}</AlertTitle>
          <AlertDescription>{t("missingSub")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const showMax = !ride.hideMaxSpeed;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 pt-10 pb-16 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">{ride.name ?? "Ride"}</h1>
        <dl className="mt-4 flex flex-wrap gap-6">
          <div>
            <dt className="text-sm text-muted-foreground">km</dt>
            <dd className="numerals text-3xl">{ride.distanceKm != null ? ride.distanceKm.toFixed(1) : "–"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">avg km/h</dt>
            <dd className="numerals text-3xl">{ride.avgSpeedKmh != null ? ride.avgSpeedKmh.toFixed(0) : "–"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">max km/h</dt>
            <dd className="numerals text-3xl" title={showMax ? undefined : t("hiddenMax")}>
              {showMax ? (ride.maxSpeedKmh != null ? ride.maxSpeedKmh.toFixed(0) : "–") : "–"}
            </dd>
          </div>
          {ride.maxLeanDeg != null && (
            <div>
              <dt className="text-sm text-muted-foreground">max lean</dt>
              <dd className="numerals text-3xl">{ride.maxLeanDeg.toFixed(0)}°</dd>
            </div>
          )}
        </dl>
      </div>

      <RouteMap
        coords={track}
        marker={markerPoint ? { lon: markerPoint[0], lat: markerPoint[1], label: "Replay position" } : null}
        ariaLabel="Ride replay map"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">{t("replay")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">{t("scrubHint")}</span>
            <span className="numerals font-bold">
              {clamped + 1} / {track.length}
              {atSpeed != null ? ` · ${atSpeed} km/h` : ""}
            </span>
          </div>
          <Slider
            aria-label={t("replay")}
            min={0}
            max={track.length - 1}
            step={1}
            value={[clamped]}
            onValueChange={(v) => setPos(Array.isArray(v) ? (v[0] ?? 0) : (v ?? 0))}
            className="py-2"
          />
          <p className="text-xs text-muted-foreground">{t("flyover")}</p>
        </CardContent>
      </Card>

      {speedSeries.length > 1 && (
        <Card>
          <CardContent className="pt-5">
            <SeriesChart values={speedSeries} label="Speed" unit="km/h" color="#16A34A" />
          </CardContent>
        </Card>
      )}
      {eleSeries.length > 1 && (
        <Card>
          <CardContent className="pt-5">
            <SeriesChart values={eleSeries} label="Elevation" unit="m" />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">{t("photos")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!ride.photos?.length ? (
            <p className="text-sm text-muted-foreground">{t("noPhotos")}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ride.photos.map((p, i) => (
                // ponytail: plain img (not next/image) — photo hosts are user Blob URLs, not allowlisted domains.
                <li key={i}>
                  <img src={p.url} alt={p.caption ?? `Ride photo ${i + 1}`} className="aspect-square w-full rounded-xl border object-cover" loading="lazy" />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={download} className="h-11 font-bold">
          <Download />
          {t("downloadGpx")}
        </Button>
        <Link href={`roto-app://ride/${encodeURIComponent(slug)}`} className={cn(buttonVariants({ variant: "secondary" }), "h-11")}>
          <Smartphone />
          {t("openInApp")}
        </Link>
      </div>
    </div>
  );
}
