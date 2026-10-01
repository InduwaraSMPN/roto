// Admin fuel prices: public table + admin-only set form. Tolerates FORBIDDEN.
// fuel.current({}) returns the latest row per type; history needs {fuelType}.
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Fuel } from "lucide-react";

import { Button } from "@roto-app/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@roto-app/ui/components/card";
import { Field, FieldLabel } from "@roto-app/ui/components/field";
import { Input } from "@roto-app/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@roto-app/ui/components/select";
import { Skeleton } from "@roto-app/ui/components/skeleton";

import { futureMutate, futureQuery } from "@/lib/future";
import { tx, useLang } from "@/lib/lang";

import { dict } from "../_components/i18n";

const FUELS = ["petrol92", "petrol95", "diesel", "superDiesel", "kerosene"];

type FuelPrice = {
  fuelType: string;
  priceLkr: number;
  effectiveFrom?: string | null;
  source?: string | null;
};

function asList(data: unknown): FuelPrice[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as FuelPrice[];
  if (typeof data === "object") {
    const values = Object.values(data as Record<string, unknown>);
    // Either a {type: row} map or a single row.
    if (values.length && typeof values[0] === "object" && values[0] !== null && "priceLkr" in (values[0] as object)) {
      return values as FuelPrice[];
    }
    if ("priceLkr" in (data as object)) return [data as FuelPrice];
  }
  return [];
}

export default function AdminFuelPage() {
  const { lang } = useLang();
  const t = (k: string) => tx(lang, { en: dict.en[k] ?? k, si: dict.si[k] ?? k, ta: dict.ta[k] ?? k });
  const queryClient = useQueryClient();
  const [fuelType, setFuelType] = useState("petrol92");
  const [historyType, setHistoryType] = useState("petrol92");
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  // fuel.* is built but not wired into AppRouter yet; guarded until it lands.
  const current = useQuery({
    queryKey: ["fuel-current"],
    queryFn: () => futureQuery<unknown>("fuel.current", {}),
    retry: false,
  });
  const history = useQuery({
    queryKey: ["fuel-history", historyType],
    queryFn: () => futureQuery<unknown>("fuel.history", { fuelType: historyType, limit: 12 }),
    retry: false,
  });
  const currentRows = asList(current.data);
  const historyRows = asList(history.data);

  const set = async () => {
    setMsg(null);
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;
    try {
      await futureMutate("fuel.set", { fuelType, priceLkr: p });
      setPrice("");
      await queryClient.invalidateQueries({ queryKey: ["fuel-current"] });
      await queryClient.invalidateQueries({ queryKey: ["fuel-history"] });
    } catch (err) {
      setMsg(err instanceof Error && /FORBIDDEN|UNAUTHORIZED/.test(err.message) ? t("fuelSub") : t("loadFail"));
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 pt-10 pb-16 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <Fuel aria-hidden className="size-7" />
          {t("fuelTitle")}
        </h1>
        <p className="mt-2 leading-relaxed text-muted-foreground">{t("fuelSub")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">{t("current")}</CardTitle>
        </CardHeader>
        <CardContent>
          {current.isLoading ? (
            <Skeleton className="h-12" />
          ) : current.isError || !currentRows.length ? (
            <p className="text-sm text-muted-foreground">{t("loadFail")}</p>
          ) : (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {currentRows.map((f) => (
                <div key={f.fuelType}>
                  <dt className="text-sm capitalize text-muted-foreground">{f.fuelType}</dt>
                  <dd className="numerals text-2xl">{Number(f.priceLkr).toFixed(2)}</dd>
                  <dd className="text-xs text-muted-foreground">LKR/L</dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">{t("setPrice")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Field>
            <FieldLabel>{t("fuelType")}</FieldLabel>
            <Select value={fuelType} onValueChange={(v) => v != null && setFuelType(v)}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FUELS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="fuel-price">{t("priceLkr")}</FieldLabel>
            <Input id="fuel-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="300" />
          </Field>
          <div className="flex items-end">
            <Button onClick={() => void set()} className="h-10 font-bold">
              {t("setPrice")}
            </Button>
          </div>
          {msg && <p className="text-sm text-muted-foreground sm:col-span-3">{msg}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-lg font-bold">
            {t("history")}
            <Select value={historyType} onValueChange={(v) => v != null && setHistoryType(v)}>
              <SelectTrigger className="h-9 w-44" aria-label={t("fuelType")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FUELS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.isLoading ? (
            <Skeleton className="h-12" />
          ) : history.isError || !historyRows.length ? (
            <p className="text-sm text-muted-foreground">{t("loadFail")}</p>
          ) : (
            <ul className="grid gap-1.5">
              {historyRows.map((f, i) => (
                <li key={i} className="numerals flex items-baseline justify-between gap-3 text-sm">
                  <span className="capitalize">
                    {f.fuelType}
                    {f.effectiveFrom ? ` · ${new Date(f.effectiveFrom).toLocaleDateString()}` : ""}
                  </span>
                  <span className="font-bold">{Number(f.priceLkr).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
