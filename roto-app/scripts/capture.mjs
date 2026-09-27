#!/usr/bin/env node
/**
 * Visual QA harness — full-page screenshots of every route in light + dark,
 * desktop + mobile.
 *
 *   node scripts/visual-qa.mjs                 # all routes, both themes, both viewports
 *   node scripts/visual-qa.mjs --route /cv     # a single route (any path works)
 *   node scripts/visual-qa.mjs --theme dark    # a single theme
 *   node scripts/visual-qa.mjs --route /cv --slice 1100   # readable bands, not one tall shot
 *   node scripts/visual-qa.mjs --route /cv --audit        # list horizontal-overflow offenders
 *
 * Why this exists rather than a Playwright dependency: it drives the system
 * Chrome over the DevTools Protocol directly. No npm install, no ~500MB browser
 * download, no daemon to leak. Node 22+ ships `fetch` and `WebSocket`, which is
 * all the protocol needs.
 *
 * Requires a server already running (`bun dev`, or `next build && next start`)
 * and a Chrome install. Point at a non-default port with
 * `VISUAL_QA_BASE=http://localhost:3210`. Output lands in `.visual-qa/`.
 *
 * ── What a capture has to wait for ───────────────────────────────────────────
 * A full-page screenshot is easy to take and easy to get wrong. Three things
 * have to be true before the shutter, or the image is a lie:
 *
 *   1. Scroll reveals. `whileInView` only fires for content that has actually
 *      been in the viewport, so the viewport is first grown to the document's
 *      full scrollHeight — every element in view at once — before capturing.
 *   2. The app's own data. These pages fetch collections client-side, and a
 *      loading skeleton has a *stable height*, so height polling alone will
 *      happily confirm "settled" mid-fetch and shoot grey bars. Hence the CDP
 *      Network domain and `waitForNetworkIdle()`.
 *   3. Images and fonts. A lazy image that never enters the viewport never
 *      fires `load`, so the settle expression races `document.fonts.ready` and
 *      all image loads against a timeout rather than awaiting them forever.
 *
 * The whole thing runs in a settle loop: wait for idle, settle assets, poll for
 * a stable height, re-check idle, and grow the viewport if the document got
 * taller. Only a pass that neither grew nor went busy is allowed to capture.
 *
 * ── Theme parity ─────────────────────────────────────────────────────────────
 * Both themes are captured from ONE settled page load — toggle the class,
 * capture, toggle, capture — so a light/dark pair is guaranteed to differ only
 * in colour. It also makes the run a theme-parity check: the harness warns if
 * the document height moves when the tokens flip.
 *
 * ── The trap that took longest to find ───────────────────────────────────────
 * Do NOT measure the document height after growing the viewport. The site's
 * root wrapper carries `min-height: 100vh`, so growing the viewport to the
 * document height makes `100vh` that value, which makes the wrapper taller,
 * which makes the document taller, which makes the next grow larger. It
 * diverges by a fixed 35px per pass — enough to look like run-to-run jitter and
 * to be misread as a light/dark layout difference, which is exactly how it was
 * misdiagnosed at first. So: the height is measured at the natural viewport,
 * the viewport is grown exactly once, and the parity check compares two raw
 * reads taken in the same state so the inflation cancels out.
 *
 * With that in place the capture height is deterministic.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME_CANDIDATES = [
	process.env.CHROME_PATH,
	"C:/Program Files/Google/Chrome/Application/chrome.exe",
	"C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
	"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium",
].filter(Boolean);

const PORT = Number(process.env.VISUAL_QA_PORT || 9333);
const BASE = process.env.VISUAL_QA_BASE || "http://localhost:3000";
const OUT = path.resolve(".visual-qa");

const ROUTES = [
	{ name: "home", url: "/" },
	{ name: "plan", url: "/plan" },
	{ name: "dashboard", url: "/dashboard" },
	{ name: "login", url: "/login" },
];

const VIEWPORTS = [
	{ name: "desktop", width: 1440, height: 900 },
	{ name: "mobile", width: 390, height: 844, mobile: true },
];

/* ---------------------------------------------------------------- args ---- */

const argv = process.argv.slice(2);
const flag = (name) => {
	const i = argv.indexOf(`--${name}`);
	return i >= 0 ? argv[i + 1] : undefined;
};

const onlyRoute = flag("route");
const onlyTheme = flag("theme");

/**
 * `--slice <px>` splits tall pages into readable bands instead of one
 * full-page shot. A 1440x4200 capture is unreadable when scaled to fit a
 * review pane; 1440x1100 bands are not.
 */
const sliceHeight = Number(flag("slice")) || 0;

/**
 * `--audit` skips screenshots and instead reports horizontal-overflow
 * offenders. A page that is merely "cut off" in a screenshot is hard to
 * diagnose by eye; this names the element and its width.
 */
const audit = argv.includes("--audit");

/** Any path can be shot, not just the curated list — e.g. `--route /qa-admin-preview`. */
function routeFromPath(url) {
	const known = ROUTES.find((r) => r.url === url);
	if (known) return known;
	const name = url
		.replace(/^\//, "")
		.replace(/[^a-z0-9]+/gi, "-")
		.replace(/^-|-$/g, "");
	return { name: name || "root", url };
}

const routes = onlyRoute ? [routeFromPath(onlyRoute)] : ROUTES;
const themes = onlyTheme ? [onlyTheme] : ["light", "dark"];

if (routes.length === 0) {
	console.error(`No route matches --route ${onlyRoute}`);
	process.exit(1);
}

/* --------------------------------------------------------------- helpers --- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Finds elements sticking out past the viewport. Sorted shallowest-first,
 * because the outermost offender is almost always the actual cause and
 * everything inside it is just fallout.
 *
 * Anything inside a `[data-bleed]` subtree is skipped — that attribute is the
 * documented opt-out for content meant to exceed its container, which in this
 * codebase means the marquee ticker and the mobile admin index scroller.
 */
const AUDIT_EXPR = `(() => {
	const vw = document.documentElement.clientWidth;
	const offenders = [];
	for (const el of document.querySelectorAll("body *")) {
		if (el.closest("[data-bleed]")) continue;
		const r = el.getBoundingClientRect();
		if (r.width === 0 && r.height === 0) continue;
		if (r.right <= vw + 1 && r.left >= -1) continue;
		let depth = 0;
		for (let p = el; p.parentElement; p = p.parentElement) depth++;
		offenders.push({
			el: el,
			tag: el.tagName.toLowerCase(),
			cls: typeof el.className === "string" ? el.className.slice(0, 120) : "",
			text: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 48),
			left: Math.round(r.left),
			right: Math.round(r.right),
			width: Math.round(r.width),
			depth: depth,
		});
	}
	offenders.sort((a, b) => a.depth - b.depth || b.right - a.right);

	// Leaves wider than the viewport are where the width actually comes from;
	// every ancestor is just stretched to match.
	const leaves = [];
	for (const el of document.querySelectorAll("body *")) {
		if (el.closest("[data-bleed]")) continue;
		if (el.children.length > 0) continue;
		const r = el.getBoundingClientRect();
		if (r.width <= vw + 1) continue;
		const cs = getComputedStyle(el);
		leaves.push({
			tag: el.tagName.toLowerCase(),
			cls: typeof el.className === "string" ? el.className.slice(0, 110) : "",
			text: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 60),
			width: Math.round(r.width),
			whiteSpace: cs.whiteSpace,
			overflowWrap: cs.overflowWrap,
			minWidth: cs.minWidth,
		});
	}
	leaves.sort((a, b) => b.width - a.width);

	// Elements that cannot shrink: nowrap text, or an explicit pixel width.
	// These are what actually set a container's min-content size.
	const rigid = [];
	for (const el of document.querySelectorAll("body *")) {
		if (el.closest("[data-bleed]")) continue;
		const cs = getComputedStyle(el);
		const nowrap = cs.whiteSpace === "nowrap" || cs.whiteSpace === "pre";
		const fixed = cs.width.endsWith("px") && parseFloat(cs.width) >= 260 && cs.flexShrink === "0";
		if (!nowrap && !fixed) continue;
		const r = el.getBoundingClientRect();
		if (r.width < 60) continue;
		rigid.push({
			width: Math.round(r.width),
			why: nowrap ? "nowrap" : "fixed",
			cls: typeof el.className === "string" ? el.className.slice(0, 90) : "",
			text: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 44),
		});
	}
	rigid.sort((a, b) => b.width - a.width);

	// The ancestor chain of the widest offender, with the sizing properties
	// that actually decide the width. This is what turns "something is 586px"
	// into "this grid track is 586px because of this".
	const chain = [];
	const seed = offenders[0];
	let seedEl = null;
	if (seed) {
		seedEl = seed.el;
		let node = seedEl;
		while (node && node !== document.body) {
			const cs = getComputedStyle(node);
			const r = node.getBoundingClientRect();
			chain.unshift({
				tag: node.tagName.toLowerCase(),
				cls: typeof node.className === "string" ? node.className.slice(0, 90) : "",
				width: Math.round(r.width),
				display: cs.display,
				cols: cs.gridTemplateColumns.slice(0, 60),
				minWidth: cs.minWidth,
				overflowX: cs.overflowX,
			});
			node = node.parentElement;
		}
	}

	// Direct min-content measurement. Temporarily forcing width:min-content
	// and reading it back is the only reliable way to learn what a box would
	// shrink to — and it names the box that sets the floor.
	const minContent = [];
	{
		const seen = new Set();
		for (const o of offenders.slice(0, 8)) {
			for (const el of [o.el, ...o.el.querySelectorAll("*")]) {
				if (seen.has(el)) continue;
				seen.add(el);
				const prev = el.style.width;
				el.style.width = "min-content";
				const w = el.getBoundingClientRect().width;
				el.style.width = prev;
				if (w < 80) continue;
				minContent.push({
					min: Math.round(w),
					tag: el.tagName.toLowerCase(),
					cls: typeof el.className === "string" ? el.className.slice(0, 80) : "",
					text: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 40),
				});
			}
		}
		minContent.sort((a, b) => b.min - a.min);
	}

	return {
		vw: vw,
		scrollWidth: document.documentElement.scrollWidth,
		count: offenders.length,
		top: offenders.slice(0, 6).map((o) => ({
			tag: o.tag,
			cls: o.cls,
			text: o.text,
			left: o.left,
			right: o.right,
			width: o.width,
			depth: o.depth,
		})),
		leaves: leaves.slice(0, 6),
		rigid: rigid.slice(0, 8),
		chain: chain,
		minContent: minContent.slice(0, 8),
	};
})()`;

/**
 * Resolves once fonts and every image in the document have settled, or after
 * `ms` — whichever comes first.
 *
 * The timeout is essential: a lazy-loaded image that never enters the viewport
 * never fires `load`, so waiting on it unconditionally hangs the capture.
 */
const settleExpr = (ms) => `Promise.race([
	Promise.all([
		document.fonts.ready,
		...Array.from(document.images)
			.filter((img) => !img.complete)
			.map((img) => new Promise((res) => {
				img.addEventListener("load", res, { once: true });
				img.addEventListener("error", res, { once: true });
			})),
	]),
	new Promise((res) => setTimeout(res, ${ms})),
]).then(() => true)`;

function findChrome() {
	for (const c of CHROME_CANDIDATES) {
		if (fs.existsSync(c)) return c;
	}
	throw new Error("No Chrome/Edge binary found. Set CHROME_PATH to your browser executable.");
}

async function waitForDebugPort() {
	for (let i = 0; i < 60; i++) {
		try {
			const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
			if (res.ok) return res.json();
		} catch {
			// not up yet
		}
		await sleep(500);
	}
	throw new Error("Chrome never exposed its debugging port");
}

/** Minimal DevTools Protocol client over the built-in WebSocket. */
class CDP {
	constructor(ws) {
		this.ws = ws;
		this.seq = 0;
		this.pending = new Map();
		this.events = [];
		this.sessionId = null;
		this.inflight = 0;
		ws.addEventListener("message", (ev) => {
			const msg = JSON.parse(ev.data);
			if (msg.id && this.pending.has(msg.id)) {
				const { resolve, reject } = this.pending.get(msg.id);
				this.pending.delete(msg.id);
				if (msg.error) reject(new Error(JSON.stringify(msg.error)));
				else resolve(msg.result);
			} else if (msg.method) {
				// Track in-flight HTTP requests so captures can wait for the app's
				// own data fetches to finish. Network events are counted only —
				// never buffered, or the event array grows without bound.
				if (msg.method === "Network.requestWillBeSent") {
					this.inflight++;
				} else if (
					msg.method === "Network.loadingFinished" ||
					msg.method === "Network.loadingFailed"
				) {
					this.inflight = Math.max(0, this.inflight - 1);
				} else {
					this.events.push(msg);
				}
			}
		});
	}

	/**
	 * Resolves once no HTTP request has been in flight for `quiet` ms.
	 *
	 * This is the condition that actually matters for this app: pages render a
	 * skeleton and then replace it with data fetched on the client, so a capture
	 * taken on layout stability alone can photograph the skeleton. Returns false
	 * on timeout rather than throwing — a route with a long-poll open should
	 * still be captured.
	 */
	/**
	 * Forgets in-flight requests. Called before each navigation: a request the
	 * previous page abandoned may never emit loadingFinished, which leaves the
	 * counter stuck above zero and makes every later wait report "never idle".
	 */
	resetInflight() {
		this.inflight = 0;
	}

	async waitForNetworkIdle(quiet = 900, timeout = 25000) {
		const started = Date.now();
		let quietSince = null;
		while (Date.now() - started < timeout) {
			if (this.inflight === 0) {
				if (quietSince === null) quietSince = Date.now();
				else if (Date.now() - quietSince >= quiet) return true;
			} else {
				quietSince = null;
			}
			await sleep(100);
		}
		return false;
	}

	send(method, params = {}, useSession = true) {
		const id = ++this.seq;
		const payload = { id, method, params };
		if (useSession && this.sessionId) payload.sessionId = this.sessionId;
		this.ws.send(JSON.stringify(payload));
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			setTimeout(() => {
				if (this.pending.has(id)) {
					this.pending.delete(id);
					reject(new Error(`CDP timeout: ${method}`));
				}
			}, 45000);
		});
	}

	async waitEvent(method, timeout = 30000) {
		const started = Date.now();
		while (Date.now() - started < timeout) {
			const i = this.events.findIndex((e) => e.method === method);
			if (i >= 0) return this.events.splice(i, 1)[0];
			await sleep(60);
		}
		return null;
	}
}

/* ----------------------------------------------------------------- main --- */

async function main() {
	const chromePath = findChrome();
	fs.mkdirSync(OUT, { recursive: true });
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "visual-qa-"));

	const chrome = spawn(
		chromePath,
		[
			"--headless=new",
			"--disable-gpu",
			"--hide-scrollbars",
			"--no-first-run",
			"--no-default-browser-check",
			"--disable-extensions",
			"--disable-background-networking",
			`--remote-debugging-port=${PORT}`,
			`--user-data-dir=${userDataDir}`,
			"about:blank",
		],
		{ stdio: "ignore" },
	);

	try {
		const version = await waitForDebugPort();
		console.log(`${version.Browser}\n`);

		const ws = new WebSocket(version.webSocketDebuggerUrl);
		await new Promise((resolve, reject) => {
			ws.addEventListener("open", resolve, { once: true });
			ws.addEventListener("error", reject, { once: true });
		});

		const cdp = new CDP(ws);
		const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" }, false);
		const attached = await cdp.send("Target.attachToTarget", { targetId, flatten: true }, false);
		cdp.sessionId = attached.sessionId;

		await cdp.send("Page.enable");
		await cdp.send("Runtime.enable");
		await cdp.send("Network.enable");

		const setViewport = (vp, height) =>
			cdp.send("Emulation.setDeviceMetricsOverride", {
				width: vp.width,
				height,
				deviceScaleFactor: 1,
				mobile: !!vp.mobile,
			});

		const settle = (ms) =>
			cdp.send("Runtime.evaluate", {
				expression: settleExpr(ms),
				awaitPromise: true,
				returnByValue: true,
			});

		const measureHeight = async (min) => {
			const { result } = await cdp.send("Runtime.evaluate", {
				expression:
					"Math.min(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight), 12000)",
				returnByValue: true,
			});
			return Math.max(Number(result.value) || min, min);
		};

		/**
		 * Unclamped document height. Used for the theme-parity comparison, where
		 * both reads happen in the same viewport state — so any inflation
		 * present cancels out and only a genuine difference survives.
		 */
		const rawHeight = async () => {
			const { result } = await cdp.send("Runtime.evaluate", {
				expression:
					"Math.round(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight))",
				returnByValue: true,
			});
			return Number(result.value) || 0;
		};

		/**
		 * Polls until the document height stops changing.
		 *
		 * Waiting for images and fonts is not sufficient: this app renders
		 * collection data fetched at runtime, so a page keeps growing after
		 * first paint. A single settle-then-measure produced 4843px on the
		 * first pass over a route and 5910px on the second, for the same page.
		 */
		const waitForStableHeight = async (min, { tries = 25, interval = 400 } = {}) => {
			let last = -1;
			let stable = 0;
			for (let i = 0; i < tries; i++) {
				const h = await measureHeight(min);
				if (h === last) {
					stable++;
					if (stable >= 3) return h;
				} else {
					stable = 0;
					last = h;
				}
				await sleep(interval);
			}
			return last < 0 ? min : last;
		};

		let failures = 0;
		let shots = 0;

		for (const vp of VIEWPORTS) {
			for (const route of routes) {
				const base = `${route.name}-${vp.name}`;
				try {
					await setViewport(vp, vp.height);
					cdp.resetInflight();

					await cdp.send("Page.navigate", { url: BASE + route.url });
					await cdp.waitEvent("Page.loadEventFired", 30000);
					await sleep(1200); // fonts + first paint
					await settle(3000); // fonts + eagerly-loaded images

					if (audit) {
						const { result: found } = await cdp.send("Runtime.evaluate", {
							expression: AUDIT_EXPR,
							returnByValue: true,
						});
						const a = found.value;
						console.log(
							`\n  ${route.name} @ ${vp.name} — viewport ${a.vw}px, scrollWidth ${a.scrollWidth}px, ${a.count} offender(s)`,
						);
						for (const o of a.top) {
							console.log(
								`    right ${String(o.right).padStart(5)}  w ${String(o.width).padStart(5)}  depth ${String(o.depth).padStart(3)}  <${o.tag}> ${o.cls}`,
							);
							if (o.text) console.log(`      ↳ ${JSON.stringify(o.text)}`);
						}
						if (a.leaves.length) {
							console.log("    widest leaves (where the width comes from):");
							for (const l of a.leaves) {
								console.log(
									`      w ${String(l.width).padStart(5)}  ws:${l.whiteSpace}  wrap:${l.overflowWrap}  <${l.tag}> ${l.cls}`,
								);
								if (l.text) console.log(`        ↳ ${JSON.stringify(l.text)}`);
							}
						}
						if (a.chain.length) {
							console.log("    ancestor chain of the widest offender:");
							for (const c of a.chain) {
								console.log(
									`      w ${String(c.width).padStart(5)}  ${c.display.padEnd(11)} min-w:${(c.minWidth || "").padEnd(6)} ovx:${(c.overflowX || "").padEnd(7)} cols:[${c.cols}]  <${c.tag}> ${c.cls}`,
								);
							}
						}
						if (a.rigid.length) {
							console.log("    rigid elements (cannot shrink):");
							for (const r of a.rigid) {
								console.log(
									`      w ${String(r.width).padStart(5)}  ${r.why.padEnd(6)} <${r.cls}>`,
								);
								if (r.text) console.log(`        ↳ ${JSON.stringify(r.text)}`);
							}
						}
						if (a.minContent.length) {
							console.log("    measured min-content (the floor):");
							for (const m of a.minContent) {
								console.log(`      min ${String(m.min).padStart(5)}  <${m.tag}> ${m.cls}`);
								if (m.text) console.log(`        ↳ ${JSON.stringify(m.text)}`);
							}
						}
						continue;
					}

					// Settle at the NATURAL viewport height, and take the capture
					// height from there.
					//
					// Measuring after growing the viewport is a trap. A wrapper
					// carrying `min-height: 100vh` is inflated by the grow: the
					// document gets taller, so the next grow is larger, so the
					// inflation grows again — diverging by a fixed amount on every
					// pass. On this site that was exactly 35px per pass, which is
					// what made one route measure differently run to run and what
					// the old "layout shifts between themes" warning was really
					// reporting. Measuring at the natural height sidesteps the
					// loop entirely, because `100vh` cannot exceed a viewport that
					// is shorter than the content.
					let idle = true;
					let fullHeight = await measureHeight(vp.height);
					for (let pass = 0; pass < 3; pass++) {
						const quiet = await cdp.waitForNetworkIdle();
						await settle(20000);
						const stable = await waitForStableHeight(vp.height);
						const stillQuiet = await cdp.waitForNetworkIdle(600, 8000);

						idle = quiet && stillQuiet;
						const settled = stable === fullHeight;
						fullHeight = stable;
						if (idle && settled) break;
					}

					// Grow once, so every whileInView reveal fires and every lazy
					// image enters the viewport. Deliberately no re-measure after
					// this: the height above is the honest one, and re-measuring
					// here is what fed the loop.
					await setViewport(vp, fullHeight);
					await settle(20000);
					await sleep(1600); // let the entrances settle

					// Baseline for the theme-parity check, taken in whatever theme
					// the page happened to load in.
					const parityBase = await rawHeight();

					const bands = [];
					if (sliceHeight > 0 && fullHeight > sliceHeight) {
						for (let y = 0; y < fullHeight; y += sliceHeight) {
							bands.push({ y, height: Math.min(sliceHeight, fullHeight - y) });
						}
					} else {
						bands.push({ y: 0, height: fullHeight });
					}

					// Both themes are captured from this one settled document, so
					// the pair is guaranteed to differ only in colour. Capturing
					// each theme from its own page load let layout drift between
					// them — the same route came out 35px apart.
					for (const theme of themes) {
						const label = `${base}-${theme}`;
						try {
							// next-themes uses attribute="class", so the theme is a class.
							await cdp.send("Runtime.evaluate", {
								expression: `document.documentElement.classList.toggle('dark', ${theme === "dark"});`,
							});
							await sleep(450); // let the new tokens paint

							const notes = [];
							if (!idle) notes.push("network never went idle");

							// Theme-parity check: switching tokens should not move
							// anything. Both reads are raw scrollHeight taken in the
							// same viewport state, so the min-height:100vh inflation
							// is common to both and cancels — only a genuine
							// difference survives.
							const raw = await rawHeight();
							if (Math.abs(raw - parityBase) > 1) {
								notes.push(`layout shifts ${raw - parityBase}px between themes`);
							}

							const { result: pending } = await cdp.send("Runtime.evaluate", {
								expression: "Array.from(document.images).filter((i) => !i.complete).length",
								returnByValue: true,
							});
							const missing = Number(pending.value) || 0;
							if (missing > 0) notes.push(`${missing} image(s) never loaded`);

							const written = [];
							for (const [i, band] of bands.entries()) {
								const shot = await cdp.send("Page.captureScreenshot", {
									format: "png",
									captureBeyondViewport: true,
									clip: { x: 0, y: band.y, width: vp.width, height: band.height, scale: 1 },
								});
								const suffix =
									bands.length > 1 ? `-${String(i + 1).padStart(2, "0")}of${bands.length}` : "";
								const file = path.join(OUT, `${label}${suffix}.png`);
								fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
								written.push(Math.round(fs.statSync(file).size / 1024));
								shots++;
							}

							const kb = written.reduce((a, b) => a + b, 0);
							const detail = bands.length > 1 ? `${bands.length} bands` : `${kb} KB`;
							const warn = notes.length ? `  ⚠ ${notes.join("; ")}` : "";
							console.log(`  ok   ${label.padEnd(26)} ${vp.width}x${fullHeight}  ${detail}${warn}`);
						} catch (err) {
							failures++;
							console.log(`  FAIL ${label.padEnd(26)} ${err.message}`);
						}
					}
				} catch (err) {
					failures++;
					console.log(`  FAIL ${base.padEnd(26)} ${err.message}`);
				}
			}
		}

		if (audit) {
			console.log(`\naudit complete — ${failures} failure(s)`);
		} else {
			console.log(`\n${shots} shots -> ${OUT}`);
		}
		if (failures > 0) process.exitCode = 1;
	} finally {
		chrome.kill("SIGKILL");
	}
}

main().catch((err) => {
	console.error("visual-qa failed:", err.message);
	process.exit(1);
});
