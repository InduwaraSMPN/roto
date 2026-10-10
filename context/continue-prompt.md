# Continue-from-here prompt

Paste everything below into a fresh session. It is written to be self-contained: a model with no
memory of this project should be able to pick it up cold.

---

You are continuing the **Roto** build — a free, offline-first, trilingual (en/si/ta) motorcycle app
for Sri Lanka. Repo: `D:\Work\Weekend Projects\roto`, code in `roto-app/` (npm workspaces + Turborepo).
You are on Windows/PowerShell. **Git is read-only for you** — never run `git add/commit/push`.

## First: read these, in this order

1. `context/handoff.md` — current state, the completion table at the top, and the bug list. **This is the
   most important file; most of the work is already described there.**
2. `AGENTS.md` — commands, architecture, and a **Windows gotchas section that will save you hours**.
3. `context/feature-parity-plan.md` — the plan; §6 migrations, §7 deps, §8 phases, §10 decided decisions.
4. `PRODUCT.md` and `DESIGN.md` — before any UI work.

## What is done

All five build phases are written and type-check. Migrations 0006–0019 are applied to the local Docker
Postgres (44 tables). 12,410 OSM POIs and 29,143 scored curvature ways are loaded. `sync.delta` offline
sync, the safety trigger, the community/challenge/moderation routers, the web planner rebuild, the share
pages, the PDF export, the five learner modules and all three Kotlin native modules exist.

**The app genuinely runs.** Verified on `emulator-5554` (Android 16) with a release APK: it boots with no
ANR, the home screen renders in en/si/ta, the API card reads LIVE with real LK routes, `sync.delta`
returns 200, and the map draws real OSM/Martin tiles with attribution. Check the table at the top of
`context/handoff.md` for the honest split between "code written" and "actually exercised".

## What is NOT done — do not assume otherwise

1. **Crash thresholds have never run against real motion** (4 g / 15 km/h / 10 s stillness / 0.35 g² —
   invented numbers). A false-positive crash detection texts someone's family at a pothole, so tuning
   this on a real phone is the highest-risk item outstanding.
2. **Unverified anywhere:** SOS countdown and delivery, background recording with the screen off, Android
   Auto, media-key remotes, ride capture and sync on a phone. An emulator settles none of these.
3. **All si/ta copy is a non-native best effort.** A native speaker must review it before any store
   release. Hard gate, not a nice-to-have.
4. **Curated route names/regions now translate** (re-seeded 12 LK classics with si/ta names; Home picks
   the name by `lang` and localises difficulty/region). What is still English-only: the LIVE/OFFLINE chip,
   the `email@example.com` placeholder, and **auth validation messages** — the zod schemas in
   `components/sign-in.tsx` / `sign-up.tsx` are module-scope so they cannot see `t`; move them into the
   component or key them off a message-id map.
5. **Open decisions (do not re-decide without the owner):** D2 prod Postgres, D4 next-intl, D6 satellite,
   D7 OSM extract host, D8 RainViewer, D9 Strava, D10 Serwist PWA, D11 LK speed limits, D13 Riyasewana.
6. **Fuel prices table is empty** — admin-entered via `/admin/fuel`; no source was invented.
7. **Calendarific cron is unexercised** (no API key). Poya currently comes from the Meeus calculation in
   `packages/db/src/seed/lk-reference.ts`, which can drift by a day near midnight.

## Trilingual notes (learned the hard way)

- `Strings` in `packages/core/src/i18n/en.ts` is the source of truth, and `si.ts`/`ta.ts` are typed as
  `Strings`. **Adding a key to `en.ts` fails typecheck until both others supply it** — rely on this rather
  than trying to remember to translate.
- `useLang()` returns `{ lang, setLang, t }`. A screen that destructures only `{ lang, setLang }` renders
  a language picker that does nothing — that exact bug shipped on Home. If you add a screen with a
  language switcher, wire `t` and then **tap the switcher on a device** to confirm.
- **Fixing one instance of an i18n bug proves nothing about the others.** This shipped in five places at
  once: the Home screen, the Home *tab* screen, the tab-bar titles in `(tabs)/_layout.tsx`, and both auth
  forms. Grep `apps/native` for literal text in JSX (`>Capitalised text<`) rather than assuming a screen
  is covered.
- Auth **validation** messages are still English: the zod schemas sit at module scope in
  `components/sign-in.tsx` / `sign-up.tsx` and cannot close over `t`. Needs the schema moved into the
  component or keyed off a message-id map.
- `apps/native/lib/i18n.ts` is the older local dictionary; the context imports `STR` from
  `@roto-app/core/i18n`. Grep for which one a screen uses before adding strings.

## Windows commands that actually work

- Everything from `roto-app/`.
- `npm install` → then **always** `node scripts/patch-varlock-windows.mjs`, or the server, web app and
  drizzle-kit all die at env load.
- npm/next/Metro: `subst R: "D:\Work\Weekend Projects\roto"`, then run from `R:\roto-app` with
  `$env:PATH = "R:\roto-app\node_modules\.bin;$env:PATH"`.
- **Gradle is the exception — never use `R:` for gradle.** Use `scripts\gradlew-roto.bat :app:assembleDebug`.
  It sets `JAVA_HOME` and runs from the real `D:\` path; `@react-native/codegen` fails with "this and
  base files have different roots" on a subst drive. A cold gradle build is ~20 min, incremental ~5 —
  batch your Android changes.
- **Test startup with `:app:assembleRelease`, not the dev client.** The dev client downloads and evaluates
  a 19.6 MB bundle over the emulator loopback and will ANR; a release APK embeds it and starts in
  seconds. Release already signs with the debug keystore, so it needs no extra setup.
- **Release builds block cleartext HTTP** (targetSdk 36). `apps/native/app.plugin.js` permits it only for
  `10.0.2.2`/`localhost`/`127.0.0.1`. Bake emulator URLs in by exporting them in the shell *before* the
  gradle call — varlock prefers process env over `.env`, so the committed config stays clean:
  `$env:EXPO_PUBLIC_SERVER_URL="http://10.0.2.2:3010"; $env:EXPO_PUBLIC_TILE_URL="http://10.0.2.2:3006/style.json"`.
  Add your LAN IP to `CLEAR_TEXT_HOSTS` for a physical-phone test.
- `tiles/serve-style.mjs` must be running **and bound to `0.0.0.0`**, or the map fails with
  `Mbgl [Setup]: loading style failed`. It and the server can die silently when spawned oddly — verify
  with `netstat -ano | Select-String ":3006"` instead of trusting that a start command returned.
- `next typegen` after adding a route; while `next dev` is running, delete `.next/types` first.
- Local infra: `docker compose -f tiles\docker-compose.yml up -d` (Postgres :54322, martin :3005,
  Valhalla :8002), `node tiles/serve-style.mjs` (:3006), server :3010, web :3001, Metro :8081.
- Martin tiles are **extensionless**: `/curvature/11/1478/984`, not `.pbf`. A `.pbf` request 404s and
  looks like a broken tile pipeline when it is only a wrong URL.

## Invariants you must not break

- Crash watch and SOS are **never** gated behind battery saver, login, or any mode.
- Privacy-zone start/end points never leave the phone — trim on device before any send, sync, share or
  export. Never broadcast a live position from inside a zone.
- Every rider-facing string needs en/si/ta. Signal yellow `#FFB300` is the only accent, text on it
  `#1A1200`. Ionicons on native, Lucide on web, never emoji as an icon. OSM/OpenMapTiles attribution on
  every map.
- A `// ponytail:` comment marks a deliberately minimal choice — read it before "improving" that code.
- Never run `npm run check` (biome rewrites the repo to tabs). Match the surrounding 2-space style by hand.

## Suggested order of work

1. **Tune crash thresholds on the S24** against real drops onto a cushion. Nothing else in this project
   has this much blast radius.
2. Run the device checklist in `roto-app/DEVICE-TEST.md` and plan §9. Set Roto to "Unrestricted" battery
   on the S24 — One UI kills background services otherwise. `adb reverse tcp:3010 tcp:3005 tcp:3006` so
   the phone can reach the local stack.
3. Exercise SOS end to end: countdown, delivery to a second device, and the crash alert full-screen view.
4. Android Auto against the Desktop Head Unit: `adb forward tcp:5277 tcp:5277`, then run
   `%ANDROID_HOME%\extras\google\auto\desktop-head-unit.exe`.
5. Route si/ta copy past a native speaker.
6. Then, if the owner wants them: D10 PWA, D4 next-intl, D7 extract host.

## Working style that has worked here

Verify every claim against a running system. A lot of this code type-checks while being completely broken
at runtime — the worst example: Metro could not resolve any `@roto-app/core` subpath import, so the app
could not start, and `tsc` was green throughout. Two more: the map rendered *correctly* per the style but
was buried under 12,410 POI rings, and the Home screen's language switcher silently did nothing — both only
visible in a screenshot.

Two process lessons worth keeping:
- **Test behaviour, not bytes.** After the i18n fix I spent several turns bisecting the release bundle for
  Sinhala strings and got nonsense (the asset is gzipped, so every substring probe read compressed data).
  Installing the APK and tapping the switcher answered it in one shot.
- **Cheaply disprove a hypothesis.** The POI rings looked like the style's curvature layer; setting its
  `minzoom` to `20` proved otherwise in one reload, so the change was reverted instead of shipped as a
  guess.

When something "works", show the command output or a screenshot. If a check cannot be run, say so plainly
rather than implying it passed.

Git state: the feature work is **committed** (8 commits). Only the most recent edits are uncommitted.
