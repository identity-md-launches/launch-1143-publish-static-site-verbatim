// @ts-check
// Shared helpers for the rock-garden-test mirror. Zero runtime dependencies.
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DIST = path.join(ROOT, "dist");
export const PUBLISHED_MANIFEST = "MANIFEST-PUBLISHED.txt";
export const SOURCE_MANIFEST = "MANIFEST.json";
export const DEFAULT_SOURCE_URL =
  "https://7130de0a-c74f-4dc3-9a8a-79db37963f97-00-1lk87v2ravyz1.reed.replit.dev/mirror-test/";

/** Image names removed from the published export (stone-41.png … stone-80.png). */
export const REMOVED_IMAGES = Array.from({ length: 40 }, (_, i) => `stone-${String(41 + i).padStart(2, "0")}.png`);
/** Image names kept in the published export (stone-01.png … stone-40.png). */
export const KEPT_IMAGES = Array.from({ length: 40 }, (_, i) => `stone-${String(1 + i).padStart(2, "0")}.png`);

/** @param {Uint8Array} bytes */
export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Recursively list files under `dir`, returned as sorted POSIX-style relative paths.
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
export async function walk(dir) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} rel */
  async function rec(rel) {
    const abs = path.join(dir, rel);
    const entries = await fs.readdir(abs, { withFileTypes: true });
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await rec(r);
      else if (e.isFile()) out.push(r);
    }
  }
  await rec("");
  return out.sort();
}

/**
 * Parse a sha256sum-style manifest ("<hex>  <path>" per line).
 * @param {string} text
 * @returns {Map<string, string>} path -> hex
 */
export function parseManifestTxt(text) {
  const m = new Map();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!match) throw new Error(`Malformed manifest line: ${JSON.stringify(line)}`);
    m.set(match[2], match[1]);
  }
  return m;
}

/**
 * Build the sha256sum-style text for every file in `dir` except the manifest itself.
 * @param {string} dir
 */
export async function buildManifestTxt(dir) {
  const files = (await walk(dir)).filter((f) => f !== PUBLISHED_MANIFEST);
  const lines = [];
  for (const f of files) {
    lines.push(`${sha256(await fs.readFile(path.join(dir, f)))}  ${f}`);
  }
  return lines.join("\n") + "\n";
}

/**
 * Apply the two permitted edits to the source index.html bytes.
 * Only the 40 <figure> lines naming removed images are dropped, and the single
 * `preview: true` on the `const CONFIG =` line becomes `preview: false`.
 * Every other byte, including line endings and the missing trailing newline, is preserved.
 * @param {Uint8Array} source
 */
export function trimIndexHtml(source) {
  const text = Buffer.from(source).toString("latin1"); // byte-transparent
  const lines = text.split("\n");
  const removed = new Set(REMOVED_IMAGES);
  let dropped = 0;
  const kept = lines.filter((line) => {
    const m = /^<figure><img src="img\/(stone-\d\d\.png)"/.exec(line);
    if (m && removed.has(m[1])) {
      dropped++;
      return false;
    }
    return true;
  });
  if (dropped !== 40) throw new Error(`Expected to drop 40 figure lines, dropped ${dropped}`);
  const cfg = kept.findIndex((l) => l.startsWith("const CONFIG ="));
  if (cfg < 0) throw new Error("No line starting with `const CONFIG =`");
  if (kept[cfg].split("preview: true").length !== 2) throw new Error("`preview: true` not found exactly once on the CONFIG line");
  kept[cfg] = kept[cfg].replace("preview: true", "preview: false");
  return Buffer.from(kept.join("\n"), "latin1");
}

/**
 * Drop the removed names from the source img/index.json without reformatting it.
 * @param {Uint8Array} source
 */
export function trimImgIndex(source) {
  let text = Buffer.from(source).toString("latin1");
  for (const name of REMOVED_IMAGES) {
    const token = `, "${name}"`;
    if (text.split(token).length !== 2) throw new Error(`Expected exactly one occurrence of ${token}`);
    text = text.replace(token, "");
  }
  const parsed = JSON.parse(text);
  if (JSON.stringify(parsed) !== JSON.stringify(KEPT_IMAGES)) throw new Error("Trimmed img/index.json does not list exactly stone-01…40");
  return Buffer.from(text, "latin1");
}

const MIME = /** @type {Record<string, string>} */ ({
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
});

/**
 * Serve `dir` under `prefix` (default `/preview/`) so relative asset URLs are exercised
 * the way a gateway subpath would. Resolves with the base URL once listening.
 * @param {string} dir
 * @param {{ port?: number, prefix?: string, host?: string }} [opts]
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export function serveStatic(dir, opts = {}) {
  const prefix = opts.prefix ?? "/preview/";
  const host = opts.host ?? "127.0.0.1";
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let p = url.pathname;
    if (p === prefix.slice(0, -1)) {
      res.writeHead(302, { location: prefix });
      return res.end();
    }
    if (!p.startsWith(prefix)) {
      res.writeHead(404);
      return res.end("not found");
    }
    p = p.slice(prefix.length);
    if (p === "" || p.endsWith("/")) p += "index.html";
    const abs = path.join(dir, path.normalize(decodeURIComponent(p)));
    if (!abs.startsWith(dir + path.sep) && abs !== dir) {
      res.writeHead(403);
      return res.end();
    }
    try {
      const data = await fs.readFile(abs);
      res.writeHead(200, {
        "content-type": MIME[path.extname(abs)] ?? "application/octet-stream",
        "content-length": data.length,
        "cache-control": "no-store",
      });
      res.end(data);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(opts.port ?? 0, host, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : opts.port;
      resolve({
        url: `http://${host}:${port}${prefix}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
