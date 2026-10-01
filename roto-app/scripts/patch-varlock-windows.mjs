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

/**
 * Second Windows fix, same root cause class: the fallback path runs the found `varlock.cmd`
 * through `{ shell: true }`, and Node joins the arguments into one command line with NO
 * quoting. With this repo at `D:\Work\Weekend Projects\...` cmd.exe then tries to run
 * `D:\Work\Weekend` ("'D:\Work\Weekend' is not recognized"), and even when the quoting is
 * patched, spawning through cmd.exe with piped stdio intermittently trips a libuv
 * assertion (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`, src\win\async.c).
 *
 * Fix: skip the .cmd shim entirely and run varlock's real entry point with the current node
 * binary. No shell, no quoting, no cmd.exe in the loop — behaviour is identical because the
 * shim only does `%dp0%\..\varlock\bin\cli.js %*`.
 */
const SHELL_QUOTED_MJS = 'const result = execFileSync(needsShell ? `"${varlockPath}"` : varlockPath, command.split(" "), {';
const SHELL_QUOTED_CJS =
  'const result = (0, node_child_process.execFileSync)(needsShell ? `"${varlockPath}"` : varlockPath, command.split(" "), {';

const NO_SHELL_SPAWN = [
  {
    file: "node_modules/varlock/dist/lib/exec-sync-varlock.mjs",
    altFrom: SHELL_QUOTED_MJS,
    from: `const result = execFileSync(varlockPath, command.split(" "), {
					...childProcessOpts,
					env: execEnv,
					stdio: ["ignore", "pipe", "pipe"],
					...needsShell && { shell: true }
				});`,
    to: `const result = execFileSync(
					process.execPath,
					[path.join(path.dirname(path.dirname(varlockPath)), "varlock", "bin", "cli.js"), ...command.split(" ")],
					{
						...childProcessOpts,
						env: execEnv,
						stdio: ["ignore", "pipe", "pipe"]
					}
				);`,
  },
  {
    file: "node_modules/varlock/dist/lib/exec-sync-varlock.cjs",
    altFrom: SHELL_QUOTED_CJS,
    from: `const result = (0, node_child_process.execFileSync)(varlockPath, command.split(" "), {
					...childProcessOpts,
					env: execEnv,
					stdio: ["ignore", "pipe", "pipe"],
					...needsShell && { shell: true }
				});`,
    to: `const result = (0, node_child_process.execFileSync)(
					process.execPath,
					[node_path.join(node_path.dirname(node_path.dirname(varlockPath)), "varlock", "bin", "cli.js"), ...command.split(" ")],
					{
						...childProcessOpts,
						env: execEnv,
						stdio: ["ignore", "pipe", "pipe"]
					}
				);`,
  },
];

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

for (const { file: rel, from: spawnFrom, altFrom, to: spawnTo } of NO_SHELL_SPAWN) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.log(`skip    ${rel} (no-shell spawn, not installed)`);
    missing++;
    continue;
  }
  let src = fs.readFileSync(file, "utf8");
  if (src.includes(spawnTo)) {
    console.log(`ok      ${rel} (no-shell spawn already patched)`);
    already++;
    continue;
  }
  // `altFrom` is the intermediate shell-quoting form an earlier version of this script wrote;
  // accept it so re-running upgrades the file instead of reporting a miss.
  const useFrom = src.includes(spawnFrom) ? spawnFrom : altFrom && src.includes(altFrom) ? altFrom : null;
  if (!useFrom) {
    console.log(`skip    ${rel} (no-shell spawn pattern not found — varlock version changed?)`);
    missing++;
    continue;
  }
  src = src.replace(useFrom, spawnTo);
  fs.writeFileSync(file, src);
  console.log(`patched ${rel} (no-shell spawn)`);
  patched++;
}

console.log(`\n${patched} patched, ${already} already ok, ${missing} not installed`);

if (patched === 0 && already === 0) {
  console.error("\nNothing was patched — check that dependencies are installed.");
  process.exit(1);
}
