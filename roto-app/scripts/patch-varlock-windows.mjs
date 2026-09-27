#!/usr/bin/env node
/**
 * Re-apply the varlock subprocess fix after `npm install`.
 *
 * Why this is needed on Windows (this machine):
 *   varlock resolves env by shelling out to its own CLI (`varlock load ...`) with
 *   `stdio: "pipe"`, i.e. the child's STDIN is a pipe. In this environment creating
 *   that stdin pipe fails and `spawnSync` returns `EBUSY`, so every varlock load
 *   dies — which takes down the server, the web app, and drizzle-kit, because all
 *   three gate on `varlock/auto-load`.
 *
 *   varlock never reads the child's stdin, so switching the child's stdin to
 *   "ignore" (keeping stdout/stderr piped) is behaviour-preserving and fixes it.
 *
 * `npm install` restores the pristine files, so re-run this afterwards:
 *   node scripts/patch-varlock-windows.mjs
 *
 * Idempotent — safe to run repeatedly.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const TARGETS = [
  "node_modules/varlock/dist/lib/exec-sync-varlock.mjs",
  "node_modules/varlock/dist/lib/exec-sync-varlock.cjs",
  "node_modules/@varlock/nextjs-integration/dist/next-env-compat.cjs",
  // Next resolves @next/env to the varlock package (see package.json "overrides"),
  // but npm materialises it as a SEPARATE copy that must be patched too.
  "node_modules/@next/env/dist/next-env-compat.cjs",
];

const FROM = 'stdio: "pipe"';
const TO = 'stdio: ["ignore", "pipe", "pipe"]';

let patched = 0;
let already = 0;
let missing = 0;

for (const rel of TARGETS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.log(`skip    ${rel} (not installed)`);
    missing++;
    continue;
  }
  const src = fs.readFileSync(file, "utf8");
  const hits = src.split(FROM).length - 1;
  if (hits === 0) {
    console.log(`ok      ${rel} (already patched)`);
    already++;
    continue;
  }
  fs.writeFileSync(file, src.split(FROM).join(TO));
  console.log(`patched ${rel} (${hits} occurrence${hits > 1 ? "s" : ""})`);
  patched++;
}

console.log(`\n${patched} patched, ${already} already ok, ${missing} not installed`);

if (patched === 0 && already === 0) {
  console.error("\nNothing was patched — check that dependencies are installed.");
  process.exit(1);
}
