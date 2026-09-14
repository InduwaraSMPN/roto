"use client";
import { useQuery } from "@tanstack/react-query";

import type { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export default function Dashboard({
  session,
}: {
  session: typeof authClient.$Infer.Session;
}) {
  const now = new Date();
  const rides = useQuery(trpc.rides.mine.queryOptions());
  const leaderboard = useQuery(
    trpc.events.leaderboard.queryOptions({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    }),
  );
  const events = useQuery(trpc.events.list.queryOptions());

  const myRides = rides.data ?? [];
  const totalKm = myRides.reduce((sum, ride) => sum + (ride.distanceKm ?? 0), 0);
  const bestLean = myRides.reduce(
    (best, ride) => Math.max(best, ride.maxLeanDeg ?? 0),
    0,
  );
  const rank =
    (leaderboard.data ?? []).findIndex(
      (entry) => entry.name === session.user.name,
    ) + 1;

  return (
    <div className="grid gap-4">
      <section
        aria-labelledby="dash-rides"
        className="rounded-2xl border bg-card p-5 text-card-foreground"
      >
        <h2 id="dash-rides" className="text-lg font-bold tracking-tight">
          Your rides
        </h2>
        {rides.isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Loading your rides…
          </p>
        ) : rides.isError ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Couldn&apos;t load rides. Check the connection and try again.
          </p>
        ) : myRides.length === 0 ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            No rides synced yet. Record a ride in the app, then sync — it will
            land here with distance and lean.
          </p>
        ) : (
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">
                Total distance
              </dt>
              <dd className="text-2xl font-extrabold tabular-nums">
                {totalKm.toFixed(0)} km
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">
                Rides synced
              </dt>
              <dd className="text-2xl font-extrabold tabular-nums">
                {myRides.length}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">
                Best lean
              </dt>
              <dd className="text-2xl font-extrabold tabular-nums">
                {bestLean > 0 ? `${bestLean.toFixed(0)}°` : "—"}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section
          aria-labelledby="dash-month"
          className="rounded-2xl border bg-card p-5 text-card-foreground"
        >
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 id="dash-month" className="text-lg font-bold tracking-tight">
              This month
            </h2>
            <span className="text-xs font-semibold text-muted-foreground">
              Target 500 km
            </span>
          </div>
          {leaderboard.isLoading ? (
            <p className="text-sm text-muted-foreground">Checking the pack…</p>
          ) : (leaderboard.data ?? []).length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Nobody has logged kilometres yet. Be the first.
            </p>
          ) : (
            <div className="space-y-2">
              {rank > 0 && (
                <p className="text-sm font-semibold">
                  You&apos;re #{rank} this month.
                </p>
              )}
              <ol className="space-y-1.5">
                {(leaderboard.data ?? []).slice(0, 5).map((entry, index) => (
                  <li
                    key={`${entry.name}-${index}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate font-semibold">
                      {index + 1}. {entry.name}
                    </span>
                    <span className="shrink-0 font-bold tabular-nums">
                      {entry.km} km
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        <section
          aria-labelledby="dash-events"
          className="rounded-2xl border bg-card p-5 text-card-foreground"
        >
          <h2 id="dash-events" className="mb-2 text-lg font-bold tracking-tight">
            Group rides
          </h2>
          {events.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading events…</p>
          ) : (events.data ?? []).length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Nothing planned. Start one from the app&apos;s Rides tab.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {(events.data ?? []).slice(0, 5).map((event) => (
                <li key={event.id} className="py-2.5">
                  <p className="truncate text-sm font-semibold">{event.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[event.place, new Date(event.startsAt).toLocaleDateString()]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="text-xs text-muted-foreground">
        Privacy zones stay on your phone — zone starts and ends never sync.
      </p>
    </div>
  );
}
