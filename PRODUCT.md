# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Sri Lanka motorcycle riders: new riders learning the road, daily commuters who also tour, and riding clubs/group organizers. Secondary: independent service/dealer network staff (Bajaj/Hero/Honda/Yamaha/KTM/Voge/Zonsen/Lifan/Haojue) and new-brand owners entering the LK market. All three languages (Sinhala/Tamil/English) are first-class; cheap Androids, hill-country offline use, and monsoon conditions are the norm, not the edge.

Open decision: exact weighting between new-rider onboarding vs. club-organizer power features — both are served, tour/loop planning leads.

## Product Purpose

Free, open-source, offline-first motorcycle companion for Sri Lanka. It plans curvy rides, guides turn-by-turn with voice, records tracks with lean/stats, detects crashes and alerts SOS contacts, shares live group positions, and grows an LK rider community (curated routes, events, monthly challenges). Success: a rider can plan, ride offline in the hills, survive a crash with an alert out, and come home to a logged ride — forever free, with no tracking.

## Positioning

The only all-in-one FOSS moto app built specifically for Sri Lanka: global-class routing/community features combined with LK localization (trilingual UI+voice, hill-country offline packs, monsoon/Poya awareness, LK hazards, fuel/EV, LK service network) that no global incumbent (REVER/calimoto/Scenic/Kurviger/Detecht/ESR/Cardo/Beeline) truthfully offers, and no LK partial (PickMe/TRAVEL Lanka/SriLankaSafe/Beep/Riyasewana/Club Sha/Bikemap) covers end-to-end.

## Operating Context

Riding workflows: plan a curvy route or round-trip loop on web or phone → download an offline LK pack (Colombo, Kandy–Nuwara Eliya, Ella, Galle) → ride with HUD/voice, battery-saver on cheap phones → crash watch always on → sync queued rides later → review stats, leaderboards, events. Group workflows: create/share a live code, join by 6-letter code, see member dots, RSVP to events. Group liveness is 5s polling (30s in saver); positions stay in-DB so multi-instance deploys agree. Environments: wet asphalt night rides, hill-country no-signal zones, monsoon rain, Poya/holiday closures, LK traffic (potholes, buses, dogs, elephants, checkpoints). Tools it interoperates with: GPX in/out (REVER/Scenic/Kurviger-compatible), OSM LK extracts, Valhalla self-host with BRouter/OSRM fallback.

## Capabilities and Constraints

Confirmed capabilities (feature matrix, all wired): curvy/twisty routing; round-trip loop generation; TBT voice + 120m auto-recalc follow with maneuver steps; offline maps + offline record; GPX import/export; web planner; 5 curated Valhalla-generated LK routes; track + stats (dist/duration/speed/max lean via DeviceMotion); crash detection with SMS fallback to 119/1990 + family + live trip link; live group share/join; POI fuel/EV/moto + hazard reporting; Open-Meteo weather with rain voice alert; events/RSVP + derived monthly leaderboard (500 km target); privacy zones (trim start/end on export, suppress live broadcast inside); battery-saver (Balanced/50m GPS, IMU off, 30s poll, crash watch never gated); trilingual UI+voice (si/ta by non-native — needs native-speaker review before store release); Ride HUD (speed/arrow/instruction/distance) as the CarPlay/Android Auto interim.
Constraints: Expo SDK 57 / RN 0.86.3 / React 19.2.3 pinned everywhere; MapLibre new-arch only (no Expo Go, prebuild required); DB stores GPX text (fine to 100s of rides; Supabase Storage later); VALHALLA_URL self-host local, absent in prod by design (fallback covers prod); CarPlay blocked (unmaintained RN lib + Apple entitlement + MFi + macOS + car hardware); BRouter on-device needs native Java + Android build env; template rule: default transformer identity (raw tRPC inputs), no orphan :3000 squatters (kill via /tmp/opencode/freeport.py, never pkill -f).
Undecided: Supabase Storage migration timing; SSE vs polling threshold; hosted-Valhalla prod timing.

## Brand Commitments

Name: Roto (රොටෝ / ரோட்டோ). Identity: "night highway" — LK sign-yellow signal on wet asphalt; dark-first. Web tokens: dark bg asphalt oklch(0.19 0.015 250), signal-amber primary oklch(0.84 0.16 84), 14px radius; native mirror in apps/native/lib/roto-theme.ts (ROTO consts are the native theme). Voice: rider-direct, plain words; controls name their action; errors name the problem and the recovery. Trilingual wordmark; OMT/OSM attribution always on maps. No tracking promise.

## Evidence on Hand

Feature research: context/sri-lanka-foss-motorcycle-app-research-and-feature-matrix.md. Product/architecture: context/about.md, context/architecture.md. Live data: 10 POI seeds (packages/db/src/seed/pois.lk.ts), 5 curated LK routes via curated.* router, monthly leaderboard proven (RiderA 77.5 km). Proven flows: loop 107.5 km/80 steps; hazard round-trips to DB; 2-user live share via code; privacy set→list→trim 5→3 pts. Absences future work must not fabricate: no testimonials, no benchmarks vs incumbents, no pricing (forever free), no store ratings.

## Product Principles

1. Offline is the product, not a mode — hills, rain, and dead zones are the design baseline.
2. Thumb-first at 60 km/h — glanceable HUD, giant START/STOP/SOS, zero typing while riding.
3. Safety never sleeps — crash watch and SOS stay on even in battery-saver.
4. Privacy is local — zone starts/ends never leave the phone; no tracking, ever.
5. Trilingual or it didn't ship — every rider-facing string in en/si/ta with voice to match.

## Accessibility & Inclusion

Trilingual (Sinhala/Tamil/English) UI + si-LK/ta-LK/en-LK voice; glove-friendly ≥44pt touch targets; reduced-motion honored (HUD arrow/press springs collapse); high-contrast night legibility; screen-reader names on ride controls; keyboard-complete web planner.
