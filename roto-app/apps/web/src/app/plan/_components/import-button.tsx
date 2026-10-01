"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, Upload, X } from "lucide-react";

import { importRouteFile, type ImportedRoute } from "@roto-app/core/import";
import type { LonLat } from "@roto-app/core/types";
import { Button } from "@roto-app/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@roto-app/ui/components/dialog";
import { Input } from "@roto-app/ui/components/input";
import type { Planner } from "../_lib/use-planner";
import { trpc } from "@/utils/trpc";

type Props = {
  onUseCoords: (coords: LonLat[], label: string) => void;
  onPlanWaypoints: (points: { lat: number; lon: number }[]) => void;
  onSnap: () => void;
  hasImport: boolean;
  onClear: () => void;
  t: Planner["t"];
};

function lineLabel(kind: string, i: number, t: Planner["t"]) {
  return `${kind === "route" ? t.plannedRoutes : t.tracks} ${i + 1}`;
}

export function ImportButton({ onUseCoords, onPlanWaypoints, onSnap, hasImport, onClear, t }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [picked, setPicked] = useState<ImportedRoute | null>(null);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const linkQuery = useQuery({
    ...trpc.route.importUrl.queryOptions({ url: link || "https://maps.google.com/" }),
    enabled: false,
  });

  const takeFirst = (r: ImportedRoute, name: string) => {
    const line = r.tracks[0] ?? r.routes[0] ?? null;
    if (line && line.length >= 2) onUseCoords(line, name);
    else setFileError(t.failedImport);
  };

  const importFile = async (f: File | undefined) => {
    if (!f) return;
    setFileError(null);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const result = await importRouteFile(f.name, bytes);
      const total = result.tracks.length + result.routes.length;
      if (total === 0) {
        setFileError(t.failedImport);
      } else if (total === 1) {
        takeFirst(result, f.name);
      } else {
        setPicked(result);
      }
    } catch (err) {
      setFileError(err instanceof Error ? err.message : t.failedImport);
    }
  };

  const fetchLink = async () => {
    setLinkError(null);
    if (!/^https?:\/\//i.test(link)) {
      setLinkError(t.failedLink);
      return;
    }
    const res = await linkQuery.refetch();
    const pts = (res.data?.waypoints ?? []).filter(
      (w): w is { lat: number; lon: number } => "lat" in w && "lon" in w,
    );
    if (res.error || pts.length < 2) {
      setLinkError(res.error?.message ?? t.failedLink);
      return;
    }
    onPlanWaypoints(pts);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="lg" onClick={() => fileRef.current?.click()}>
          <Upload />
          {t.import}
        </Button>
        {hasImport ? (
          <Button variant="outline" size="lg" onClick={onClear}>
            <X />
            {t.clearImport}
          </Button>
        ) : (
          <Button variant="outline" size="lg" onClick={onSnap}>
            <Link2 />
            {t.snapRoads}
          </Button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".gpx,.kml,.kmz,.itn,.tcx"
        aria-label={t.importFile}
        className="hidden"
        onChange={(e) => {
          void importFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <p className="text-xs text-muted-foreground">{t.importHint}</p>
      {fileError && <p role="alert" className="text-sm text-destructive">{fileError}</p>}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void fetchLink();
        }}
      >
        <Input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder={t.pasteLink}
          aria-label={t.pasteLink}
          inputMode="url"
          className="h-10"
        />
        <Button type="submit" variant="secondary" disabled={linkQuery.isFetching || !link}>
          {t.fetchLink}
        </Button>
      </form>
      {linkError && <p role="alert" className="text-sm text-destructive">{linkError}</p>}

      {/* ponytail: a plain list of buttons, not a fancy picker — a file with many lines is rare, choosing is quick. */}
      <Dialog open={picked !== null} onOpenChange={(open) => !open && setPicked(null)}>
        <DialogContent aria-label={t.pickLine}>
          <DialogHeader>
            <DialogTitle>{t.pickLine}</DialogTitle>
            <DialogDescription>{t.importHint}</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {picked?.tracks.map((line, i) => (
              <Button
                key={`t${i}`}
                variant="ghost"
                className="justify-start"
                onClick={() => {
                  onUseCoords(line, `${t.tracks} ${i + 1}`);
                  setPicked(null);
                }}
              >
                {lineLabel("track", i, t)} · {line.length} {t.points}
              </Button>
            ))}
            {picked?.routes.map((line, i) => (
              <Button
                key={`r${i}`}
                variant="ghost"
                className="justify-start"
                onClick={() => {
                  onUseCoords(line, `${t.plannedRoutes} ${i + 1}`);
                  setPicked(null);
                }}
              >
                {lineLabel("route", i, t)} · {line.length} {t.points}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
