// ponytail: this file only exists so `@roto-app/api/lib/routing` keeps resolving — the package's
// `exports` map (`"./*": "./src/*.ts"`) needs a literal `routing.ts`, it can't fall back to a
// directory's `index.ts`. The real implementation is the `./routing/` folder (§3.3 rewrite);
// packages/db/src/seed/curated.ts imports `planRoute` from this exact path and isn't ours to edit.
export * from "./routing/index";
