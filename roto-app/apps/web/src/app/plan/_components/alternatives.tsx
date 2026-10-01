"use client";

import { ToggleGroup, ToggleGroupItem } from "@roto-app/ui/components/toggle-group";
import type { AlternativeOption, Planner } from "../_lib/use-planner";

type Props = {
  options: AlternativeOption[];
  selected: number;
  onSelect: (index: number) => void;
  t: Planner["t"];
};

export function Alternatives({ options, selected, onSelect, t }: Props) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t.alternatives}</p>
      {/* ponytail: ToggleGroup is single-select radio behavior — keyboard arrows move between options natively. */}
      <ToggleGroup
        value={[String(selected)]}
        onValueChange={(v) => {
          const last = v[v.length - 1];
          if (last !== undefined && last !== "") onSelect(Number(last));
        }}
        variant="outline"
        className="flex-wrap"
        aria-label={t.alternatives}
      >
        {options.map((o, i) => (
          <ToggleGroupItem key={i} value={String(i)} aria-label={`${t.alternatives} ${i + 1}`}>
            <span className="numerals font-extrabold">{o.km.toFixed(0)}</span>
            <span className="text-xs text-muted-foreground">{t.km}</span>
            <span className="numerals text-muted-foreground">· {o.min.toFixed(0)} {t.min}</span>
            <span className="numerals text-muted-foreground">· {Math.round(o.curve * 100)}% {t.curvature}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
