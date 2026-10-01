// Public route page: map, elevation chart, stats, GPX download, Open-in-app deep link.
"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Download, FileText, ListOrdered, Printer, Smartphone, TriangleAlert } from "lucide-react";

import { coordsToGpx } from "@roto-app/core/gpx";

import { Alert, AlertDescription, AlertTitle } from "@roto-app/ui/components/alert";
import { Button } from "@roto-app/ui/components/button";
import { buttonVariants } from "@roto-app/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@roto-app/ui/components/card";
import { Skeleton } from "@roto-app/ui/components/skeleton";
import { cn } from "@roto-app/ui/lib/utils";

import RouteMap from "@/components/route-map";
import SeriesChart from "@/components/series-chart";
import { tx, useLang } from "@/lib/lang";
import { futureQuery } from "@/lib/future";
import { trpc } from "@/utils/trpc";

import { dict } from "./_components/i18n";

type SharedRoute = {
  name?: string;
  description?: string | null;
  coords?: [number, number][] | null;
  maneuvers?: { instruction?: string; lengthKm?: number }[] | null;
  km?: number | null;
  min?: number | null;
  engine?: string | null;
};

function asCoords(v: unknown): [number, number][] | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  if (!v.every((p) => Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number")) return null;
  return v as [number, number][];
}

export default function SharedRoutePage() {
  const { slug } = useParams<{ slug: string }>();
  const { lang } = useLang();
  const t = (k: string) => tx(lang, { en: dict.en[k] ?? k, si: dict.si[k] ?? k, ta: dict.ta[k] ?? k });

  // routes.bySlug is parallel-built; guarded so the page renders a fallback until it lands.
  const shared = useQuery({
    queryKey: ["routes-bySlug", slug],
    queryFn: () => futureQuery<SharedRoute>("routes.bySlug", { slug }),
    retry: false,
  });

  const route = (shared.data ?? null) as SharedRoute | null;
  const coords = asCoords(route?.coords);
  const maneuvers = Array.isArray(route?.maneuvers) ? route!.maneuvers! : [];

  // Elevation comes from the live route.elevation procedure (Valhalla or Open-Meteo fallback).
  const elevation = useQuery({
    ...trpc.route.elevation.queryOptions({ coords: coords ?? [[0, 0], [0, 1]] }),
    enabled: !!coords,
    retry: false,
  });
  const eleValues = Array.isArray(elevation.data)
    ? (elevation.data as number[])
    : Array.isArray((elevation.data as { elevation?: number[] } | null)?.elevation)
      ? ((elevation.data as { elevation?: number[] }).elevation as number[])
      : [];

  const download = () => {
    if (!coords) return;
    const xml = coordsToGpx(coords, route?.name ?? "roto-route", "route");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([xml], { type: "application/gpx+xml" }));
    a.download = `roto-route-${slug}.gpx`;
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

  if (shared.isError || !route || !coords) {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-4 px-4 pt-10 pb-16 sm:px-6">
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>{t("missing")}</AlertTitle>
          <AlertDescription>{t("missingSub")}</AlertDescription>
        </Alert>
        <Link href="/routes" className={cn(buttonVariants(), "h-10 w-fit font-bold")}>
          {t("curatedRoads")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 pt-10 pb-16 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">{route.name ?? slug}</h1>
        {route.description && <p className="mt-2 leading-relaxed text-muted-foreground">{route.description}</p>}
        <dl className="mt-4 flex flex-wrap gap-6">
          <div>
            <dt className="text-sm text-muted-foreground">km</dt>
            <dd className="numerals text-3xl">{route.km != null ? route.km.toFixed(0) : "–"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">min</dt>
            <dd className="numerals text-3xl">{route.min != null ? Math.round(route.min) : "–"}</dd>
          </div>
          {route.engine && (
            <div>
              <dt className="text-sm text-muted-foreground">{t("via")}</dt>
              <dd className="text-3xl font-bold capitalize">{route.engine}</dd>
            </div>
          )}
        </dl>
      </div>

      <RouteMap coords={coords} ariaLabel="Shared route map" />

      <div className="flex flex-wrap gap-2">
        <Button onClick={download} className="h-11 font-bold">
          <Download />
          {t("downloadGpx")}
        </Button>
        <a href={`roto-app://route/${encodeURIComponent(slug)}`} className={cn(buttonVariants({ variant: "secondary" }), "h-11")}>
          <Smartphone />
          {t("openInApp")}
        </a>
        <a
          href={`/api/route-pdf/${encodeURIComponent(slug)}?lang=${lang}`}
          target="_blank"
          rel="noopener"
          className={cn(buttonVariants({ variant: "secondary" }), "h-11")}
        >
          <FileText />
          {t("pdfExport")}
        </a>
        <Link href={`/r/${encodeURIComponent(slug)}/export`} className={cn(buttonVariants({ variant: "outline" }), "h-11")}>
          <Printer />
          {t("printExport")}
        </Link>
      </div>

      {eleValues.length > 1 && (
        <Card>
          <CardContent className="pt-5">
            <SeriesChart values={eleValues} label="Elevation" unit="m" />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-bold">
            <ListOrdered className="size-5" />
            {t("maneuvers")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {maneuvers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noManeuvers")}</p>
          ) : (
            <ol className="grid gap-2">
              {maneuvers.map((m, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="numerals mr-2 text-muted-foreground">{i + 1}</span>
                    {m.instruction ?? "Continue"}
                  </span>
                  {m.lengthKm != null && <span className="numerals shrink-0 text-muted-foreground">{m.lengthKm.toFixed(1)} km</span>}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{t("mapNote")}</p>
    </div>
  );
}
