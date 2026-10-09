// @ts-check
// `npm run build` / `npm run verify`: there is no build step. This checks that the committed
// dist/ is exactly the published set: every file matches dist/MANIFEST-PUBLISHED.txt, every
// untouched file still matches the source MANIFEST.json, the 40 removed images are absent,
// and index.html / img/index.json carry only the permitted edits.
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  DIST, KEPT_IMAGES, PUBLISHED_MANIFEST, REMOVED_IMAGES, SOURCE_MANIFEST,
  parseManifestTxt, sha256, walk,
} from "./lib.mjs";

/** @type {string[]} */
const errors = [];
/** @param {boolean} cond @param {string} msg */
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const files = await walk(DIST);
const published = parseManifestTxt(await fs.readFile(path.join(DIST, PUBLISHED_MANIFEST), "utf8"));
const source = /** @type {Record<string, string>} */ (JSON.parse(await fs.readFile(path.join(DIST, SOURCE_MANIFEST), "utf8")));

// 1. Published manifest covers every file and every hash matches.
let bytes = 0;
for (const f of files) {
  const data = await fs.readFile(path.join(DIST, f));
  bytes += data.length;
  if (f === PUBLISHED_MANIFEST) continue;
  check(published.has(f), `${f} is in dist/ but not in ${PUBLISHED_MANIFEST}`);
  if (published.has(f)) check(published.get(f) === sha256(data), `${f} does not match ${PUBLISHED_MANIFEST}`);
}
for (const f of published.keys()) check(files.includes(f), `${f} is listed in ${PUBLISHED_MANIFEST} but missing from dist/`);

// 2. Against the source manifest: untouched files identical, removed images absent, nothing extra.
const edited = new Set(["index.html", "img/index.json"]);
const removed = new Set(REMOVED_IMAGES.map((n) => `img/${n}`));
const expected = new Set([SOURCE_MANIFEST, PUBLISHED_MANIFEST]);
for (const [f, hex] of Object.entries(source)) {
  if (removed.has(f)) {
    check(!files.includes(f), `${f} should have been removed from dist/`);
    continue;
  }
  expected.add(f);
  if (edited.has(f)) continue;
  check(files.includes(f), `${f} from MANIFEST.json is missing`);
  if (files.includes(f)) check(sha256(await fs.readFile(path.join(DIST, f))) === hex, `${f} differs from the source MANIFEST.json hash`);
}
for (const f of files) check(expected.has(f), `${f} is not part of the published set`);

// 3. index.html: 40 figures for stone-01…40 only, preview flag flipped, nothing else recognisable changed.
const html = await fs.readFile(path.join(DIST, "index.html"), "latin1");
const figures = html.split("\n").filter((l) => l.startsWith("<figure>"));
check(figures.length === 40, `index.html has ${figures.length} <figure> lines, expected 40`);
const figured = figures.map((l) => /img\/(stone-\d\d\.png)/.exec(l)?.[1]);
check(JSON.stringify(figured) === JSON.stringify(KEPT_IMAGES), "index.html figures are not exactly stone-01…40 in order");
for (const n of REMOVED_IMAGES) check(!html.includes(n), `index.html still mentions ${n}`);
const cfg = html.split("\n").filter((l) => l.startsWith("const CONFIG ="));
check(cfg.length === 1, "index.html must contain exactly one `const CONFIG =` line");
check(cfg[0]?.includes("preview: false"), "CONFIG line must contain `preview: false`");
check(!html.includes("preview: true"), "index.html still contains `preview: true`");
check(!html.endsWith("\n") && !html.includes("\r"), "index.html line-ending shape changed (source has LF and no trailing newline)");
check(html.includes('<meta property="og:image" content="img/stone-01.png">'), "og:image meta tag changed");
check(html.includes('<iframe id="fr" src="https://example.com/"'), "iframe changed");
check(html.includes("@font-face{font-family:A;src:url(fonts/alpha.woff2)}"), "font-face rule changed");

// 4. img/index.json lists exactly the kept names, same single-line style, no trailing newline.
const imgIndexRaw = await fs.readFile(path.join(DIST, "img/index.json"), "latin1");
check(JSON.stringify(JSON.parse(imgIndexRaw)) === JSON.stringify(KEPT_IMAGES), "img/index.json must list exactly stone-01…40");
check(!imgIndexRaw.includes("\n"), "img/index.json must stay a single line without a trailing newline");

// 5. Size budget (the Git bundle limit is 8 MiB; raw bytes are a conservative proxy).
check(bytes < 8 * 1024 * 1024, `dist/ is ${bytes} bytes, over the 8 MiB limit`);

if (errors.length) {
  console.error(`verify: ${errors.length} problem(s)`);
  for (const e of errors) console.error(" - " + e);
  process.exit(1);
}
console.log(`verify: ok — ${files.length} files, ${bytes} bytes in dist/, all hashes match ${PUBLISHED_MANIFEST}`);
