// Dashboard ride detail: stats, elevation/speed SVG charts, heatmap layer toggle.
// ponytail: no rides.get-by-id procedure exists, so the ride is found in a bounded
// rides.mine window (200) client-side — add a server get when the backend grows one.
"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Flame, Star, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@roto-app/ui/components/alert";
import { Button } from "@roto-app/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@roto-app/ui/components/card";
import { Skeleton } from "@roto-app/ui/components/skeleton";
import { Switch } from "@roto-app/ui/components/switch";

import RouteMap from "@/components/route-map";
import SeriesChart from "@/components/series-chart";
import SignInGate from "@/components/sign-in-gate";
import { futureQuery } from "@/lib/future";
import { tx, useLang } from "@/lib/lang";
import { trpc } from "@/utils/trpc";

import { dict } from "../../_components/i18n";

type Sample = { t: number; lon: number; lat: number; spd?: number; ele?: number; lean?: number };

export default function RideDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { lang } = useLang();
  const t = (k: string) => tx(lang, { en: dict.en[k] ?? k, si: dict.si[k] ?? k, ta: dict.ta[k] ?? k });
  const [showHeat, setShowHeat] = useState(false);

  const mine = useQuery(trpc.rides.mine.queryOptions({ limit: 200 }));
  const ride = useMemo(
    () => ((mine.data ?? []) as Record<string, unknown>[]).find((r) => r.id === id) as Record<string, unknown> | undefined,
    [mine.data, id],
  );

  // rides.heat is built but not wired into AppRouter yet; guarded until it lands.
  const heat = useQuery({
    queryKey: ["rides-heat"],
    queryFn: () => futureQuery<{ points?: [number, number][] } | [number, number][]>("rides.heat"),
    enabled: showHeat,
    retry: false,
  });
  const heatPoints: [number, number][] | null = Array.isArray(heat.data)
    ? (heat.data as [number, number][])
    : Array.isArray((heat.data as { points?: unknown } | undefined)?.points)
      ? ((heat.data as { points: [number, number][] }).points)
      : null;
  const samples = (ride?.samples ?? null) as Sample[] | null;
  const track: [number, number][] = useMemo(() => {
    if (samples?.length) return samples.map((s) => [s.lon, s.lat]);
    const gpx = ride?.gpx as string | undefined;
    return gpx ? [] : [];
  }, [samples, ride]);
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const submitCurated = useMutation(trpc.curated.submit.mutationOptions());

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 pt-10 pb-16 sm:px-6">
      <Link href="/dashboard/rides" className="text-sm font-semibold text-muted-foreground underline">
        ← {t("myRides")}
      </Link>
      <SignInGate note={t("loadFail")}>
        {mine.isLoading ? (
          <>
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-[60vh] min-h-[320px]" />
          </>
        ) : mine.isError || !ride ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>{t("loadFail")}</AlertTitle>
            <AlertDescription>{t("noRides")}</AlertDescription>
          </Alert>
        ) : (
          <>
            <div>
              <h1 className="text-3xl font-black tracking-tight">{String(ride.name ?? "Ride")}</h1>
              <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  ["km", num(ride.distanceKm)?.toFixed(1) ?? "–"],
                  ["avg km/h", num(ride.avgSpeedKmh)?.toFixed(0) ?? "–"],
                  ["max km/h", ride.hideMaxSpeed ? "–" : (num(ride.maxSpeedKmh)?.toFixed(0) ?? "–")],
                  ["max lean", num(ride.maxLeanDeg) != null ? `${(ride.maxLeanDeg as number).toFixed(0)}°` : "–"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="numerals text-3xl">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {track.length > 1 && (
              <>
                <RouteMap coords={track} heat={heatPoints} showHeat={showHeat} ariaLabel="Ride track map" />
                <Card>
                  <CardContent className="flex items-center justify-between gap-4 pt-5">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <Flame className="size-4" />
                      {t("heat")}
                    </span>
                    <Switch checked={showHeat} onCheckedChange={setShowHeat} aria-label={t("heat")} />
                  </CardContent>
                </Card>
                {showHeat && heat.isError && <p className="text-sm text-muted-foreground">{t("heatNote")}</p>}
              </>
            )}

            {samples && samples.length > 1 && (
              <>
                <Card>
                  <CardContent className="pt-5">
                    <SeriesChart
                      values={samples.map((s) => (s.spd != null ? s.spd * 3.6 : 0))}
                      label="Speed"
                      unit="km/h"
                      color="#16A34A"
                    />
                  </CardContent>
                </Card>
                {samples.some((s) => s.ele != null) && (
                  <Card>
                    <CardContent className="pt-5">
                      <SeriesChart values={samples.map((s) => s.ele ?? 0)} label="Elevation" unit="m" />
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-bold">Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                <p className="numerals text-muted-foreground">
                  {ride.startedAt ? new Date(String(ride.startedAt)).toLocaleString() : ""} →{" "}
                  {ride.endedAt ? new Date(String(ride.endedAt)).toLocaleString() : "–"}
                </p>
                <p className="text-muted-foreground">
                  gain {num(ride.elevationGainM)?.toFixed(0) ?? "–"} m · {String(ride.visibility ?? "private")}
                  {num(ride.curvature) != null ? ` · curvature ${(ride.curvature as number).toFixed(0)}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={submitCurated.isPending}
                    onClick={() =>
                      submitCurated.mutate(
                        { rideId: id },
                        {
                          onSuccess: () => setSubmitMsg(t("submittedCurated")),
                          onError: () => setSubmitMsg(t("loadFail")),
                        },
                      )
                    }
                    className="h-9"
                  >
                    <Star />
                    {t("submitCurated")}
                  </Button>
                  {submitMsg && <span className="text-sm text-muted-foreground">{submitMsg}</span>}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </SignInGate>
    </div>
  );
}
