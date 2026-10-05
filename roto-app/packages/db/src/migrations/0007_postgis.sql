-- 0007 postgis: turns PostGIS on. Additive only — see feature-parity-plan §2 A3, §6 0007.
-- The local dev Postgres image (postgis:16-3.4) already ships the extension; prod's provider
-- must allow CREATE EXTENSION (Decision D2, still open). extensionsFilters: ['postgis'] in
-- drizzle.config.ts keeps drizzle-kit from diffing postgis's own internal tables afterwards.
CREATE EXTENSION IF NOT EXISTS postgis;
