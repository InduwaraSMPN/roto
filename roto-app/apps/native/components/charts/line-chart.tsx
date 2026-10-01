// Minimal SVG line chart for ride detail (plan §4.10/§4.11: elevation + speed + lean).
// react-native-svg is already installed; no chart dep needed.
// ponytail: fixed logical width with preserveAspectRatio="none" instead of measuring layout —
// good enough for single-track sparklines; upgrade to a measured chart if axes are ever needed.
import { useMemo } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";

import { ROTO } from "@/lib/roto-theme";

export function LineChart({
  data,
  color = ROTO.signal,
  height = 120,
  width = 320,
  label,
  unit,
  highlightIdx,
}: {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
  label?: string;
  unit?: string;
  highlightIdx?: number;
}) {
  const { points, min, max, hi } = useMemo(() => {
    if (data.length === 0) return { points: "", min: 0, max: 0, hi: null as { x: number; y: number } | null };
    const lo = Math.min(...data);
    const mx = Math.max(...data);
    const span = mx - lo || 1;
    const pad = 6;
    const W = 300;
    const H = 100;
    const step = data.length > 1 ? W / (data.length - 1) : 0;
    const pts = data
      .map((v, i) => `${(i * step).toFixed(1)},${(H - pad - ((v - lo) / span) * (H - pad * 2)).toFixed(1)}`)
      .join(" ");
    let hiPt: { x: number; y: number } | null = null;
    if (highlightIdx != null && data[highlightIdx] != null) {
      const v = data[highlightIdx] as number;
      hiPt = { x: highlightIdx * step, y: H - pad - ((v - lo) / span) * (H - pad * 2) };
    }
    return { points: pts, min: lo, max: mx, hi: hiPt };
  }, [data, highlightIdx]);

  if (data.length === 0) return null;

  const last = data[data.length - 1] ?? 0;
  return (
    <View>
      {label != null && (
        <View className="mb-1 flex-row items-baseline justify-between">
          <Text className="text-sm font-bold text-foreground">{label}</Text>
          <Text className="text-sm text-muted tabular-nums">
            {Math.round(last * 10) / 10}
            {unit ? ` ${unit}` : ""} · max {Math.round(max * 10) / 10}
            {unit ? ` ${unit}` : ""}
          </Text>
        </View>
      )}
      <Svg width={width} height={height} viewBox="0 0 300 100" preserveAspectRatio="none">
        <Polyline points={points} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {hi != null && <Circle cx={hi.x} cy={hi.y} r={5} fill={ROTO.parchment} stroke={color} strokeWidth={2.5} />}
      </Svg>
      <Text className="text-xs text-muted tabular-nums">min {Math.round(min * 10) / 10}{unit ? ` ${unit}` : ""}</Text>
    </View>
  );
}
