# rock-garden-test

A verbatim static mirror of the upstream "Rock Garden" test page, published under the label
**rock-garden-test**. `dist/` is the deliverable and is served exactly as committed. There is no
build step, no framework and no generated markup: the only differences from the upstream bytes are
the four changes the owner asked for to fit the 8 MiB Git submission limit.

## What is in `dist/`

| Path | State |
| --- | --- |
| `index.html` | Upstream bytes, minus the 40 `<figure>` lines for `stone-41.png`…`stone-80.png`, and `preview: true` → `preview: false` on the `const CONFIG =` line. Nothing else touched (LF line endings and the missing trailing newline are preserved). |
| `img/index.json` | Upstream single-line array with the 40 removed names dropped. |
| `img/stone-01.png` … `stone-40.png` | Upstream bytes. `stone-41` … `stone-80` are not published. |
| `data.json`, `fonts/index.json`, `fonts/*.woff2`, `MANIFEST.json` | Upstream bytes, unchanged. |
| `MANIFEST-PUBLISHED.txt` | sha256 of every file placed in `dist/` (sha256sum format, one line per file, sorted). |

Upstream source: `https://7130de0a-c74f-4dc3-9a8a-79db37963f97-00-1lk87v2ravyz1.reed.replit.dev/mirror-test/`.
The upstream `MANIFEST.json` (88 entries) is kept inside `dist/` so the untouched files can be
re-verified against it at any time. Publish metadata (label, entry, source) is in `publish.json`.

## Install

Node 20 or newer. Only dev tooling is installed; the site itself has no dependencies.

```sh
npm install
```

## Preview

Serves the committed `dist/` under a subpath so relative asset URLs are exercised the way a
gateway path or ENS name would. Runs in the foreground until Ctrl-C. `PORT` overrides 4173.

```sh
npm run preview
# preview: http://127.0.0.1:4173/preview/  (Ctrl-C to stop)
```

## Rebuild

There is nothing to compile. "Rebuilding" means re-deriving `dist/` from upstream:

```sh
npm run mirror      # download all 88 upstream files, verify every sha256 against MANIFEST.json,
                    # stop on any mismatch, then write dist/ with only the permitted edits
npm run build       # alias of `npm run verify`: confirm dist/ is exactly the published set
npm run manifest    # regenerate dist/MANIFEST-PUBLISHED.txt after an intentional change
```

`SOURCE_URL=https://other-host/path/ npm run mirror` points at a different upstream.
`npm run mirror` refuses to write if upstream no longer lists `stone-01`…`stone-80` in order.

## Check

```sh
npm run build          # integrity: published manifest, upstream manifest, permitted edits, size budget
npm run typecheck      # tsc --noEmit over scripts/*.mjs (checkJs, strict)
npm run check:browser  # headless Chrome: 320/768/1280 px, interactions, contrast, screenshots
npm run check          # all three
```

`check:browser` uses a locally installed Chrome or Chromium through `playwright-core` (no browser
download). Set `CHROME_PATH` if it is not at one of the usual locations. It serves `dist/` on an
ephemeral port, drives the page, writes `docs/validation/browser-check.json` and
`docs/validation/screenshots/*.jpg`, then shuts the server and browser down in the same command.

## Publish

The publisher serves the committed `dist/` as-is under the label `rock-garden-test`; it does not
rebuild. Every asset URL in `index.html` is relative (`img/…`, `fonts/…`, `data.json`), so the
export works at a root, a gateway subpath or an ENS name. To publish a new revision:

1. `npm run mirror` (or edit `dist/` deliberately and run `npm run manifest`).
2. `npm run check` and read `docs/validation/validation.md` for anything new.
3. Commit `dist/`, `package.json`, `package-lock.json`, `scripts/`, `publish.json` and the docs.
   Do not commit `node_modules/`.

## Validation record (final source, 2026-10-09)

| Command | Result |
| --- | --- |
| `npm run build` | `verify: ok — 50 files, 5219122 bytes in dist/, all hashes match MANIFEST-PUBLISHED.txt` (exit 0) |
| `npm run typecheck` | exit 0, no diagnostics |
| `npm run check:browser` | `PASS (0 failure(s), 1 known unfixable finding(s))` (exit 0) |

Browser run (Google Chrome, headless, served at `/preview/`), checked at 320×640, 768×900 and
1280×900 CSS px:

- 40 figures and 40 images rendered at every width; `img/stone-41.png` returns HTTP 404.
- No horizontal overflow at any width; the grid reflows to 1 / 4 / 7 columns.
- Mode line reads `mode: draft (published)`; `?mode=live` is ignored and the "url override gated"
  self-test reports `published ignores ?mode`.
- All eleven in-page self-tests reported `ok`, including the live chain reads, which depend on
  third-party RPC endpoints and may differ offline.
- `Connect wallet` with no injected provider renders the three deep links (MetaMask, Coinbase,
  Rainbow). Tab order: button → summary → iframe. Enter on the summary opens the details. Default
  focus rings were visible in `docs/validation/screenshots/desktop-focus-*.jpg`.
- Measured contrast (computed styles over the rendered background): body text 13.9:1, status ok
  9.54:1, waiting 7.93:1, failed 6.05:1, button 10.89:1, figcaption at 60 % opacity 5.57:1,
  wallet deep links 2.01:1 (known, see below).
- Console: only two 404s, `favicon.ico` (the page ships none) and the deliberate `stone-41.png`
  probe.

Full data: `docs/validation/browser-check.json`. Design review, coverage and findings:
`docs/validation/validation.md`. Implemented design: `DESIGN.md`.

## Limitations

- The page is a verbatim mirror. Design findings (deep-link contrast 2.01:1, 11 px captions,
  "80 stones" count from the unchanged `data.json` while 40 images are published) are recorded in
  `docs/validation/validation.md` and intentionally **not** fixed, because the brief forbids touching any
  other byte. They are the owner's call.
- The upstream host is a Replit preview URL and may disappear; `dist/MANIFEST.json` plus the
  committed files remain verifiable without it.
- Checks ran in headless Chrome only. No screen-reader session, no physical device, no native
  200 % zoom, and no Firefox/Safari run were performed.
- The external chain reads, the `example.com` iframe and the wallet deep links reach third-party
  hosts at runtime; this is upstream behaviour, not something added here.
