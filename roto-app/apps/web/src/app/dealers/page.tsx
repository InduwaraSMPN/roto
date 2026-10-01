// Dealer/service/spares directory with brand filter chips + Riyasewana deep links.
// ponytail: brand list mirrors the parallel-built packages/core/src/brands.ts constant
// (duplicated, not imported — core has no brands export yet; delete this list when it lands).
"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ExternalLink, Navigation, Phone } from "lucide-react";

import { Badge } from "@roto-app/ui/components/badge";
import { buttonVariants } from "@roto-app/ui/components/button";
import { Card, CardContent } from "@roto-app/ui/components/card";
import { Skeleton } from "@roto-app/ui/components/skeleton";
import { cn } from "@roto-app/ui/lib/utils";

import { tx, useLang } from "@/lib/lang";
import { trpc } from "@/utils/trpc";

import { dict } from "./_components/i18n";

const BRANDS = ["Bajaj", "Hero", "Honda", "Yamaha", "TVS", "KTM", "Voge", "Zonsen", "Lifan", "Haojue", "Suzuki", "Revolt", "Demak"];

type Poi = {
  id: string;
  kind: string;
  nameEn: string;
  lat: number;
  lon: number;
  brand?: string | null;
  phone?: string | null;
  hours?: string | null;
  verified?: boolean | null;
};

function riyasewanaUrl(brand: string, model?: string): string {
  const b = encodeURIComponent(brand.toLowerCase());
  const m = model ? `/${encodeURIComponent(model.toLowerCase())}` : "";
  return `https://riyasewana.com/search/motorcycles/${b}${m}`;
}

export default function DealersPage() {
  const { lang } = useLang();
  const t = (k: string) => tx(lang, { en: dict.en[k] ?? k, si: dict.si[k] ?? k, ta: dict.ta[k] ?? k });
  const [brand, setBrand] = useState<string | null>(null);
  const pois = useQuery(trpc.rides.pois.queryOptions({}));

  const rows = useMemo(() => {
    const all = ((pois.data ?? []) as Poi[]).filter((p) => ["dealer", "service", "spares"].includes(p.kind));
    return brand ? all.filter((p) => (p.brand ?? "").toLowerCase() === brand.toLowerCase()) : all;
  }, [pois.data, brand]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-10 pb-16 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">{t("title")}</h1>
      <p className="mt-2 max-w-[65ch] leading-relaxed text-muted-foreground">{t("sub")}</p>

      <div role="group" aria-label="Brand filter" className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setBrand(null)}
          aria-pressed={brand === null}
          className={cn(
            buttonVariants({ variant: brand === null ? "default" : "outline", size: "sm" }),
            "h-9 rounded-full font-bold",
          )}
        >
          {t("allBrands")}
        </button>
        {BRANDS.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBrand((cur) => (cur === b ? null : b))}
            aria-pressed={brand === b}
            className={cn(
              buttonVariants({ variant: brand === b ? "default" : "outline", size: "sm" }),
              "numerals h-9 rounded-full",
            )}
          >
            {b}
          </button>
        ))}
      </div>

      {pois.isLoading ? (
        <div className="mt-6 grid gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : pois.isError ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("loadFail")}</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <li key={p.id}>
              <Card>
                <CardContent className="grid gap-2 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold">{p.nameEn}</p>
                    <Badge variant="outline" className="shrink-0 capitalize">
                      {p.kind}
                    </Badge>
                  </div>
                  <p className="text-sm capitalize text-muted-foreground">
                    {p.brand ?? "—"}
                    {p.verified ? "" : ` · ${t("unverified")}`}
                  </p>
                  {p.hours && (
                    <p className="numerals text-sm text-muted-foreground">
                      {t("hours")}: {p.hours}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-2">
                    {p.phone && (
                      <a href={`tel:${p.phone}`} className={cn(buttonVariants({ size: "sm" }), "h-9 font-bold")}>
                        <Phone />
                        {t("call")}
                      </a>
                    )}
                    <a
                      href={`https://maps.google.com/?q=${p.lat},${p.lon}`}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9")}
                    >
                      <Navigation />
                      {t("navigate")}
                    </a>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card className="mt-8">
        <CardContent className="grid gap-2 pt-5">
          <p className="font-bold">
            {t("parts")}
            {brand ? ` — ${brand}` : ""}
          </p>
          <p className="text-sm text-muted-foreground">{t("partsNote")}</p>
          <a
            href={riyasewanaUrl(brand ?? "honda")}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "secondary" }), "h-10 w-fit")}
          >
            <ExternalLink />
            riyasewana.com
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
