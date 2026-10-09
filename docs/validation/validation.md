# Validation record — rock-garden-test

Worker-side report for the final committed `dist/` (2026-10-09). The verifier checks paths and
bytes only; nothing here is an independent certification.

## 1. Scope and assumptions

- **Deliverable:** `dist/` as a verbatim mirror of the upstream Rock Garden page, trimmed to
  `stone-01`…`stone-40` with `preview: false`, plus `dist/MANIFEST-PUBLISHED.txt`, publish label
  `rock-garden-test` (`publish.json`), repository scripts, README and DESIGN.md.
- **How the files were obtained:** the parent job's delivery repository contained only an empty
  commit, so all 88 upstream files were downloaded again from the source URL and every entry of
  `MANIFEST.json` was re-verified by sha256 before anything was placed in `dist/` (0 mismatches).
- **Pages/flows reviewed:** the single page; mode/gate logic, data load, font load, image grid,
  `Connect wallet`, disclosure, iframe, keyboard order.
- **Consequential constraint:** the brief forbids changing any byte other than the four listed
  edits. Design findings below are therefore **recorded, not fixed**; they are the owner's call.
- **Supported variants:** dark only, English only. No theme or locale variants exist upstream.
- **Exclusions:** no screen-reader session, no physical device, no native 200 % zoom, no
  Firefox/Safari, no wallet-connected (injected provider) path.

## 2. Coverage (Better Interface, six domains)

| Domain | Status | Inspected / evidence |
| --- | --- | --- |
| Accessibility | Checked | `lang`, headings, native controls, `alt`, `iframe title`, tab order, Enter on summary, default focus ring viewed in `screenshots/desktop-focus-button.jpg` and `desktop-focus-summary.jpg`, button hit area 163×42 px. **Unperformed:** screen reader, native zoom, reduced-motion (no motion exists). |
| Layout | Checked | 320/768/1280 px screenshots, overflow measurement (none), grid column counts 1/4/7, reading order (DOM order = visual order). |
| Writing | Checked | Button label, status vocabulary (`ok`/`FAIL`/`waiting`), mode/count copy, disclosure text. |
| Typography | Checked | Font load (`document.fonts.check("12px A")` true at every width), sizes from source, wrapping at 320 px viewed. **Unperformed:** native zoom reflow. |
| Colors | Checked | Seven rendered pairs measured from computed styles over the real `#111` background (see table). Images are opaque noise; no overlays or gradients exist. |
| UI | Checked | Surfaces, radius, button/disclosure/iframe states; no icons or animations exist (**Not applicable**). |

Source guide: `.imd/reads/skills/better-interface/REFERENCE.md` (contents, workflow, and the
six domain core-principle sections were read; supporting sections consulted for focus,
contrast and hit areas).

## 3. Findings and fixes

None of these can be fixed here without violating the verbatim-mirror brief; each is left in
place deliberately and reported to the owner.

| # | Sev | Location | Evidence | Impact | Correction (owner-side) | State |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | HIGH | `dist/index.html:98` (`#wout` links) | Deep links use the browser-default link colour; measured `rgb(0,0,238)` on `#111` = **2.01:1** at 16 px (`screenshots/desktop-after-connect.jpg`). | The wallet fallback links are hard to read on the dark page for low-vision users. | Add e.g. `#wout a{color:#9cf}` upstream. | Not fixed (verbatim constraint) |
| 2 | MEDIUM | `dist/data.json` (unchanged) + `dist/index.html:85` | Count line reads **"80 stones"** and the bar is full while 40 images are published; the self-test asserts `count === 80`. | Copy contradicts the visible content. | Owner decides whether `data.json` should say 40 (would change the self-test outcome). | Not fixed (brief says every other byte stays) |
| 3 | LOW | `dist/index.html:9` `figcaption{font-size:11px;opacity:.6}` | 11 px captions at 5.57:1. Contrast passes; size is below comfortable reading size. | Captions are file names only; low task impact. | Raise to 12–13 px upstream. | Not fixed |
| 4 | LOW | `dist/index.html:36-75` `alt="stone-NN.png"` | Alt text is the file name. | Screen-reader users hear file names; images are noise textures, so no information is lost. | Consider `alt=""` or descriptive text upstream. | Not fixed |
| 5 | INFO | `dist/index.html:34`, `:87-93` | Third-party iframe (`example.com`) and four external RPC/log endpoints are contacted on load. | Network dependence and privacy exposure are upstream design choices for this test page. | None requested. | Recorded |
| 6 | INFO | `dist/fonts/` | `beta`, `gamma`, `delta` woff2 are shipped but unreferenced by CSS. | 3 unused files (small). | Upstream lists them in `fonts/index.json`; kept per brief. | Recorded |

Fixes applied in this repository: none to `dist/` beyond the four requested edits. Tooling fixes
during the run: the check script's own 404 probe was initially counted as a resource failure
(corrected); an invalid `:focus-visible` pseudo-class probe was replaced with a computed-style
read plus screenshots; the full-page 320 px PNG (7.7 MB) was replaced with two JPEG viewport
shots to respect the 8 MiB budget.

## 4. Verification

Commands run from the repository root with Node 24.21.0 / npm 11.19.0 after the last change to
any source or `dist/` file:

| Command | Exit | Output |
| --- | --- | --- |
| `npm run build` | 0 | `verify: ok — 50 files, 5219122 bytes in dist/, all hashes match MANIFEST-PUBLISHED.txt` |
| `npm run typecheck` | 0 | no diagnostics |
| `npm run check:browser` | 0 | `browser-check: PASS (0 failure(s), 1 known unfixable finding(s))` |

Browser: Google Chrome at `/usr/bin/google-chrome`, headless, driven by `playwright-core`,
serving `dist/` at `http://127.0.0.1:<ephemeral>/preview/`.

Viewports and interactions:

| Viewport | Screenshot | Observations |
| --- | --- | --- |
| 320×640 | `docs/validation/screenshots/mobile-320.jpg`, `mobile-320-grid.jpg` | 1 grid column, no overflow, statuses wrap under labels, 40/40 images loaded |
| 768×900 | `docs/validation/screenshots/tablet-768.jpg` | 4 columns, no overflow |
| 1280×900 | `docs/validation/screenshots/desktop-1280.jpg` | 7 columns, no overflow |
| 1280 focus | `desktop-focus-button.jpg`, `desktop-focus-summary.jpg` | default ring visible on button and summary |
| 1280 after click | `desktop-after-connect.jpg` | details open, three deep links rendered |

- Removed asset: `fetch("img/stone-41.png")` → HTTP 404.
- Gate: `?mode=live` → `mode: draft (published)`, self-test `ok · published ignores ?mode`.
- Self-tests: all 11 `ok` (json 80 items, font, eth_call "Wrapped Ethe", batch, tenderly logs,
  drpc, local storage, iframe loaded, wallet api "none injected · 0 via 6963", gate, inline).
  The four chain reads and the iframe are network-dependent.
- Keyboard: Tab order `button#connect → summary → iframe#fr → body`; Enter opens details.
- Console: two 404s only (`favicon.ico`, the deliberate `stone-41.png` probe). No script errors.
- Contrast (measured): body 13.9, ok 9.54, wait 7.93, bad 6.05, button 10.89, figcaption 5.57,
  details text 13.9, deep links **2.01** (finding 1).

Byte-level integrity (also enforced by `npm run build`): untouched files match upstream
`MANIFEST.json`; `index.html` differs from upstream only by the 40 deleted figure lines and the
`preview: false` edit (confirmed with `diff` against the re-downloaded source during the run);
`img/index.json` differs only by the 40 dropped names.

## 5. Completion

**Complete for the stated scope.** Remaining limitations: the design findings above are
intentionally unfixed under the verbatim constraint; screen-reader, native-zoom, physical-device,
non-Chromium and injected-wallet paths were not exercised; external endpoints may behave
differently when the published page is opened later.
