"use client";

import {
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  MapPin,
  Merge,
  Ship,
  Undo2,
  RefreshCcw,
} from "lucide-react";

import { interpolate } from "@roto-app/core/i18n";
import { ManeuverType, type Maneuver } from "@roto-app/core/types";
import { ScrollArea } from "@roto-app/ui/components/scroll-area";
import type { Planner } from "../_lib/use-planner";

const LEFT: Set<number> = new Set([3, 6, 14, 15, 16, 19, 21, 24]);
const RIGHT: Set<number> = new Set([2, 5, 9, 10, 11, 18, 20, 23]);
const UTURN: Set<number> = new Set([12, 13]);
const ROUND: Set<number> = new Set([ManeuverType.RoundaboutEnter, ManeuverType.RoundaboutExit]);

function ManeuverIcon({ type }: { type: number }) {
  const cls = "h-4 w-4 flex-none";
  if (ROUND.has(type)) return <RefreshCcw className={cls} aria-hidden />;
  if (UTURN.has(type)) return <Undo2 className={cls} aria-hidden />;
  if (type === ManeuverType.Start) return <Flag className={cls} aria-hidden />;
  if (
    type === ManeuverType.Destination ||
    type === ManeuverType.DestinationLeft ||
    type === ManeuverType.DestinationRight
  )
    return <MapPin className={cls} aria-hidden />;
  if (type === ManeuverType.Merge || type === ManeuverType.MergeLeft || type === ManeuverType.MergeRight)
    return <Merge className={cls} aria-hidden />;
  if (type === ManeuverType.FerryEnter || type === ManeuverType.FerryExit) return <Ship className={cls} aria-hidden />;
  if (LEFT.has(type)) return <CornerUpLeft className={cls} aria-hidden />;
  if (RIGHT.has(type)) return <CornerUpRight className={cls} aria-hidden />;
  return <ArrowUp className={cls} aria-hidden />;
}

type Props = { maneuvers: Maneuver[]; capable: boolean; t: Planner["t"] };

export function Maneuvers({ maneuvers, capable, t }: Props) {
  if (!capable || maneuvers.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.noManeuvers}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t.maneuvers}</p>
      <ScrollArea className="max-h-64">
        <ol className="flex flex-col gap-1 pr-2">
          {maneuvers.map((m, i) => {
            const dist =
              m.lengthKm >= 1
                ? interpolate(t.inKm, { km: m.lengthKm.toFixed(1) })
                : interpolate(t.inMeters, { m: Math.round(m.lengthKm * 1000) });
            const street = m.streets.length ? ` · ${m.streets.join(" / ")}` : "";
            return (
              <li key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
                <ManeuverIcon type={m.type} />
                <span className="min-w-0 flex-1 truncate">
                  {m.instruction}
                  <span className="text-muted-foreground">{street}</span>
                </span>
                <span className="numerals flex-none text-xs text-muted-foreground">{dist}</span>
              </li>
            );
          })}
        </ol>
      </ScrollArea>
    </div>
  );
}
