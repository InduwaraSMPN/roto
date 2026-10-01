// Curated browse: tag/minCurvature/sort run server-side (typed curated.list);
// region/difficulty filter client-side (no server filter for them in §4.9).
"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@roto-app/ui/components/badge";
import { Button } from "@roto-app/ui/components/button";
import { Card, CardContent } from "@roto-app/ui/components/card";
import { Field, FieldLabel } from "@roto-app/ui/components/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@roto-app/ui/components/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@roto-app/ui/components/select";
import { Skeleton } from "@roto-app/ui/components/skeleton";
import { Slider } from "@roto-app/ui/components/slider";

import { authClient } from "@/lib/auth-client";
import { tx, useLang } from "@/lib/lang";
import { trpc } from "@/utils/trpc";

import { dict } from "./_components/i18n";

const PAGE = 20;

// Columns tags/curvature/rating_avg land with the schema agent's §4.9 migration; the
// list items are typed without them until then, so extras are read through a cast.
type CuratedItem = {
  id: string;
  nameEn: string;
  region: string;
  difficulty: string;
  distanceKm: number;
  verified?: string | null;
  points?: number;
} & Partial<{ tags: string[] | null; curvature: number | null; ratingAvg: number | null }>;

export default function RoutesPage() {
  const { lang } = useLang();
  const t = (k: string) => tx(lang, { en: dict.en[k] ?? k, si: dict.si[k] ?? k, ta: dict.ta[k] ?? k });
  const { data: session } = authClient.useSession();
  const [region, setRegion] = useState("__all");
  const [tag, setTag] = useState("__all");
  const [difficulty, setDifficulty] = useState("__all");
  const [minCurvature, setMinCurvature] = useState(0);
  const [sort, setSort] = useState<"rating" | "curvature" | "distance">("rating");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [extra, setExtra] = useState<CuratedItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  const list = useQuery(
    trpc.curated.list.queryOptions({
      tag: tag === "__all" ? undefined : tag,
      minCurvature: minCurvature > 0 ? minCurvature : undefined,
      sort,
      limit: PAGE,
    }),
  );
  const firstItems = ((list.data?.items ?? []) as CuratedItem[]).filter(
    (r) =>
      (region === "__all" || r.region === region) && (difficulty === "__all" || r.difficulty === difficulty),
  );
  const rows = useMemo(() => [...firstItems, ...extra], [list.data, extra, region, difficulty]);
  // Server cursor is over the unfiltered list; client filters apply on top.
  const moreAvailable = nextCursor !== null || (list.data?.nextCursor ?? null) !== null;

  const regions = useMemo(
    () => [...new Set(((list.data?.items ?? []) as CuratedItem[]).map((r) => r.region))],
    [list.data],
  );
  const tags = useMemo(
    () => [...new Set(((list.data?.items ?? []) as CuratedItem[]).flatMap((r) => r.tags ?? []))],
    [list.data],
  );

  const resetPages = () => {
    setExtra([]);
    setNextCursor(null);
  };
  const loadMore = async () => {
    const cursor = nextCursor ?? list.data?.nextCursor ?? null;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { queryClient, trpc: proxy } = await import("@/utils/trpc");
      const page = await queryClient.fetchQuery(
        proxy.curated.list.queryOptions({
          tag: tag === "__all" ? undefined : tag,
          minCurvature: minCurvature > 0 ? minCurvature : undefined,
          sort,
          limit: PAGE,
          cursor,
        }),
      );
      setExtra((prev) => [...prev, ...((page.items ?? []) as CuratedItem[])]);
      setNextCursor(page.nextCursor);
    } catch {
      // Leave the button in place — the rider can retry.
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-10 pb-16 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">{t("title")}</h1>
      <p className="mt-2 max-w-[65ch] leading-relaxed text-muted-foreground">{t("sub")}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field>
          <FieldLabel>{t("region")}</FieldLabel>
          <Select value={region} onValueChange={(v) => v != null && (setRegion(v), resetPages())}>
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder={t("allRegions")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t("allRegions")}</SelectItem>
              {regions.map((r) => (
                <SelectItem key={r} value={r}>
                  {r.replaceAll("-", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>{t("tag")}</FieldLabel>
          <Select value={tag} onValueChange={(v) => v != null && (setTag(v), resetPages())}>
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder={t("allTags")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t("allTags")}</SelectItem>
              {tags.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>{t("difficulty")}</FieldLabel>
          <Select value={difficulty} onValueChange={(v) => v != null && (setDifficulty(v), resetPages())}>
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder={t("allDifficulties")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t("allDifficulties")}</SelectItem>
              {["easy", "medium", "hard"].map((d) => (
                <SelectItem key={d} value={d} className="capitalize">
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>{t("sort")}</FieldLabel>
          <Select value={sort} onValueChange={(v) => v != null && (setSort(v as typeof sort), resetPages())}>
            <SelectTrigger className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rating">{t("sortRating")}</SelectItem>
              <SelectItem value="curvature">{t("sortCurvy")}</SelectItem>
              <SelectItem value="distance">{t("sortDistance")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <div className="flex items-baseline justify-between">
            <FieldLabel>{t("minCurvy")}</FieldLabel>
            <span className="numerals text-sm">{minCurvature}</span>
          </div>
          <Slider
            min={0}
            max={1000}
            step={50}
            value={[minCurvature]}
            onValueChange={(v) => (setMinCurvature(Array.isArray(v) ? (v[0] ?? 0) : 0), resetPages())}
            className="py-2"
          />
        </Field>
      </div>

      <Card className="mt-6">
        <CardContent className="pt-5">
          {list.isLoading ? (
            <div className="grid gap-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : list.isError ? (
            <p className="text-sm text-muted-foreground">Routes are unavailable right now. Check the connection and reload.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <>
              <ItemGroup className="-mx-3 gap-0 has-data-[size=sm]:gap-0">
                {rows.map((r) => (
                  <div key={r.id} role="listitem">
                    <Item size="sm" render={<Link href={`/routes/${encodeURIComponent(r.id)}`} />}>
                      <ItemContent>
                        <ItemTitle className="font-semibold">{r.nameEn}</ItemTitle>
                        <ItemDescription className="capitalize">
                          {r.region.replaceAll("-", " ")} · {r.difficulty} ·{" "}
                          {r.verified === "generated" ? t("generated") : t("ridden")}
                          {r.ratingAvg != null && r.ratingAvg > 0 ? ` · ★ ${r.ratingAvg.toFixed(1)}` : ""}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions className="gap-3">
                        <Badge variant="outline" className="capitalize">
                          {r.difficulty}
                        </Badge>
                        <span className="numerals w-16 text-right">{r.distanceKm.toFixed(0)} km</span>
                      </ItemActions>
                    </Item>
                  </div>
                ))}
              </ItemGroup>
              {moreAvailable && (
                <div className="flex justify-center pt-3">
                  <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
                    {loadingMore ? "…" : t("loadMore")}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {!session?.user && <p className="mt-6 text-sm text-muted-foreground">{t("signInToRate")}</p>}
    </div>
  );
}
