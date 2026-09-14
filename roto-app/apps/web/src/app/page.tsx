"use client";
import { useQuery } from "@tanstack/react-query";

import { buttonVariants } from "@roto-app/ui/components/button";
import { trpc } from "@/utils/trpc";

export default function Home() {
  const healthCheck = useQuery(trpc.healthCheck.queryOptions());
  const curated = useQuery(trpc.curated.list.queryOptions({}));
  const pois = useQuery(trpc.rides.pois.queryOptions({}));

  return (
    <div className="container mx-auto max-w-3xl px-4 py-2">
      <div className="dark bg-background text-foreground rounded-2xl px-6 py-12">
        <h1 className="text-6xl font-extrabold tracking-tight text-balance">
          ROTO <span className="text-primary">රොටෝ</span> <span className="text-muted-foreground">ரோட்டோ</span>
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-xl">
          Offline-first motorcycle routes for Sri Lanka. Curvy roads, GPX in and out,
          crash alerts, live group rides — no subscription, no tracking.
        </p>
        <div className="mt-6 flex gap-3">
          <a href="/plan" className={buttonVariants({ size: "lg" })}>
            Plan a ride
          </a>
          <a href="/login" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Sign in
          </a>
        </div>
        <dl className="mt-10 grid grid-cols-3 max-w-xl gap-6">
          <div>
            <dt className="text-sm text-muted-foreground">Curated LK routes</dt>
            <dd className="text-3xl font-extrabold tabular-nums">{curated.data?.length ?? "–"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Fuel, EV, dealers mapped</dt>
            <dd className="text-3xl font-extrabold tabular-nums">{pois.data?.length ?? "–"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Languages</dt>
            <dd className="text-3xl font-extrabold tabular-nums">3</dd>
          </div>
        </dl>
      </div>
      <div className="grid gap-6">
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-medium">API Status</h2>
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${healthCheck.data ? "bg-green-500" : "bg-red-500"}`}
            />
            <span className="text-sm text-muted-foreground">
              {healthCheck.isLoading
                ? "Checking..."
                : healthCheck.data
                  ? "Connected"
                  : "Disconnected"}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
