// @ts-check
// `npm run check:browser`: one bounded foreground command that serves dist/ on an ephemeral
// port under /preview/, drives a locally installed Chrome/Chromium headless through
// playwright-core (no browser download), exercises the page's primary interactions at
// 320 / 768 / 1280 CSS px, measures rendered contrast pairs from computed styles, saves
// screenshots to docs/validation/screenshots/ and a JSON record to docs/validation/browser-check.json,
// then shuts everything down. Exits non-zero on any hard failure.
//
//   CHROME_PATH=/path/to/chrome npm run check:browser
import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { DIST, ROOT, serveStatic } from "./lib.mjs";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/opt/google/chrome/chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter((p) => typeof p === "string");

async function findChrome() {
  for (const p of CANDIDATES) {
    try { await fs.access(/** @type {string} */ (p)); return /** @type {string} */ (p); } catch {}
  }
  throw new Error("No Chrome/Chromium found; set CHROME_PATH");
}

const OUT = path.join(ROOT, "docs", "validation");
const SHOTS = path.join(OUT, "screenshots");
await fs.mkdir(SHOTS, { recursive: true });

/** @type {string[]} */
const failures = [];
/** @param {boolean} cond @param {string} msg */
const expect = (cond, msg) => { if (!cond) failures.push(msg); };

const executablePath = await findChrome();
const { url, close } = await serveStatic(DIST);
const browser = await chromium.launch({ executablePath, headless: true });
/** @type {Record<string, any>} */
const record = { url, executablePath, viewports: {}, interactions: {}, contrast: [], console: [], failedRequests: [] };

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  /** @type {{ type: string, text: string, url: string }[]} */
  const consoleMsgs = [];
  /** @type {string[]} */
  const failed = [];
  page.on("console", (m) => consoleMsgs.push({ type: m.type(), text: m.text(), url: m.location().url }));
  page.on("requestfailed", (r) => failed.push(`${r.url()} ${r.failure()?.errorText ?? ""}`));
  page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.url()} HTTP ${r.status()}`); });

  // Page-side probe shared by every viewport.
  const probe = () => ({
    title: document.title,
    mode: document.querySelector("#mode")?.textContent ?? "",
    count: document.querySelector("#count")?.textContent ?? "",
    bar: document.querySelector("#bar")?.getAttribute("width") ?? "",
    tests: [...document.querySelectorAll("#tests li")].map((li) => ({
      name: li.querySelector("b")?.textContent ?? "",
      status: li.querySelector("span")?.className ?? "",
      text: li.querySelector("span")?.textContent ?? "",
    })),
    images: [...document.images].map((i) => ({ src: i.getAttribute("src") ?? "", loaded: i.complete && i.naturalWidth > 0 })),
    figures: document.querySelectorAll("figure").length,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    gridColumns: getComputedStyle(/** @type {Element} */ (document.querySelector(".grid"))).gridTemplateColumns.split(" ").length,
    fontA: document.fonts.check("12px A"),
    lang: document.documentElement.lang,
    h1: document.querySelectorAll("h1").length,
    buttonBox: (() => { const r = document.querySelector("#connect")?.getBoundingClientRect(); return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null; })(),
  });

  const waitForTests = async () => {
    // Local, deterministic checks: json, font, gate, local storage, inline script.
    await page.waitForFunction(() => ["json", "font", "gate", "ls", "wallet"].every((id) => document.querySelector("#t-" + id)?.textContent !== "waiting"), null, { timeout: 20000 });
  };

  for (const [name, width, height] of /** @type {[string, number, number][]} */ ([["mobile-320", 320, 640], ["tablet-768", 768, 900], ["desktop-1280", 1280, 900]])) {
    await page.setViewportSize({ width, height });
    await page.goto(url, { waitUntil: "load" });
    await waitForTests();
    // Lazy images below the fold only load on scroll; scroll to the end so every figure is requested.
    await page.evaluate(async () => {
      for (let y = 0; y <= document.documentElement.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
      window.scrollTo(0, 0);
    });
    await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 20000 });
    const r = await page.evaluate(probe);
    record.viewports[name] = r;
    expect(r.title === "Rock Garden", `${name}: title`);
    expect(r.figures === 40 && r.images.length === 40, `${name}: expected 40 figures/images, got ${r.figures}/${r.images.length}`);
    expect(r.images.every((i) => i.loaded), `${name}: not every image rendered: ${r.images.filter((i) => !i.loaded).map((i) => i.src).join(", ")}`);
    expect(!r.overflowX, `${name}: horizontal overflow (${r.scrollWidth} > ${r.clientWidth})`);
    expect(r.fontA, `${name}: font A (fonts/alpha.woff2) not available`);
    expect(r.mode === "mode: draft (published)", `${name}: mode text is ${JSON.stringify(r.mode)}`);
    expect(r.count === "80 stones", `${name}: count text is ${JSON.stringify(r.count)} (data.json is unchanged upstream, expected "80 stones")`);
    const t = Object.fromEntries(r.tests.map((x) => [x.name, x]));
    for (const k of ["same-origin json", "font loaded", "local storage", "url override gated", "inline script ran", "wallet api"]) {
      expect(t[k]?.status === "ok", `${name}: self-test "${k}" is ${t[k]?.status} (${t[k]?.text})`);
    }
    const shot = path.join(SHOTS, `${name}.jpg`);
    await page.screenshot({ path: shot, type: "jpeg", quality: 70 });
    record.viewports[name].screenshot = path.relative(ROOT, shot);
    if (width === 320) {
      // Second mobile shot scrolled to the image grid, so the single-column reflow is visible.
      await page.evaluate(() => document.querySelector(".grid")?.scrollIntoView());
      const grid = path.join(SHOTS, `${name}-grid.jpg`);
      await page.screenshot({ path: grid, type: "jpeg", quality: 70 });
      record.viewports[name].screenshotGrid = path.relative(ROOT, grid);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    if (width === 320) {
      // Responsive sanity: at 320 the grid must collapse to a single column.
      expect(r.gridColumns === 1, `${name}: grid has ${r.gridColumns} columns, expected 1`);
    }
  }

  // --- Interactions (desktop) ---
  // 1. Removed images really are gone from the export (server returns 404).
  const gone = await page.evaluate(async () => (await fetch("img/stone-41.png")).status);
  record.interactions.removedImageStatus = gone;
  expect(gone === 404, `img/stone-41.png should be absent (got HTTP ${gone})`);

  // 2. URL override is ignored now that preview is false.
  await page.goto(url + "?mode=live", { waitUntil: "load" });
  await waitForTests();
  const override = await page.evaluate(() => ({ mode: document.querySelector("#mode")?.textContent, gate: document.querySelector("#t-gate")?.textContent }));
  record.interactions.urlOverride = override;
  expect(override.mode === "mode: draft (published)", `?mode=live should be ignored, got ${override.mode}`);
  expect(override.gate === "ok · published ignores ?mode", `gate text ${override.gate}`);

  // 3. Details disclosure via keyboard, then wallet button via click (no injected provider in headless Chrome -> deep links).
  await page.goto(url, { waitUntil: "load" });
  await waitForTests();
  const tabOrder = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    tabOrder.push(await page.evaluate(() => { const a = document.activeElement; return a ? a.tagName.toLowerCase() + (a.id ? "#" + a.id : "") : "none"; }));
  }
  record.interactions.tabOrder = tabOrder;
  expect(tabOrder.includes("button#connect") && tabOrder.includes("summary"), `tab order ${tabOrder.join(" > ")} should reach the button and the summary`);
  await page.focus("summary");
  const focusRing = await page.evaluate(() => { const s = getComputedStyle(/** @type {Element} */ (document.activeElement)); return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, outlineColor: s.outlineColor }; });
  record.interactions.summaryFocusRing = focusRing;
  await page.screenshot({ path: path.join(SHOTS, "desktop-focus-summary.jpg"), type: "jpeg", quality: 70 });
  await page.focus("#connect");
  record.interactions.buttonFocusRing = await page.evaluate(() => { const s = getComputedStyle(/** @type {Element} */ (document.activeElement)); return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, outlineColor: s.outlineColor }; });
  await page.screenshot({ path: path.join(SHOTS, "desktop-focus-button.jpg"), type: "jpeg", quality: 70 });
  await page.focus("summary");
  await page.keyboard.press("Enter");
  const detailsOpen = await page.evaluate(() => document.querySelector("details")?.open ?? false);
  record.interactions.detailsOpensWithEnter = detailsOpen;
  expect(detailsOpen, "details should open with Enter on summary");
  await page.click("#connect");
  const wout = await page.evaluate(() => [...document.querySelectorAll("#wout a")].map((a) => ({ text: a.textContent, href: a.getAttribute("href") })));
  record.interactions.connectWallet = wout;
  expect(wout.length === 3, `Connect wallet without a provider should render 3 deep links, got ${wout.length}`);
  await page.screenshot({ path: path.join(SHOTS, "desktop-after-connect.jpg"), type: "jpeg", quality: 70 });

  // 4. Iframe and external chain reads are network dependent; record, do not gate.
  const iframeState = await page.evaluate(() => document.querySelector("#t-iframe")?.textContent);
  const external = await page.evaluate(() => ["call", "batch", "logs", "rpc2"].map((id) => ({ id, text: document.querySelector("#t-" + id)?.textContent })));
  record.interactions.iframe = iframeState;
  record.interactions.externalChainReads = external;

  // --- Rendered contrast pairs from computed styles (WCAG 2.x relative luminance) ---
  const contrast = await page.evaluate(() => {
    /** @param {string} c */
    const rgb = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); const p = m ? m[1].split(",").map(Number) : [0, 0, 0, 1]; return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
    /** @param {{r:number,g:number,b:number}} c */
    const lum = (c) => { const f = (/** @type {number} */ v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    /** @param {{r:number,g:number,b:number}} fg @param {{r:number,g:number,b:number}} bg @param {number} alpha */
    const blend = (fg, bg, alpha) => ({ r: fg.r * alpha + bg.r * (1 - alpha), g: fg.g * alpha + bg.g * (1 - alpha), b: fg.b * alpha + bg.b * (1 - alpha) });
    /** @param {{r:number,g:number,b:number}} a @param {{r:number,g:number,b:number}} b */
    const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return Math.round(((h + 0.05) / (l + 0.05)) * 100) / 100; };
    const bodyBg = rgb(getComputedStyle(document.body).backgroundColor);
    /** @param {string} label @param {string} sel @param {string=} bgSel */
    const pair = (label, sel, bgSel) => {
      const el = /** @type {HTMLElement|null} */ (document.querySelector(sel));
      if (!el) return { label, missing: true };
      const cs = getComputedStyle(el);
      const bgEl = bgSel ? /** @type {HTMLElement} */ (document.querySelector(bgSel)) : null;
      const bg = bgEl ? rgb(getComputedStyle(bgEl).backgroundColor) : bodyBg;
      const fg = blend(rgb(cs.color), bg, Number(cs.opacity) * rgb(cs.color).a);
      return { label, fg: cs.color, opacity: cs.opacity, bg: bgEl ? getComputedStyle(bgEl).backgroundColor : getComputedStyle(document.body).backgroundColor, fontSize: cs.fontSize, ratio: ratio(fg, bg) };
    };
    // .wait and .bad are transient states; measure them on temporary spans that are removed again.
    const li = /** @type {HTMLElement} */ (document.querySelector("#tests li"));
    const tmp = ["wait", "bad"].map((c) => { const sp = document.createElement("span"); sp.className = c; sp.id = "probe-" + c; sp.textContent = "x"; li.appendChild(sp); return sp; });
    const out = [
      pair("body text on page", "h1"),
      pair("figcaption (opacity .6) on page", "figcaption"),
      pair("test ok status", "#tests .ok"),
      pair("test waiting status (.wait)", "#probe-wait"),
      pair("test failed status (.bad)", "#probe-bad"),
      pair("button label on button", "#connect", "#connect"),
      pair("summary on page", "summary"),
      pair("wallet deep link (browser default link color) on page", "#wout a"),
      pair("details body text on page", "details p"),
    ];
    for (const t of tmp) t.remove();
    return out;
  });
  record.contrast = contrast;
  for (const c of contrast) {
    if ("ratio" in c && typeof c.ratio === "number") {
      const small = parseFloat(String(c.fontSize)) < 18.66;
      expect(c.ratio >= (small ? 4.5 : 3), `contrast ${c.label}: ${c.ratio}:1 at ${c.fontSize} (needs ${small ? 4.5 : 3}:1)`);
    }
  }

  record.console = consoleMsgs;
  record.failedRequests = failed;
  const sameOriginFailures = failed.filter((f) => f.startsWith(url) && !f.includes("img/stone-41.png HTTP 404")); // the 404 for stone-41 is the deliberate probe above
  expect(sameOriginFailures.length === 0, `same-origin resource failures: ${sameOriginFailures.join("; ")}`);
  const errors = consoleMsgs.filter((m) => m.type === "error" && !/net::ERR|Failed to load resource|ERR_/.test(m.text));
  expect(errors.length === 0, `console errors: ${errors.map((e) => e.text).join("; ")}`);
  await context.close();
} finally {
  await browser.close();
  await close();
}

// Findings that are real but cannot be corrected in this repository: the assignment publishes
// the upstream page byte-for-byte apart from the trim and the preview flag. They are reported
// every run as "known" rather than hidden, and do not fail the check.
const KNOWN = [
  ["contrast wallet deep link", "index.html:98 uses browser-default link colour for the MetaMask/Coinbase/Rainbow deep links; the verbatim-mirror brief forbids adding a style rule. Reported to the owner in docs/validation/validation.md."],
];
/** @type {{ finding: string, reason: string }[]} */
const known = [];
const open = failures.filter((f) => {
  const k = KNOWN.find(([prefix]) => f.startsWith(prefix));
  if (k) known.push({ finding: f, reason: k[1] });
  return !k;
});
record.knownFindings = known;
record.failures = open;
record.result = open.length ? "FAIL" : "PASS";
record.checkedAt = new Date().toISOString();
await fs.writeFile(path.join(OUT, "browser-check.json"), JSON.stringify(record, null, 2) + "\n");
console.log(`browser-check: ${record.result} (${open.length} failure(s), ${known.length} known unfixable finding(s)); record at docs/validation/browser-check.json`);
for (const f of open) console.log(" - FAIL " + f);
for (const k of known) console.log(" - KNOWN " + k.finding);
process.exit(open.length ? 1 : 0);
