"use client";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ShieldCheck } from "lucide-react";

import { Badge } from "@roto-app/ui/components/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@roto-app/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@roto-app/ui/components/empty";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@roto-app/ui/components/item";
import { Progress } from "@roto-app/ui/components/progress";
import { Skeleton } from "@roto-app/ui/components/skeleton";
import { cn } from "@roto-app/ui/lib/utils";

import type { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

const MONTH_TARGET_KM = 500;

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
  const bestLean = myRides.reduce((best, ride) => Math.max(best, ride.maxLeanDeg ?? 0), 0);
  const board = leaderboard.data ?? [];
  const rankIndex = board.findIndex((entry) => entry.name === session.user.name);
  const myMonthKm = rankIndex >= 0 ? (board[rankIndex]?.km ?? 0) : 0;

  return (
    <div className="grid gap-6">
      <section aria-labelledby="dash-rides" className="border-y py-6">
        <h2 id="dash-rides" className="sr-only">
          Your rides
        </h2>
        {rides.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : rides.isError ? (
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load your rides. Check the connection and reload the page.
          </p>
        ) : myRides.length === 0 ? (
          <Empty className="p-0 md:p-0">
            <EmptyHeader>
              <EmptyTitle>No rides synced yet</EmptyTitle>
              <EmptyDescription>
                Record a ride in the app and sync it. Distance and lean land here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-muted-foreground">Total distance</dt>
              <dd className="numerals text-4xl">
                {totalKm.toFixed(0)}
                <span className="ml-1 text-base font-semibold text-muted-foreground">km</span>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Rides synced</dt>
              <dd className="numerals text-4xl">{myRides.length}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Best lean</dt>
              <dd className="numerals text-4xl">{bestLean > 0 ? `${bestLean.toFixed(0)}°` : "–"}</dd>
            </div>
          </dl>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold">This month</CardTitle>
            <CardDescription>
              {rankIndex >= 0
                ? `You're number ${rankIndex + 1}, ${myMonthKm} of ${MONTH_TARGET_KM} km.`
                : `Log a ride to join the ${MONTH_TARGET_KM} km challenge.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {leaderboard.isLoading ? (
              <div className="grid gap-4">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : board.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Nobody has logged kilometres yet. Be the first.
              </p>
            ) : (
              <ol className="grid gap-4">
                {board.slice(0, 5).map((entry, index) => (
                  <li key={`${entry.name}-${index}`}>
                    <Progress
                      value={Math.min(100, (entry.km / MONTH_TARGET_KM) * 100)}
                      aria-label={entry.name}
                    >
                      <span className="flex w-full items-baseline justify-between gap-3 text-sm">
                        <span
                          className={cn(
                            "min-w-0 truncate font-semibold",
                            index === rankIndex && "text-primary",
                          )}
                        >
                          <span className="numerals mr-2 text-muted-foreground">{index + 1}</span>
                          {entry.name}
                        </span>
                        <span className="numerals shrink-0">{entry.km} km</span>
                      </span>
                    </Progress>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold">Group rides</CardTitle>
            <CardDescription>RSVP and share live positions from the Rides tab in the app.</CardDescription>
            {(events.data ?? []).length > 0 && (
              <CardAction>
                <Badge variant="secondary" className="numerals">
                  {events.data?.length}
                </Badge>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {events.isLoading ? (
              <div className="grid gap-3">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : (events.data ?? []).length === 0 ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Nothing planned. Start one from the Rides tab in the app.
              </p>
            ) : (
              <ItemGroup className="-mx-3 gap-0 has-data-[size=sm]:gap-0">
                {(events.data ?? []).slice(0, 5).map((event) => (
                  <Item key={event.id} size="sm" role="listitem">
                    <ItemMedia variant="icon" className="text-muted-foreground">
                      <CalendarDays />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle className="font-semibold">{event.name}</ItemTitle>
                      <ItemDescription>
                        {new Date(event.startsAt).toLocaleDateString(undefined, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                        {event.place ? `, ${event.place}` : ""}
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0" />
        Privacy zones stay on your phone. Ride starts and ends inside them never sync.
      </p>
    </div>
  );
}
