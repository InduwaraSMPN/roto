"use client";

import { authClient } from "@/lib/auth-client";
import { Card, CardContent } from "@roto-app/ui/components/card";
import type { Planner } from "../_lib/use-planner";

export function FoldersPanel({ t }: { t: Planner["t"] }) {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return null;
  // ponytail: trpc.routes.* (save/mine/folders) is being built in parallel and is not on
  // AppRouter yet — referencing it would fail check-types, so this panel only gates on
  // sign-in and names the gap instead of fetching.
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <p className="text-sm font-bold">{t.saved}</p>
        <p className="text-sm text-muted-foreground">{session?.user ? t.foldersSoon : t.signInToSave}</p>
      </CardContent>
    </Card>
  );
}
