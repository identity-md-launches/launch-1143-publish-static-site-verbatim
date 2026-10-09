// @ts-check
// `npm run manifest`: regenerate dist/MANIFEST-PUBLISHED.txt (sha256sum format, one line per
// file in dist/, sorted, excluding the manifest itself). Only needed after an intentional
// change to dist/; `npm run build` fails until the manifest matches again.
import { promises as fs } from "node:fs";
import path from "node:path";
import { DIST, PUBLISHED_MANIFEST, buildManifestTxt } from "./lib.mjs";

const text = await buildManifestTxt(DIST);
await fs.writeFile(path.join(DIST, PUBLISHED_MANIFEST), text);
console.log(`manifest: wrote ${PUBLISHED_MANIFEST} with ${text.trim().split("\n").length} entries`);
