// Roto identity — "night highway": LK sign-yellow on wet asphalt.
// Mirrors shadcn roles (see packages/ui globals.css .dark): signal=primary,
// asphalt/tar=background/card, parchment=foreground, fog=muted-foreground,
// danger=destructive, radius 14px = --radius 0.875rem. Native can't consume
// CSS vars, so these consts ARE the native theme — keep values in sync.
// HeroUI Native components read their own CSS-variable theme (Uniwind), so
// apps/native/global.css maps that theme's tokens onto these same hex values
// (dark mode fully, light mode just the accent) — change both together.
export const ROTO = {
  asphalt: "#0E1318",
  tar: "#1B232C",
  signal: "#FFB300",
  signalInk: "#1A1200",
  danger: "#E5484D",
  sky: "#93c5fd",
  white: "#ffffff",
  black: "#000000",
  parchment: "#F2EFE6",
  fog: "#8A94A0",
  go: "#16a34a",
  live: "#2563eb",
  radius: 14,
} as const;

export const numerals = { fontVariant: ["tabular-nums"] as ["tabular-nums"], fontWeight: "800" as const };
