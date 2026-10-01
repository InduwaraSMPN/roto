// Curated detail: map, stats, rate/submit when signed in (guarded until backend lands).
"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Download, Star, TriangleAlert } from "lucide-react";

import { coordsToGpx } from "@roto-app/core/gpx";

import { Alert, AlertDescription, AlertTitle } from "@roto-app/ui/components/alert";
import { Badge } from "@roto-app/ui/components/badge";
import { Button } from "@roto-app/ui/components/button";
import { Card, CardContent } from "@roto-app/ui/components/card";
import { Skeleton } from "@roto-app/ui/components/skeleton";

import RouteMap from "@/components/route-map";
import { authClient } from "@/lib/auth-client";
import { tx, useLang } from "@/lib/lang";
import { trpc } from "@/utils/trpc";

import { dict } from "../_components/i18n";

export default function RouteDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { lang } = useLang();
  const t = (k: string) => tx(lang, { en: dict.en[k] ?? k, si: dict.si[k] ?? k, ta: dict.ta[k] ?? k });
  const { data: session } = authClient.useSession();
  const [stars, setStars] = useState(5);
  const [msg, setMsg] = useState<string | null>(null);

  const detail = useQuery({ ...trpc.curated.get.queryOptions({ id: slug }), retry: false });
  const coords = (detail.data?.coords ?? null) as [number, number][] | null;
  const valid = coords && coords.length > 1;
  const rateMutation = useMutation(trpc.curated.rate.mutationOptions());

  const rate = () => {
    setMsg(null);
    rateMutation.mutate(
      { id: slug, stars },
      {
        onSuccess: () => setMsg(t("submitted")),
        onError: () => setMsg(t("signInToRate")),
      },
    );
  };

  const download = () => {
    if (!valid) return;
    const xml = coordsToGpx(coords, detail.data?.nameEn ?? "roto-route", "route");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([xml], { type: "application/gpx+xml" }));
    a.download = `roto-curated-${slug}.gpx`;
    a.click();
  };

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 pt-10 pb-16 sm:px-6">
      {detail.isLoading ? (
        <>
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-[60vh] min-h-[320px]" />
        </>
      ) : detail.isError || !detail.data ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>{t("missing")}</AlertTitle>
          <AlertDescription>{t("missingSub")}</AlertDescription>
        </Alert>
      ) : (
        <>
          <div>
            <h1 className="text-3xl font-black tracking-tight">{detail.data.nameEn}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm capitalize text-muted-foreground">
              {detail.data.region.replaceAll("-", " ")} · {detail.data.difficulty}
              <Badge variant="outline">{detail.data.verified === "generated" ? t("generated") : t("ridden")}</Badge>
            </p>
            <p className="numerals mt-3 text-4xl">
              {detail.data.distanceKm.toFixed(0)}
              <span className="ml-1 text-base font-semibold text-muted-foreground">km</span>
            </p>
          </div>
          {valid && <RouteMap coords={coords} ariaLabel="Curated route map" />}
          <div className="flex flex-wrap gap-2">
            {valid && (
              <Button onClick={download} className="h-11 font-bold">
                <Download />
                GPX
              </Button>
            )}
            {session?.user ? (
              <span className="flex items-center gap-2">
                <span role="group" aria-label={t("rate")} className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Button
                      key={s}
                      variant={stars >= s ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setStars(s)}
                      aria-label={`${s} star${s > 1 ? "s" : ""}`}
                      aria-pressed={stars === s}
                      className="h-9 w-9 p-0"
                    >
                      <Star className={stars >= s ? "fill-primary text-primary" : ""} />
                    </Button>
                  ))}
                </span>
                <Button variant="outline" onClick={rate} disabled={rateMutation.isPending} className="h-10">
                  {t("rate")}
                </Button>
              </span>
            ) : (
              <p className="text-sm text-muted-foreground">{t("signInToRate")}</p>
            )}
            {msg && <p className="w-full text-sm text-muted-foreground">{msg}</p>}
          </div>
        </>
      )}
    </div>
  );
}
