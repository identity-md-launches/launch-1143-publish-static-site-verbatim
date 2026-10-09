# DESIGN.md — rock-garden-test

Documents the design as implemented in the published export, `dist/index.html` (a verbatim
upstream page; all values below are read from its inline `<style>` block, lines 6–13, and its
markup). Nothing here was designed in this repository; it records what ships so a future change
can be judged against it. Rendered observations come from the headless-Chrome run recorded in
`docs/validation/browser-check.json`.

## Direction

Single dark page, monospace, utilitarian. One heading, a status block, one button, one
disclosure, one iframe, then a grid of 40 lazily loaded images. There is no navigation, no theme
switch, no animation and no media query; adaptivity comes from a single auto-fill grid and
fluid widths.

## Color tokens

No CSS custom properties exist; colors are literal values in `dist/index.html:8-12`. Named here
by role.

| Role | Value | Where |
| --- | --- | --- |
| Page background | `#111` (rgb 17 17 17) | `body` |
| Body text | `#ddd` | `body` |
| Secondary text | `#ddd` at `opacity: .6` (renders ≈ `#8b8b8b`) | `figcaption` |
| Status · ok | `#7c6` | `.ok`, progress fill |
| Status · failed | `#e66` | `.bad` |
| Status · waiting | `#aa8` | `.wait` |
| Surface · control | `#333` background, `#555` border, `#eee` label | `button` |
| Surface · track | `#333` | progress track `rect` |
| Surface · frame | `#000` background, `#444` border | `iframe` |
| Links | browser default (Chrome: `#0000EE`, visited `#551A8B`) | `#wout a` (no author rule) |

Measured contrast on the rendered page (WCAG 2.x, computed styles over `#111`):
body text 13.9:1 · ok 9.54:1 · waiting 7.93:1 · failed 6.05:1 · button label on `#333` 10.89:1 ·
figcaption (blended) 5.57:1 · default link blue 2.01:1 (fails; see `docs/validation/validation.md`).

## Typography

| Element | Family | Size | Weight / style |
| --- | --- | --- | --- |
| Everything | `A, ui-monospace, monospace` | browser default 16 px | inherited |
| `h1` | inherited | browser default (2 em = 32 px) | browser default bold |
| `figcaption` | inherited | `11px` | normal, `opacity: .6` |
| `button` | `font: inherit` | 16 px | normal |
| self-test label `#tests b` | inherited | 16 px | bold, `display: inline-block; min-width: 160px` |

- One `@font-face`: family `A`, `src: url(fonts/alpha.woff2)`, no weight, style or
  `font-display` descriptors (`dist/index.html:7`). Bold text is synthesised by the browser.
- `fonts/beta.woff2`, `gamma.woff2` and `delta.woff2` are shipped because upstream lists them in
  `fonts/index.json`, but no rule references them.
- No `line-height`, letter-spacing, `text-wrap` or numeric-font settings are set anywhere.

## Spacing and shape

| Token (by use) | Value | Where |
| --- | --- | --- |
| Page inset | `padding: 24px`, `margin: 0` | `body` |
| Grid gap | `12px` | `.grid` |
| Block rhythm | `margin: 12px 0` | `details` |
| List rhythm | `margin: 4px 0` | `#tests li` |
| Control padding | `8px 12px` | `button` |
| Label column | `min-width: 160px` | `#tests b` |
| Radius · control/media | `6px` | `img`, `button`, `iframe` |
| Radius · progress | `rx="8"` on a 16 px tall bar | inline SVG |
| Frame height | `120px` | `iframe` |

## Components

- **Heading** — `<h1>Rock Garden</h1>`; the only heading.
- **Mode line** — `<p id="mode">`; script writes `mode: draft (published)` (the published flag is
  `preview: false`, so a `?mode=` query is ignored).
- **Count line + progress bar** — `<p id="count">` and a 120×24 inline SVG; script sets the fill
  width to `120 × min(1, count / 80)` from `data.json` (`count` is 80 upstream, so the bar is full).
- **Self-test list** — `<ul id="tests">` of `<li><b>label</b> <span class="wait|ok|bad">`; each
  status is text (`ok`, `FAIL`, `waiting`) plus a color, so state is not color-only.
- **Button** — `<button id="connect">Connect wallet</button>`; rendered 163×42 px at every width.
  With no injected provider it writes three deep links into `#wout`; with one it requests
  accounts and prints the first address or `declined`. No hover/active author styles; focus uses
  the browser default ring (observed visible on `#111`).
- **Disclosure** — native `<details><summary>What this page is</summary><p>…`; `summary` has
  `cursor: pointer`.
- **Frame** — `<iframe src="https://example.com/" title="frame test" loading="lazy">`, full
  width, 120 px tall.
- **Image grid** — `<div class="grid">` of `<figure><img loading="lazy" alt="stone-NN.png"><figcaption>`;
  images are `width: 100%; display: block`.

## Responsive behavior

- `<meta name="viewport" content="width=device-width,initial-scale=1">`.
- `.grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)) }` is the only adaptive
  rule. Observed columns: 1 at 320 px, 4 at 768 px, 7 at 1280 px. No horizontal overflow at any
  of these widths.
- Self-test rows wrap naturally; at 320 px the status text moves under the label (the label
  keeps its 160 px minimum).
- `button`, `iframe` and images are fluid; nothing has a fixed pixel width except the 120 px SVG
  progress bar and the 160 px label column.
- No `prefers-reduced-motion` or `prefers-color-scheme` handling: there is no motion and only a
  dark theme.

## Accessibility notes as shipped

- `<html lang="en">`, one `h1`, native `button`, `details/summary` and `iframe title`.
- Every image has an `alt` equal to its file name (informative only as a label; the images are
  noise textures).
- Tab order observed: Connect wallet → summary → iframe. Enter on the summary toggles the
  disclosure.
- The decorative SVG bar is `aria-hidden="true"`; its value is conveyed by the adjacent count text.

## Not part of the design

No icons, no animations, no dialogs, no forms beyond the single button, no localization, no
light theme. These were not added, per the verbatim-mirror brief.
