"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";

import type { Waypoint } from "@roto-app/core/types";
import { Button } from "@roto-app/ui/components/button";
import { Input } from "@roto-app/ui/components/input";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@roto-app/ui/components/item";
import type { Planner } from "../_lib/use-planner";

type Props = {
  waypoints: Waypoint[];
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onRename: (index: number, name: string) => void;
  t: Planner["t"];
};

export function WaypointList({ waypoints, onMove, onRemove, onRename, t }: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const label = (w: Waypoint, i: number) =>
    w.name ?? (i === 0 ? t.start : i === waypoints.length - 1 ? t.destination : `${t.stop} ${i}`);

  return (
    <ItemGroup>
      {waypoints.map((w, i) => (
        <Item key={`${w.lat.toFixed(5)},${w.lon.toFixed(5)},${i}`} size="sm" variant="outline">
          <span
            aria-hidden
            className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-extrabold"
            style={{ background: "#FFB300", color: "#1A1200" }}
          >
            {i + 1}
          </span>
          <ItemContent>
            {editing === i ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onRename(i, draft.trim());
                  setEditing(null);
                }}
              >
                <Input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => {
                    onRename(i, draft.trim());
                    setEditing(null);
                  }}
                  aria-label={t.stopName}
                  className="h-8"
                />
              </form>
            ) : (
              <>
                <ItemTitle>{label(w, i)}</ItemTitle>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {w.lat.toFixed(4)}, {w.lon.toFixed(4)}
                </p>
              </>
            )}
          </ItemContent>
          <ItemActions>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={i === 0}
              onClick={() => onMove(i, i - 1)}
              aria-label={`${t.moveUp}: ${label(w, i)}`}
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={i === waypoints.length - 1}
              onClick={() => onMove(i, i + 1)}
              aria-label={`${t.moveDown}: ${label(w, i)}`}
            >
              <ArrowDown />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setDraft(w.name ?? "");
                setEditing(i);
              }}
              aria-label={`${t.rename}: ${label(w, i)}`}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={waypoints.length <= 1}
              onClick={() => onRemove(i)}
              aria-label={`${t.remove}: ${label(w, i)}`}
            >
              <Trash2 />
            </Button>
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}
