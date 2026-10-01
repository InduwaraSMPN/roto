// Public live-trip page: no account needed. Polls safety.tripByToken every 10 s.
"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { MapPin, Phone, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@roto-app/ui/components/alert";
import { Badge } from "@roto-app/ui/components/badge";
import { buttonVariants } from "@roto-app/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@roto-app/ui/components/card";
import { Skeleton } from "@roto-app/ui/components/skeleton";
import { cn } from "@roto-app/ui/lib/utils";

import RouteMap from "@/components/route-map";
import { tx, useLang } from "@/lib/lang";
import { trpc } from "@/utils/trpc";

import { dict } from "./_components/i18n";

function agoText(updatedAt: string, now: number, ago: string): string {
  const s = Math.max(0, Math.round((now - new Date(updatedAt).getTime()) / 1000));
  if (s < 60) return `${s}s ${ago}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${ago}`;
  return `${Math.floor(m / 60)}h ${m % 60}m ${ago}`;
}

export default function LiveTripPage() {
  const { token } = useParams<{ token: string }>();
  const { lang } = useLang();
  const t = (k: string) => tx(lang, { en: dict.en[k] ?? k, si: dict.si[k] ?? k, ta: dict.ta[k] ?? k });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const trip = useQuery({
    ...trpc.safety.tripByToken.queryOptions({ token }),
    refetchInterval: 10_000,
    retry: false,
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-10 pb-16 sm:px-6">
      <p className="text-sm font-semibold text-muted-foreground">{t("liveTrip")}</p>
      {trip.isLoading ? (
        <div className="mt-4 grid gap-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-[60vh] min-h-[320px]" />
        </div>
      ) : trip.isError || !trip.data ? (
        <Alert variant="destructive" className="mt-4">
          <TriangleAlert />
          <AlertTitle>{t("unknown")}</AlertTitle>
          <AlertDescription>{t("unknownSub")}</AlertDescription>
        </Alert>
      ) : (
        (() => {
          const d = trip.data;
          if (d.lat == null || d.lon == null) {
            return (
              <div className="mt-4 grid gap-4">
                <h1 className="text-3xl font-black tracking-tight">{t("liveTrip")}</h1>
                <Skeleton className="h-[60vh] min-h-[320px]" />
                <p className="text-sm text-muted-foreground">{t("liveNote")}</p>
              </div>
            );
          }
          const lat = d.lat;
          const lon = d.lon;
          const reason =
            d.reason === "crash" ? t("reasonCrash") : d.reason === "checkin" ? t("reasonCheckin") : t("reasonManual");
          return (
            <div className="mt-2 grid gap-6">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-black tracking-tight">{reason}</h1>
                {d.endedAt ? (
                  <Badge variant="secondary">{t("ended")}</Badge>
                ) : (
                  <Badge className="bg-live text-white">
                    <span aria-hidden className="mr-1.5 size-2 animate-pulse rounded-full bg-white" />
                    {t("liveTrip")}
                  </Badge>
                )}
              </div>
              <RouteMap
                coords={[[lon, lat]]}
                marker={{ lon, lat, label: "Rider's last reported position" }}
                ariaLabel="Rider's last reported position map"
              />
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-5">
                    <p className="text-sm text-muted-foreground">{t("speed")}</p>
                    <p className="numerals text-4xl">{d.speed != null ? Math.round(d.speed) : "–"}</p>
                    <p className="text-sm text-muted-foreground">km/h</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5">
                    <p className="text-sm text-muted-foreground">{t("lastUpdate")}</p>
                    <p className="numerals text-2xl">{agoText(String(d.updatedAt), now, t("ago"))}</p>
                    <a
                      href={`https://maps.google.com/?q=${lat},${lon}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary underline"
                    >
                      <MapPin className="size-4" />
                      {lat.toFixed(5)}, {lon.toFixed(5)}
                    </a>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-bold">{t("emergency")}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <a href="tel:119" className={cn(buttonVariants({ variant: "destructive", size: "lg" }))}>
                    <Phone />
                    {t("police")} · 119
                  </a>
                  <a href="tel:1990" className={cn(buttonVariants({ variant: "destructive", size: "lg" }))}>
                    <Phone />
                    {t("ambulance")} · 1990
                  </a>
                  <a href="tel:110" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
                    <Phone />
                    {t("fire")} · 110
                  </a>
                </CardContent>
              </Card>
              <p className="text-sm text-muted-foreground">{t("liveNote")}</p>
              <p className="text-sm text-muted-foreground">{t("noNumber")}</p>
            </div>
          );
        })()
      )}
    </div>
  );
}
