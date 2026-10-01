"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@roto-app/ui/components/button";
import type { Planner } from "../_lib/use-planner";

// Web client code must prefer the inlined process.env.NEXT_PUBLIC_* literal:
// the varlock ENV proxy is not always hydrated in the client bundle.
export const NIGHT_STYLE = process.env.NEXT_PUBLIC_TILE_URL || "https://demotiles.maplibre.org/style.json";
export const DAY_STYLE = "https://demotiles.maplibre.org/style.json";

type Props = { value: string; onChange: (url: string) => void; t: Planner["t"] };

export function StyleSwitcher({ value, onChange, t }: Props) {
  // ponytail: no day style of our own — tiles/style.day.json belongs to the tiles
  // agent. Until NEXT_PUBLIC_TILE_URL points at a night style distinct from the
  // demo style, there is nothing to switch between, so hide the control.
  if (NIGHT_STYLE === DAY_STYLE) return null;
  return (
    <div role="group" aria-label="Map style" className="flex gap-1 rounded-xl border bg-background/95 p-1 backdrop-blur">
      <Button
        variant={value === NIGHT_STYLE ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onChange(NIGHT_STYLE)}
        aria-pressed={value === NIGHT_STYLE}
      >
        <Moon />
        {t.night}
      </Button>
      <Button
        variant={value === DAY_STYLE ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onChange(DAY_STYLE)}
        aria-pressed={value === DAY_STYLE}
      >
        <Sun />
        {t.day}
      </Button>
    </div>
  );
}
