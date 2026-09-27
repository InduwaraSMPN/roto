"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Badge } from "@roto-app/ui/components/badge";
import { buttonVariants } from "@roto-app/ui/components/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@roto-app/ui/components/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@roto-app/ui/components/item";
import { Progress } from "@roto-app/ui/components/progress";
import { Separator } from "@roto-app/ui/components/separator";
import { Skeleton } from "@roto-app/ui/components/skeleton";
import { cn } from "@roto-app/ui/lib/utils";

import { RouteTrace } from "@/components/route-trace";
import { trpc } from "@/utils/trpc";

const MONTH_TARGET_KM = 500;

export default function Home() {
  const now = new Date();
  const healthCheck = useQuery(trpc.healthCheck.queryOptions());
  const curated = useQuery(trpc.curated.list.queryOptions({}));
  const pois = useQuery(trpc.rides.pois.queryOptions({}));
  const events = useQuery(trpc.events.list.queryOptions());
  const leaderboard = useQuery(
    trpc.events.leaderboard.queryOptions({ year: now.getFullYear(), month: now.getMonth() + 1 }),
  );

  const routes = curated.data ?? [];
  // The hero draws the hardest curated road (longest breaks ties): hill runs show the curves Roto is for.
  const grade = (d: string) => ({ hard: 3, medium: 2, easy: 1 })[d] ?? 0;
  const featured = routes.reduce<(typeof routes)[number] | null>(
    (best, r) =>
      !best ||
      grade(r.difficulty) > grade(best.difficulty) ||
      (grade(r.difficulty) === grade(best.difficulty) && r.distanceKm > best.distanceKm)
        ? r
        : best,
    null,
  );
  const featuredGet = useQuery({
    ...trpc.curated.get.queryOptions({ id: featured?.id ?? "" }),
    enabled: !!featured,
  });
  const featuredCoords = featuredGet.data?.coords as [number, number][] | undefined;

  const topRiders = (leaderboard.data ?? []).slice(0, 5);
  const eventCount = (events.data ?? []).length;
  const connected = healthCheck.data === "OK";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <section
        aria-labelledby="roto-hero"
        className="grid items-center gap-8 pt-10 pb-12 md:grid-cols-[1.1fr_1fr] md:gap-12 md:pt-16"
      >
        <div>
          <h1 id="roto-hero" className="flex flex-col font-black leading-[0.95] tracking-tight">
            <span className="text-[clamp(3.5rem,11vw,7rem)]">ROTO</span>
            <span lang="si" className="font-script-si mt-2 text-[clamp(2rem,6vw,3.75rem)] leading-[1.25] font-bold text-muted-foreground">
              රොටෝ
            </span>
            <span lang="ta" className="font-script-ta text-[clamp(2rem,6vw,3.75rem)] leading-[1.25] font-bold text-muted-foreground">
              ரோட்டோ
            </span>
          </h1>
          <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-muted-foreground">
            Plan curvy roads across Sri Lanka, ride them offline in the hills, and get an alert out if you
            go down. Free, in English, සිංහල and தமிழ். No tracking.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/plan" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-base font-bold")}>
              Plan a ride
            </Link>
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5 text-base")}
            >
              Sign in to sync rides
            </Link>
          </div>
        </div>

        <figure className="relative">
          <div className="aspect-square w-full rounded-2xl bg-road p-4 text-[#f2efe6] ring-1 ring-foreground/10">
            {featuredCoords && featuredCoords.length > 1 ? (
              <RouteTrace coords={featuredCoords} label={`Route line of ${featured?.nameEn}`} />
            ) : featured || curated.isLoading ? (
              <Skeleton className="size-full rounded-xl bg-foreground/5" />
            ) : (
              <div className="flex size-full items-center justify-center p-8 text-center text-muted-foreground">
                Curated routes appear here once the server is reachable.
              </div>
            )}
          </div>
          {featured && (
            <figcaption className="mt-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate font-bold">{featured.nameEn}</p>
                <p className="text-sm capitalize text-muted-foreground">
                  {featured.region.replaceAll("-", " ")}, {featured.difficulty}
                </p>
              </div>
              <p className="numerals shrink-0 text-2xl">
                {featured.distanceKm.toFixed(0)}
                <span className="ml-1 text-sm font-semibold text-muted-foreground">km</span>
              </p>
            </figcaption>
          )}
        </figure>
      </section>

      <dl className="flex flex-col gap-4 border-y py-6 sm:flex-row sm:items-center sm:gap-8">
        <div className="flex items-baseline gap-3">
          <dd aria-live="polite" className="numerals text-3xl">
            {curated.isLoading ? "–" : routes.length}
          </dd>
          <dt className="text-sm text-muted-foreground">curated LK routes</dt>
        </div>
        <Separator orientation="vertical" className="hidden h-8 sm:block" />
        <div className="flex items-baseline gap-3">
          <dd aria-live="polite" className="numerals text-3xl">
            {pois.isLoading ? "–" : (pois.data?.length ?? 0)}
          </dd>
          <dt className="text-sm text-muted-foreground">fuel stops, chargers and dealers mapped</dt>
        </div>
        <Separator orientation="vertical" className="hidden h-8 sm:block" />
        <div className="flex items-baseline gap-3">
          <dd className="numerals text-3xl">3</dd>
          <dt className="text-sm text-muted-foreground">languages, voice included</dt>
        </div>
      </dl>

      <div className="mt-10 grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold">Start with a proven route</CardTitle>
            <CardDescription>Generated for motorcycles, marked until someone rides them.</CardDescription>
            <CardAction>
              <Link href="/plan" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Open planner
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {curated.isLoading ? (
              <div className="grid gap-3">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : curated.isError || routes.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Routes are unavailable right now. Open the planner and draw a 60 km loop instead.
              </p>
            ) : (
              <ItemGroup className="-mx-3 gap-0 has-data-[size=sm]:gap-0">
                {routes.map((route) => (
                  <div key={route.id} role="listitem">
                    <Item
                      size="sm"
                      render={<Link href={`/plan?route=${encodeURIComponent(route.id)}`} />}
                    >
                      <ItemContent>
                        <ItemTitle className="font-semibold">{route.nameEn}</ItemTitle>
                        <ItemDescription className="capitalize">
                          {route.region.replaceAll("-", " ")}
                          {route.verified === "generated" ? "" : ", ridden"}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions className="gap-3">
                        <Badge variant="outline" className="capitalize">
                          {route.difficulty}
                        </Badge>
                        <span className="numerals w-16 text-right">{route.distanceKm.toFixed(0)} km</span>
                      </ItemActions>
                    </Item>
                  </div>
                ))}
              </ItemGroup>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold">Riding this month</CardTitle>
            <CardDescription>Everyone chasing {MONTH_TARGET_KM} km.</CardDescription>
          </CardHeader>
          <CardContent>
            {leaderboard.isLoading ? (
              <div className="grid gap-4">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : topRiders.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                No rides logged yet this month. Plan a loop, record it in the app, and take the top spot.
              </p>
            ) : (
              <ol className="grid gap-4">
                {topRiders.map((rider, index) => (
                  <li key={`${rider.name}-${index}`}>
                    <Progress value={Math.min(100, (rider.km / MONTH_TARGET_KM) * 100)} aria-label={rider.name}>
                      <span className="flex w-full items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate font-semibold">
                          <span className="numerals mr-2 text-muted-foreground">{index + 1}</span>
                          {rider.name}
                        </span>
                        <span className="numerals shrink-0">{rider.km} km</span>
                      </span>
                    </Progress>
                  </li>
                ))}
              </ol>
            )}
            {eventCount > 0 && (
              <p className="mt-6 border-t pt-4 text-sm text-muted-foreground">
                <span className="numerals text-foreground">{eventCount}</span> group{" "}
                {eventCount === 1 ? "ride" : "rides"} planned. Join from the Rides tab in the app.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <Badge variant="outline" className="gap-2 font-normal" aria-live="polite">
          <span
            aria-hidden
            className={cn(
              "size-2 rounded-full",
              connected ? "bg-go" : healthCheck.isLoading ? "bg-muted-foreground" : "bg-destructive",
            )}
          />
          {healthCheck.isLoading
            ? "Checking the server"
            : connected
              ? "Planner and community are online"
              : "Server unreachable. Offline packs on the phone still work."}
        </Badge>
        <p>Map data © OpenMapTiles © OpenStreetMap contributors</p>
      </footer>
    </div>
  );
}
