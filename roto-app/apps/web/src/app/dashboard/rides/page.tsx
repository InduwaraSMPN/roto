// Dashboard rides list with cursor pagination (rides.mine {limit, before}).
"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@roto-app/ui/components/button";
import { Card, CardContent } from "@roto-app/ui/components/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@roto-app/ui/components/item";
import { Skeleton } from "@roto-app/ui/components/skeleton";

import SignInGate from "@/components/sign-in-gate";
import { tx, useLang } from "@/lib/lang";
import { trpc } from "@/utils/trpc";

import { dict } from "../_components/i18n";

const PAGE = 20;

type RideRow = {
  id: string;
  name: string;
  distanceKm: number | null;
  startedAt: string | Date | null;
  visibility?: string | null;
};

export default function DashboardRidesPage() {
  const { lang } = useLang();
  const t = (k: string) => tx(lang, { en: dict.en[k] ?? k, si: dict.si[k] ?? k, ta: dict.ta[k] ?? k });
  const [pages, setPages] = useState<(RideRow[] | undefined)[]>([]);

  // First page via the typed proxy; further pages append below.
  const first = useQuery(trpc.rides.mine.queryOptions({ limit: PAGE }));
  const all = useMemo(() => {
    const base = ((first.data ?? []) as RideRow[]);
    return [...base, ...pages.flatMap((p) => p ?? [])];
  }, [first.data, pages]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-10 pb-16 sm:px-6">
      <Link href="/dashboard" className="text-sm font-semibold text-muted-foreground underline">
        ← {t("back")}
      </Link>
      <h1 className="mt-2 text-3xl font-black tracking-tight">{t("myRides")}</h1>
      <div className="mt-6">
        <SignInGate note={t("loadFail")}>
          <RidesList
            rows={all}
            loading={first.isLoading}
            failed={first.isError}
            t={t}
            onMore={(rows) => setPages((p) => [...p, rows])}
          />
        </SignInGate>
      </div>
    </div>
  );
}

function RidesList({
  rows,
  loading,
  failed,
  t,
  onMore,
}: {
  rows: RideRow[];
  loading: boolean;
  failed: boolean;
  t: (k: string) => string;
  onMore: (rows: RideRow[]) => void;
}) {
  const [loadingMore, setLoadingMore] = useState(false);
  const [ended, setEnded] = useState(false);
  // Cursor pagination reuses the same proxy imperatively via fetch — the proxy has no
  // suspense-free imperative form here, so page 2+ goes through the shared queryClient.
  const more = async () => {
    const last = rows[rows.length - 1];
    if (!last?.startedAt || loadingMore) return;
    setLoadingMore(true);
    try {
      const { queryClient, trpc: proxy } = await import("@/utils/trpc");
      const next = (await queryClient.fetchQuery(
        proxy.rides.mine.queryOptions({ limit: PAGE, before: String(last.startedAt) }),
      )) as RideRow[];
      if (!next.length) setEnded(true);
      else onMore(next);
    } catch {
      // Leave the button in place — the rider can retry.
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }
  if (failed) return <p className="text-sm text-muted-foreground">{t("loadFail")}</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground">{t("noRides")}</p>;
  return (
    <Card>
      <CardContent className="pt-3">
        <ItemGroup className="-mx-3 gap-0 has-data-[size=sm]:gap-0">
          {rows.map((r) => (
            <div key={r.id} role="listitem">
              <Item size="sm" render={<Link href={`/dashboard/rides/${r.id}`} />}>
                <ItemContent>
                  <ItemTitle className="font-semibold">{r.name}</ItemTitle>
                  <ItemDescription>
                    {r.startedAt ? new Date(r.startedAt).toLocaleDateString() : ""}
                    {r.visibility && r.visibility !== "private" ? ` · ${r.visibility}` : ""}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <span className="numerals w-20 text-right">
                    {r.distanceKm != null ? `${r.distanceKm.toFixed(1)} km` : "–"}
                  </span>
                </ItemActions>
              </Item>
            </div>
          ))}
        </ItemGroup>
        <div className="flex justify-center pt-3">
          {ended ? (
            <p className="text-sm text-muted-foreground">{t("end")}</p>
          ) : (
            <Button variant="outline" onClick={() => void more()} disabled={loadingMore}>
              {loadingMore ? "…" : t("loadMore")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
