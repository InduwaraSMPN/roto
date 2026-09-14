---
name: Roto
description: Night-highway rider UI — LK sign-yellow signal on wet asphalt, trilingual, dark-first.
colors:
  signal: "#FFB300"
  signal-ink: "#1A1200"
  asphalt: "#0E1318"
  tar: "#1B232C"
  parchment: "#F2EFE6"
  fog: "#8A94A0"
  danger: "#E5484D"
  go: "#16A34A"
  live: "#2563EB"
typography:
  display:
    fontFamily: "Geist, Inter Variable, Noto Sans Sinhala, Noto Sans Tamil, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 7vw, 3.75rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter Variable, Noto Sans Sinhala, Noto Sans Tamil, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "10px"
  md: "12px"
  lg: "14px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.signal-ink}"
    rounded: "{rounded.lg}"
    padding: "14px 20px"
  button-secondary:
    backgroundColor: "{colors.tar}"
    textColor: "{colors.parchment}"
    rounded: "{rounded.lg}"
    padding: "14px 20px"
---

## Overview

Roto is an offline-first motorcycle companion for Sri Lanka, on web (Next.js planner) and native (Expo Ride tab). The visual world is "night highway": a dark asphalt surface with a single LK-road-sign yellow signal. One accent, used sparingly. Daylight/light theme exists and must stay legible, but every composition is designed dark-first because riders check the app at dawn, dusk, and night. Trilingual wordmark (ROTO රොටෝ ரோட்டோ) set with Noto Sans Sinhala/Tamil so it never tofu-boxes.
## Colors

### Primary

- **Signal yellow** (#FFB300): the single accent. Primary actions (Plan, START RIDE, Add), key numerals, selection, caret, focus rings, scrollbars. Never body text on light surfaces without signal-ink.
- **Signal ink** (#1A1200): text/icons on top of signal yellow. Hard rule.

### Secondary

- **Go green** (#16A34A): recording/live-ride affirmative state only (REC dot, Ride HUD link).
- **Live blue** (#2563EB): live group sharing state + member dots only.

### Tertiary

- **Danger red** (#E5484D): SOS, crash, delete, destructive actions. Never warnings that have a safe recovery — those stay signal.

### Neutral

- **Asphalt** (#0E1318): dark background. Web `.dark --background`; native `ROTO.asphalt`.
- **Tar** (#1B232C): dark card/surface. Web `.dark --card`; native `ROTO.tar`.
- **Parchment** (#F2EFE6): dark-mode foreground. Native `ROTO.parchment`.
- **Fog** (#8A94A0): muted/secondary text on dark. Native `ROTO.fog`; never body copy, never placeholders below 4.5:1.
- **Light surfaces**: stock shadcn white/gray scale (`packages/ui/src/styles/globals.css` `:root`). Supported but secondary; signal yellow stays the primary in both.

### Named Rules

**The One Signal Rule.** Signal yellow appears on ≤10% of any screen: one primary action, key numerals, focus. Everything else is asphalt/tar/parchment/fog.
**The Night-First Rule.** Design the dark composition first; light theme must pass contrast but never leads.

## Typography

**Display Font:** Geist (web) with Inter Variable fallback (with Noto Sans Sinhala / Noto Sans Tamil for si/ta).
**Body Font:** Inter Variable (with Noto Sans Sinhala / Noto Sans Tamil).
**Label/Mono Font:** System sans for labels; tabular-nums for all measurements (native `numerals`: tabular-nums + weight 800). Monospace only for code/data (GPX snippets, group codes).

**Character:** Heavyweight display (800, tight tracking) over quiet body. Controls shout; paragraphs whisper.

### Hierarchy

- **Display** (800, clamp(2.5rem, 7vw, 3.75rem), 1.05): trilingual hero wordmark only. Max 6rem. Balanced wrapping.
- **Headline** (700, 1.5rem, 1.2): screen titles (Plan a ride, Monthly challenge).
- **Title** (600–700, 1rem–1.25rem): card/section titles.
- **Body** (400, 1rem/1.6): descriptions, empty-state guidance. Max measure 65–75ch.
- **Label** (600–700, 0.75rem, uppercase where short): stats labels, labels inside components only (never page eyebrows).

### Named Rules

**The Weighed Numerals Rule.** Every km/min/lean/code numeral is tabular-nums, weight 700–800 — stats must not jitter while riding.

## Layout

Single-column constrained content on web (max-w-3xl/4xl, 16–24px gutters); map surfaces full-bleed within the column at 60vh. Native Ride tab is a map with an overlaid bottom control sheet; thumb-zone primaries (START/STOP/SOS) sit bottom, never top. Tight groups (8–12px), generous separation (24px+) between groups, more space above a heading than below it. Grid: 3-up stats on web hero; 2-up control pairs on native. Responsive: stats collapse 3→1, control pairs stack, map keeps 60vh min.

## Elevation & Depth

Flat tonal layering, no decorative shadows. Depth comes from asphalt-to-tar steps and 1px borders at 12% white. Shadows appear only as response to state (pressed sheet, active HUD). Route line on map is the one glowing exception (signal-width 4px line).

## Shapes

Generously rounded controls (14px radius = --radius 0.875rem, native ROTO.radius 14). Buttons, cards, inputs, sheets all share the 14px family (sm 10 / md 12 / lg 14). Map containers rounded-xl with border. No sharp corners except tabular data dividers; no pill-everything — pills reserved for live-status chips.

## Components

### Buttons

- **Shape:** rounded 14px family, never sharp.
- **Primary:** signal bg + signal-ink text, 700–800 weight, 14–16px padding. One per screen.
- **Secondary:** tar/secondary bg + parchment text. Destructive: danger-tinted surface + danger text.
- **Hover / Focus:** visible focus ring in signal (2px, 2px offset) everywhere; hover deepens, never hue-shifts.
- **Touch:** 44pt minimum targets on native; 40px minimum on web planner controls.

### Cards / Containers

- **Corner Style:** 14px. **Background:** tar on dark, white on light. **Border:** 1px subtle, no colored edge accents. **Internal Padding:** 16–24px. Never nest cards.

### Inputs / Fields

- **Style:** 1px input border, transparent/tar fill, 12–14px radius, 14px+ padding on native (glove-friendly).
- **Focus:** signal ring. **Error:** danger text naming the problem + recovery; never raw API errors.

### Navigation

- Web header: brand mark + Home/Plan/Dashboard, sticky with blur, theme toggle + user menu right. Native: drawer to tabs (Home/Ride/Rides), header hidden on tabs, tab bar in background token.

### Signature Component

Ride HUD: full-screen dark overlay, giant speed numeral + turn arrow + instruction + distance, tap-anywhere-to-exit (translated). Spring arrow honoring reduced-motion.

## Do's and Don'ts

### Do:

- **Do** keep one primary action per screen in signal yellow with signal-ink text.
- **Do** render every rider-facing string in en/si/ta (si/ta need native-speaker review before store release).
- **Do** use Ionicons (native) / Lucide (web) in one consistent weight — never emoji or unicode glyphs as icons.
- **Do** attribute maps (OpenMapTiles / OpenStreetMap) on every map surface.
- **Do** theme browser surfaces (selection, caret, scrollbar, focus) in signal.

### Don't:

- **Don't** put eyebrows/kickers above display headings; the trilingual H1 carries its own weight.
- **Don't** nest cards or build pages from same-size icon+heading+text card grids.
- **Don't** use gradient text, glassmorphism, hard offset shadows, or colored edge accents.
- **Don't** gate crash watch or SOS behind battery-saver, login, or any mode.
- **Don't** let zone-masked ride starts/ends leave the phone; no tracking, ever.

