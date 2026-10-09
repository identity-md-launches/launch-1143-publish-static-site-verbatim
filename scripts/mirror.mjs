// @ts-check
// `npm run mirror`: rebuild dist/ from the upstream source. Downloads index.html, data.json,
// MANIFEST.json, img/index.json, fonts/index.json and every listed image/font into a temp
// directory, verifies every MANIFEST.json entry by sha256 (stops on any mismatch, never
// substitutes content), then writes the published set to dist/: the untouched files
// byte-for-byte, index.html and img/index.json with only the permitted edits, without
// stone-41…80, plus a fresh MANIFEST-PUBLISHED.txt.
//
//   SOURCE_URL=https://host/path/ npm run mirror
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_SOURCE_URL, DIST, KEPT_IMAGES, PUBLISHED_MANIFEST, REMOVED_IMAGES, SOURCE_MANIFEST,
  buildManifestTxt, sha256, trimImgIndex, trimIndexHtml,
} from "./lib.mjs";

const base = (process.env.SOURCE_URL ?? DEFAULT_SOURCE_URL).replace(/\/?$/, "/");
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rock-garden-src-"));

/** @param {string} rel */
async function download(rel) {
  const res = await fetch(new URL(rel, base));
  if (!res.ok) throw new Error(`GET ${rel}: HTTP ${res.status}`);
  const data = new Uint8Array(await res.arrayBuffer());
  const abs = path.join(tmp, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return data;
}

console.log(`mirror: source ${base}`);
for (const f of ["index.html", "data.json", SOURCE_MANIFEST, "img/index.json", "fonts/index.json"]) await download(f);
const imgs = /** @type {string[]} */ (JSON.parse(await fs.readFile(path.join(tmp, "img/index.json"), "utf8")));
const fonts = /** @type {string[]} */ (JSON.parse(await fs.readFile(path.join(tmp, "fonts/index.json"), "utf8")));
for (const n of imgs) await download(`img/${n}`);
for (const n of fonts) await download(`fonts/${n}`);

const manifest = /** @type {Record<string, string>} */ (JSON.parse(await fs.readFile(path.join(tmp, SOURCE_MANIFEST), "utf8")));
const mismatches = [];
for (const [rel, hex] of Object.entries(manifest)) {
  let actual = "missing";
  try { actual = sha256(await fs.readFile(path.join(tmp, rel))); } catch {}
  if (actual !== hex) mismatches.push(`${rel}: expected ${hex}, got ${actual}`);
}
if (mismatches.length) {
  console.error(`mirror: ${mismatches.length} file(s) do not match ${SOURCE_MANIFEST}; nothing written to dist/`);
  for (const m of mismatches) console.error(" - " + m);
  process.exit(1);
}
console.log(`mirror: ${Object.keys(manifest).length} files downloaded and verified against ${SOURCE_MANIFEST}`);

if (JSON.stringify(imgs.slice(0, 40)) !== JSON.stringify(KEPT_IMAGES) || JSON.stringify(imgs.slice(40)) !== JSON.stringify(REMOVED_IMAGES)) {
  throw new Error("img/index.json upstream no longer lists stone-01…80 in order; refusing to guess what to trim");
}

await fs.rm(DIST, { recursive: true, force: true });
await fs.mkdir(path.join(DIST, "img"), { recursive: true });
await fs.mkdir(path.join(DIST, "fonts"), { recursive: true });
for (const f of ["data.json", SOURCE_MANIFEST, "fonts/index.json", ...fonts.map((n) => `fonts/${n}`), ...KEPT_IMAGES.map((n) => `img/${n}`)]) {
  await fs.copyFile(path.join(tmp, f), path.join(DIST, f));
}
await fs.writeFile(path.join(DIST, "index.html"), trimIndexHtml(await fs.readFile(path.join(tmp, "index.html"))));
await fs.writeFile(path.join(DIST, "img/index.json"), trimImgIndex(await fs.readFile(path.join(tmp, "img/index.json"))));
await fs.writeFile(path.join(DIST, PUBLISHED_MANIFEST), await buildManifestTxt(DIST));
await fs.rm(tmp, { recursive: true, force: true });
console.log(`mirror: wrote dist/ (${KEPT_IMAGES.length} images, ${fonts.length} fonts) and ${PUBLISHED_MANIFEST}`);
