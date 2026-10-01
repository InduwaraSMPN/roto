// Admin moderation queue + resolve. Tolerates FORBIDDEN when not admin.
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldAlert } from "lucide-react";

import { Badge } from "@roto-app/ui/components/badge";
import { Button } from "@roto-app/ui/components/button";
import { Card, CardContent } from "@roto-app/ui/components/card";
import { Skeleton } from "@roto-app/ui/components/skeleton";

import SignInGate from "@/components/sign-in-gate";
import { futureMutate, futureQuery } from "@/lib/future";
import { tx, useLang } from "@/lib/lang";

import { dict } from "../_components/i18n";

type Report = {
  id: string;
  targetType?: string;
  targetId?: string;
  reason?: string;
  status?: string;
  createdAt?: string;
};

export default function AdminReportsPage() {
  const { lang } = useLang();
  const t = (k: string) => tx(lang, { en: dict.en[k] ?? k, si: dict.si[k] ?? k, ta: dict.ta[k] ?? k });
  const queryClient = useQueryClient();
  const [forbidden, setForbidden] = useState(false);

  // moderation.queue is parallel-built; FORBIDDEN (or missing) renders the notice.
  const queue = useQuery({
    queryKey: ["moderation-queue"],
    queryFn: async () => {
      try {
        return await futureQuery<Report[]>("moderation.queue", {});
      } catch (err) {
        if (err instanceof Error && /FORBIDDEN|UNAUTHORIZED/.test(err.message)) setForbidden(true);
        throw err;
      }
    },
    retry: false,
  });

  const act = async (reportId: string, action: "dismiss" | "remove") => {
    try {
      // moderation.resolve is built but not wired into AppRouter yet; guarded until it lands.
      await futureMutate("moderation.resolve", { reportId, action });
      await queryClient.invalidateQueries({ queryKey: ["moderation-queue"] });
    } catch {
      setForbidden(true);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 pt-10 pb-16 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <ShieldAlert aria-hidden className="size-7" />
          {t("reportsTitle")}
        </h1>
        <p className="mt-2 leading-relaxed text-muted-foreground">{t("reportsSub")}</p>
      </div>
      <SignInGate note={t("notAdmin")}>
        {forbidden ? (
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">{t("notAdmin")}</p>
            </CardContent>
          </Card>
        ) : queue.isLoading ? (
          <div className="grid gap-3">
            <Skeleton className="h-16" />
          </div>
        ) : queue.isError ? (
          <p className="text-sm text-muted-foreground">{t("loadFail")}</p>
        ) : !(queue.data ?? []).length ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="grid gap-3">
            {(queue.data ?? []).map((r) => (
              <li key={r.id}>
                <Card>
                  <CardContent className="grid gap-2 pt-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-bold">
                        {r.targetType ?? "report"} · {r.targetId ?? r.id}
                      </p>
                      {r.status && <Badge variant="outline">{r.status}</Badge>}
                    </div>
                    {r.reason && <p className="text-sm text-muted-foreground">{r.reason}</p>}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void act(r.id, "remove")} className="h-9">
                        {t("resolve")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void act(r.id, "dismiss")} className="h-9">
                        {t("dismiss")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </SignInGate>
    </div>
  );
}
