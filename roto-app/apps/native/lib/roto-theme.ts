// Roto identity — "night highway": LK sign-yellow on wet asphalt.
// Mirrors shadcn roles (see packages/ui globals.css .dark): signal=primary,
// asphalt/tar=background/card, parchment=foreground, fog=muted-foreground,
// danger=destructive, radius 14px = --radius 0.875rem. Native can't consume
// CSS vars, so these consts ARE the native theme — keep values in sync.
export const ROTO = {
  asphalt: "#0E1318",
  tar: "#1B232C",
  signal: "#FFB300",
  signalInk: "#1A1200",
  danger: "#E5484D",
  parchment: "#F2EFE6",
  fog: "#8A94A0",
  go: "#16a34a",
  live: "#2563eb",
  radius: 14,
} as const;

export const numerals = { fontVariant: ["tabular-nums"] as ["tabular-nums"], fontWeight: "800" as const };
