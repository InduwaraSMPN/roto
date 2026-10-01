// Dashboard privacy: zones CRUD + setHome + exportMine download + deleteAccount confirm.
// privacy.exportMine / deleteAccount are parallel-built; guarded until they land.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Home, Plus, Trash2 } from "lucide-react";

import { Alert, AlertDescription } from "@roto-app/ui/components/alert";
import { Button } from "@roto-app/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@roto-app/ui/components/card";
import { Field, FieldLabel } from "@roto-app/ui/components/field";
import { Input } from "@roto-app/ui/components/input";
import { Skeleton } from "@roto-app/ui/components/skeleton";

import SignInGate from "@/components/sign-in-gate";
import { tx, useLang } from "@/lib/lang";
import { trpc } from "@/utils/trpc";

import { dict } from "../_components/i18n";

type Zone = { id: string; name: string; lat: number; lon: number; radiusM: number };

export default function PrivacyPage() {
  const { lang } = useLang();
  const t = (k: string) => tx(lang, { en: dict.en[k] ?? k, si: dict.si[k] ?? k, ta: dict.ta[k] ?? k });
  const queryClient = useQueryClient();
  const zones = useQuery(trpc.privacy.list.queryOptions());
  const [name, setName] = useState("");
  const [lat, setLat] = useState("6.9271");
  const [lon, setLon] = useState("79.8612");
  const [radiusM, setRadiusM] = useState("200");
  const [formError, setFormError] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [deleteText, setDeleteText] = useState("");

  const refresh = () => void queryClient.invalidateQueries({ queryKey: trpc.privacy.list.queryKey() });
  const add = useMutation(trpc.privacy.add.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(trpc.privacy.remove.mutationOptions({ onSuccess: refresh }));
  const setHome = useMutation(trpc.privacy.setHome.mutationOptions({ onSuccess: refresh }));
  const wipe = useMutation(trpc.privacy.deleteAccount.mutationOptions());

  const submit = () => {
    setFormError(null);
    const la = Number(lat);
    const lo = Number(lon);
    const r = Number(radiusM);
    if (!name.trim() || !Number.isFinite(la) || !Number.isFinite(lo) || !Number.isFinite(r)) {
      setFormError("Fill name, latitude, longitude and radius.");
      return;
    }
    add.mutate({ name: name.trim(), lat: la, lon: lo, radiusM: Math.min(2000, Math.max(50, Math.round(r))) });
    setName("");
  };

  // GDPR export is a typed query (no input); download the bundle as JSON.
  const exportMine = async () => {
    setExportMsg(null);
    try {
      const { queryClient: qc, trpc: proxy } = await import("@/utils/trpc");
      const data = await qc.fetchQuery(proxy.privacy.exportMine.queryOptions());
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      a.download = "roto-my-data.json";
      a.click();
    } catch {
      setExportMsg(t("exportNote"));
    }
  };

  const deleteAccount = () => {
    if (deleteText.trim() !== "DELETE") return;
    wipe.mutate(undefined, {
      onError: () => setExportMsg(t("exportNote")),
    });
  };

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 pt-10 pb-16 sm:px-6">
      <Link href="/dashboard" className="text-sm font-semibold text-muted-foreground underline">
        ← {t("back")}
      </Link>
      <div>
        <h1 className="text-3xl font-black tracking-tight">{t("privacyTitle")}</h1>
        <p className="mt-2 max-w-[65ch] leading-relaxed text-muted-foreground">{t("privacySub")}</p>
      </div>
      <SignInGate note={t("privacySub")}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold">{t("addZone")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="zone-name">{t("zoneName")}</FieldLabel>
              <Input id="zone-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Home" />
            </Field>
            <Field>
              <FieldLabel htmlFor="zone-radius">{t("zoneRadius")}</FieldLabel>
              <Input id="zone-radius" inputMode="numeric" value={radiusM} onChange={(e) => setRadiusM(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="zone-lat">{t("zoneLat")}</FieldLabel>
              <Input id="zone-lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="zone-lon">{t("zoneLon")}</FieldLabel>
              <Input id="zone-lon" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} />
            </Field>
            {formError && (
              <Alert variant="destructive" className="sm:col-span-2">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button onClick={submit} disabled={add.isPending} className="h-10 font-bold">
                <Plus />
                {t("addZone")}
              </Button>
              <Button
                variant="outline"
                disabled={setHome.isPending}
                onClick={() => {
                  const la = Number(lat);
                  const lo = Number(lon);
                  if (Number.isFinite(la) && Number.isFinite(lo)) setHome.mutate({ lat: la, lon: lo });
                }}
                className="h-10"
              >
                <Home />
                {t("setHome")}
              </Button>
              {setHome.isSuccess && <p className="w-full text-sm text-muted-foreground">{t("homeSet")}</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            {zones.isLoading ? (
              <div className="grid gap-3">
                <Skeleton className="h-12" />
              </div>
            ) : (
              <ul className="grid gap-2">
                {((zones.data ?? []) as Zone[]).map((z) => (
                  <li key={z.id} className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{z.name}</p>
                      <p className="numerals text-sm text-muted-foreground">
                        {z.lat.toFixed(4)}, {z.lon.toFixed(4)} · {z.radiusM} m
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => remove.mutate({ id: z.id })} aria-label={`${t("delete")} ${z.name}`}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold">{t("exportTitle")}</CardTitle>
            <CardDescription>{t("exportNote")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div>
              <Button variant="outline" onClick={() => void exportMine()} className="h-10">
                {t("exportMine")}
              </Button>
            </div>
            <div className="grid gap-2 border-t pt-4">
              <p className="text-sm text-muted-foreground">{t("deleteConfirm")}</p>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={deleteText}
                  onChange={(e) => setDeleteText(e.target.value)}
                  placeholder={t("deletePlaceholder")}
                  className="max-w-56"
                />
                <Button
                  variant="destructive"
                  disabled={deleteText.trim() !== "DELETE"}
                  onClick={() => {
                    if (window.confirm(t("deleteAccount"))) void deleteAccount();
                  }}
                  className="h-10"
                >
                  <Trash2 />
                  {t("deleteAccount")}
                </Button>
              </div>
            </div>
            {exportMsg && <p className="text-sm text-muted-foreground">{exportMsg}</p>}
          </CardContent>
        </Card>
      </SignInGate>
    </div>
  );
}
