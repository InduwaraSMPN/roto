"use client";
import { useQuery } from "@tanstack/react-query";

import { buttonVariants } from "@roto-app/ui/components/button";
import { trpc } from "@/utils/trpc";

export default function Home() {
  const healthCheck = useQuery(trpc.healthCheck.queryOptions());
  const curated = useQuery(trpc.curated.list.queryOptions({}));
  const pois = useQuery(trpc.rides.pois.queryOptions({}));
  const events = useQuery(trpc.events.list.queryOptions());
  const leaderboard = useQuery(
    trpc.events.leaderboard.queryOptions({
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
    }),
  );

  const topRoutes = (curated.data ?? []).slice(0, 3);
  const topRiders = (leaderboard.data ?? []).slice(0, 3);
  const connected = healthCheck.data === "OK";
  const statsLoading = curated.isLoading || pois.isLoading;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-12">
      <section
        aria-labelledby="roto-hero"
        className="rounded-2xl border bg-card px-6 py-10 text-card-foreground sm:px-10 sm:py-12"
      >
        <h1
          id="roto-hero"
          className="max-w-xl text-balance text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl"
        >
          ROTO <span className="text-primary">රොටෝ</span>{" "}
          <span className="text-muted-foreground">ரோட்டோ</span>
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Offline-first motorcycle routes for Sri Lanka. Curvy roads, GPX in
          and out, crash alerts, live group rides — no subscription, no
          tracking.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a href="/plan" className={buttonVariants({ size: "lg" })}>
            Plan a ride
          </a>
          <a
            href="/login"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Sign in
          </a>
          <p className="w-full text-sm text-muted-foreground sm:w-auto">
            Free forever · Works offline in the hills · English / සිංහල / தமிழ்
          </p>
        </div>
        <dl className="mt-10 grid max-w-xl grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              Curated LK routes
            </dt>
            <dd
              aria-live="polite"
              className="text-3xl font-extrabold tabular-nums"
            >
              {statsLoading ? "…" : (curated.data?.length ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              Fuel, EV, dealers mapped
            </dt>
            <dd
              aria-live="polite"
              className="text-3xl font-extrabold tabular-nums"
            >
              {statsLoading ? "…" : (pois.data?.length ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              Languages
            </dt>
            <dd className="text-3xl font-extrabold tabular-nums">3</dd>
          </div>
        </dl>
      </section>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <section
          aria-labelledby="roto-routes"
          className="rounded-2xl border bg-card p-5 text-card-foreground"
        >
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="roto-routes" className="text-lg font-bold tracking-tight">
              Start with a proven route
            </h2>
            <a
              href="/plan"
              className="shrink-0 text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              Open planner
            </a>
          </div>
          {curated.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading routes…</p>
          ) : curated.isError || topRoutes.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Routes are unavailable right now. Open the planner and draw a
              60 km loop instead.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {topRoutes.map((route) => (
                <li
                  key={route.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {route.nameEn}
                    </p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {route.region} · {route.difficulty}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {route.distanceKm.toFixed(0)} km
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="roto-community"
          className="rounded-2xl border bg-card p-5 text-card-foreground"
        >
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="roto-community" className="text-lg font-bold tracking-tight">
              Riding this month
            </h2>
            <span className="shrink-0 text-xs font-semibold text-muted-foreground">
              Target 500 km
            </span>
          </div>
          {leaderboard.isLoading || events.isLoading ? (
            <p className="text-sm text-muted-foreground">Checking the pack…</p>
          ) : topRiders.length === 0 && (events.data ?? []).length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              No rides logged yet this month. Plan a loop, record it, and take
              the top spot.
            </p>
          ) : (
            <div className="space-y-3">
              {topRiders.length > 0 && (
                <ol className="space-y-1.5">
                  {topRiders.map((rider, index) => (
                    <li
                      key={`${rider.name}-${index}`}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 truncate font-semibold">
                        {index + 1}. {rider.name}
                      </span>
                      <span className="shrink-0 font-bold tabular-nums">
                        {rider.km} km
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {(events.data ?? []).length > 0 && (
                <p className="border-t border-border pt-3 text-sm text-muted-foreground">
                  <span className="font-bold tabular-nums text-foreground">
                    {events.data?.length}
                  </span>{" "}
                  group {events.data?.length === 1 ? "ride" : "rides"} planned
                  — join from the app&apos;s Rides tab.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      <section
        aria-labelledby="roto-status"
        className="mt-4 rounded-2xl border bg-card p-5 text-card-foreground"
      >
        <h2 id="roto-status" className="mb-2 text-sm font-bold">
          Service status
        </h2>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={`size-2 rounded-full ${connected ? "bg-[#16A34A]" : healthCheck.isLoading ? "bg-muted-foreground" : "bg-destructive"}`}
          />
          <span className="text-sm text-muted-foreground">
            {healthCheck.isLoading
              ? "Checking…"
              : connected
                ? "Connected — planner, routes, and community are live"
                : healthCheck.isError
                  ? "Offline — the planner retries automatically; offline packs still work"
                  : "Disconnected"}
          </span>
        </div>
      </section>

    </div>
  );
}
