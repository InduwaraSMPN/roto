// Per-corner lean bars for ride detail (plan §4.11). Corners come from
// `@roto-app/core/curvature` `segmentCorners` over the recorded track; each bar's height is
// the peak lean sampled inside that corner window.
import { useMemo } from "react";
import { Text, View } from "react-native";

import { segmentCorners } from "@roto-app/core/curvature";
import type { RideSample } from "@roto-app/core/types";
import { ROTO } from "@/lib/roto-theme";

export function LeanChart({ samples }: { samples: RideSample[] }) {
  const corners = useMemo(() => {
    if (samples.length < 3) return [];
    const coords = samples.map((s) => [s.lon, s.lat] as [number, number]);
    return segmentCorners(coords)
      .map((c) => {
        let peak = 0;
        for (let i = c.startIdx; i <= Math.min(c.endIdx, samples.length - 1); i++) {
          const lean = Math.abs(samples[i]?.lean ?? 0);
          if (lean > peak) peak = lean;
        }
        return { ...c, peakLean: Math.round(peak * 10) / 10 };
      })
      .slice(0, 24);
  }, [samples]);

  if (corners.length === 0) return null;

  const maxPeak = Math.max(...corners.map((c) => c.peakLean), 1);
  return (
    <View>
      <View className="h-24 flex-row items-end gap-1">
        {corners.map((c, i) => (
          <View
            key={`${c.startIdx}-${i}`}
            style={{
              flex: 1,
              height: `${Math.max(6, (c.peakLean / maxPeak) * 100)}%`,
              backgroundColor: c.peakLean >= 30 ? ROTO.danger : ROTO.signal,
              borderRadius: 3,
              opacity: 0.9,
            }}
            accessibilityLabel={`corner ${i + 1} peak lean ${c.peakLean} degrees`}
          />
        ))}
      </View>
      <Text className="mt-1 text-xs text-muted tabular-nums">
        {corners.length} corners · peak {Math.max(...corners.map((c) => c.peakLean))}°
      </Text>
    </View>
  );
}
