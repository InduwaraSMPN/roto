# About — Roto

Free, open-source, offline-first motorcycle app for Sri Lanka. For new riders and new brands in an expanding market. Forever free, no tracking. See `architecture.md`.

## Why (live search Sept 13, 2026)

No LK FOSS all-in-one moto app exists. Found only partials: PickMe (hailing), TRAVEL Lanka (rentals), SriLankaSafe (tourist SOS), Beep (bus/train), Riyasewana (marketplace), Club Sha (tours), Bikemap/Komoot (cycling only). Global FOSS (PeakMoto, openGpx, ESP32 HUDs) is early and not LK-specific.

Market is growing: Yamamoto bringing Voge/Zonsen/Lifan (Apr 2026), Revolt RV1/RV1+ electrics (2025), Bajaj/KTM/Hero/Haojue expansion, 38k+ registrations Aug 2025.

## What it combines

Nav: curvy/twisty + round-trip + TBT voice + global offline + CarPlay/Auto + GPX io (REVER/calimoto/Scenic/Kurviger/Motobit). Safety/community: crash detect + SOS + live groups + public routes + challenges (Detecht/ESR/Cardo/Beeline).

LK-only: Sinhala/Tamil/English, hill-country offline packs (Colombo, Kandy-Nuwara Eliya, Ella, Galle), monsoon/Poya closures, LK hazards, fuel/EV, service/spares/dealer dir (Bajaj/Hero/Honda/Yamaha/KTM/Voge), learner help.

## Stack / status

Expo 57 + MapLibre offline + Next.js planner + Hono/tRPC + Postgres/Drizzle/Supabase. Scaffolded in `roto-app/`, types green, MapLibre + 4 LK packs in.
