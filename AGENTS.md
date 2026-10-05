# Repository Guidelines

## Project Structure & Module Organization

Roto is an offline-first, trilingual motorcycle app for Sri Lanka. Root documents describe the product; source lives in `roto-app/`, an npm-workspaces/Turborepo monorepo.

- `apps/web`: Next.js web app; `apps/server`: Hono/tRPC API; `apps/native`: Expo app and local Android modules.
- `packages/core`: shared logic and translations; `api`, `auth`, `db`, `ui`, and `config`: shared services, schemas, components, and tooling.
- Tests sit beside source as `*.test.ts`. Map assets and infrastructure live in `tiles/`; utilities live in `scripts/`.

Read `PRODUCT.md` and `DESIGN.md` before UI work. Consult `context/architecture.md`, `roto-app/DEPLOY.md`, and `roto-app/DEVICE-TEST.md` for implementation and operational guidance.

## Build, Test, and Development Commands

Run from `roto-app/`:

```powershell
npm run dev          # Web :3001, server :3000, native Metro
npm run dev:web      # Web only; server must run separately
npm run check-types  # Workspace TypeScript checks
npm test             # Turbo runs workspace Vitest suites
npm run build        # Production builds
npm run env:generate # Regenerate types after .env.schema edits
```

After installation on Windows, run `node scripts/patch-varlock-windows.mjs`. Paths containing spaces can break npm shims; use a `subst` drive for npm tooling, but the real path for Gradle. Native MapLibre requires a development build, not Expo Go.

## Coding Style & Naming Conventions

Use TypeScript, double quotes, and existing naming patterns: PascalCase components, camelCase functions, and kebab-case utility files. Match surrounding two-space indentation; Biome specifies tabs, so avoid incidental reformatting. `npm run check` rewrites files repository-wide; use scoped checks instead. Reuse shared helpers and respect `// ponytail:` explanations. Before Next.js changes, read installed documentation in `node_modules/next/dist/docs/` and applicable nested `AGENTS.md` files.

## Testing Guidelines

Core and API use Vitest with `src/**/*.test.ts`; no coverage threshold is configured. Add focused regression tests for changed behavior. Run tests and type checks, then exercise affected app flows; follow `DEVICE-TEST.md` for native changes.

## Commit & Pull Request Guidelines

History commonly uses `feat:`, `feat(native):`, and `docs:` prefixes. Write concise, imperative summaries. PRs should explain behavior, link relevant issues, report validation, and include screenshots for UI changes. Stage, commit, push, or edit GitHub only with explicit approval.

## Security & Product Constraints

Keep secrets in untracked `.env` files. Preserve English/Sinhala/Tamil strings, map attribution, and signal-yellow styling. Never gate SOS or crash watch. Trim privacy-zone points on-device before sync/export; never broadcast positions inside zones.
