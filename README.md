# pretrunc

[![CI](https://github.com/LewisAlderman/pretrunc/actions/workflows/ci.yml/badge.svg)](https://github.com/LewisAlderman/pretrunc/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/pretrunc)](https://www.npmjs.com/package/pretrunc)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Cut text at its start, middle or end so it fits a width, on one line or across N lines, measured before it paints. A cut never lays out wider than its box in Chromium, Firefox or WebKit. Try it in the [demo](https://lewisalderman.github.io/pretrunc/).

pretrunc is before 1.0: a minor version can still change the API, and the [release notes](https://github.com/LewisAlderman/pretrunc/releases) say how.

In Inter at 15 px:

```text
~/Proje…src/text/line-breaker.test.ts    middle at 260 px, the file name protected
Alexandra Richardson-…                   end at 180 px, backed off to the hyphen
…atherstonehaugh                         start at 140 px
```

- **Small.** The single-line core is <!-- size src/index.ts -->2.8 kB minified and brotli-compressed, with no dependencies. Multi-line cuts add <!-- size src/lines.ts -->2.5 kB plus [pretext](https://github.com/chenglou/pretext), which only `pretrunc/lines` imports.
- **Fast.** Text is measured once, then cut at any width by arithmetic: a resize re-cuts 5,000 rows in 1 to 3 ms. Middle cuts are 2 to 3 times faster than pretext's ellipsis demo cold.
- **Exact.** It counts kerning beside the ellipsis, WebKit's dropped kerning at break opportunities, letter spacing, ligatures and joined scripts, and never splits a grapheme.
- **Steady.** As a box is dragged, each end of a cut moves one way; the ellipsis doesn't flicker.

## How it compares

[pretext](https://github.com/chenglou/pretext) is a layout engine, and its [ellipsis demo](https://chenglou.me/pretext/) shows how to cut text with it, as code to copy into an app. [pretext-truncate](https://github.com/ShipItAndPray/pretext-truncate) packages an end clamp built on it. pretrunc focuses on cutting text alone, and the benchmark in `bench/` runs all three on the same inputs in Chromium, Firefox and WebKit.

|                                   | pretrunc                                                | pretext's ellipsis demo                         | pretext-truncate                                |
| --------------------------------- | ------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| Ellipsis at the end               | one line or several                                     | one line or several                             | one line or several                             |
| At the start or in the middle     | one line or several                                     | the middle of one line                          | no                                              |
| What a middle cut keeps           | any patterns you give, by priority, whole or cut to fit | a path's file name                              | no middle cut                                   |
| Ran over its box in the benchmark | never, in any of the three engines                      | 6 of 5,000 middle cuts in Firefox and in WebKit | 16 of 5,000 names, 107 to 109 of 500 paragraphs |
| Cutting again at a new width      | mostly arithmetic over widths it already holds          | lays the lines out again                        | measures each step afresh                       |

On top of that, pretrunc counts letter spacing and tabs in `pre-wrap`, takes an element's width as its ellipsis, keeps room after the text for a "more" link, backs off to a word or hyphen and trims dangling punctuation, keeps the whole text in the page for copy, find and screen readers, and can measure from a font's metrics table where there is no canvas.

pretrunc is faster in most of the benchmark, and slower where it checks its own work so that a cut never overflows.

<details>
<summary>The benchmark numbers, and where pretrunc gives up speed</summary>

In the benchmark, middle cuts of 5,000 paths take 57 ms cold in Chromium where the demo takes 111, and are 2.3 to 2.7 times faster in Firefox and WebKit; re-cut at a new width they are 2.4 to 6 times faster. End cuts of 5,000 names are level with both in Chromium and twice as fast in Firefox.

Where speed and never overflowing pull apart, pretrunc takes the slower road. The demo sets out to show what pretext makes possible and pretext-truncate keeps to one straightforward loop, so neither promises that a cut fits its box in every engine; that promise is what pretrunc is built around, and keeping it costs time. Start and middle clamps check their result against a full layout, and a line with a word broken across it, or within a pixel of its edge, is measured again the way the engines measure it. A cold end clamp of 500 paragraphs takes 12.6 ms in Chromium against the demo's 8.3, since pretrunc builds a table of every character on the last line so it can cut at any of them, with kerning, letter spacing, `protect` and room after. Warm, they're level. Every number, per engine, is in `bench/results.<engine>.md`.

</details>

### When plain pretext is the better choice

- **You need layout, not only a cut.** pretext gives line positions and heights for virtualised lists, text that flows around shapes, and text drawn to canvas, SVG or WebGL. pretrunc only decides what to keep.
- **You draw the text yourself.** pretrunc's checks are against how Chromium, Firefox and WebKit lay out text in the page. When your own renderer draws pretext's lines, pretext's line breaks are already the truth, and those checks buy nothing.
- **You already use pretext and want only an ellipsis at the end.** The demo's `clampLines` is a few dozen lines you can own, and it clamps cold paragraphs faster.

And when an ellipsis at the end of the box is all you need and the browser may measure as it paints, CSS `text-overflow: ellipsis` and `line-clamp` need no JavaScript at all.

## Install

```sh
pnpm add pretrunc
```

`@chenglou/pretext` is an optional peer dependency, needed only for `pretrunc/lines`; `solid-js` and `@solidjs/web` only for the Solid adapter; `react` 19 only for the React adapter.

## One line

```ts
import { cut, prepare, toText, truncated } from "pretrunc";

const p = prepare("~/Projects/atlas/src/text/line-breaker.test.ts", '15px "Inter Variable"', {
  protect: /\/[^/]+$/, // the file name keeps the tail, cut to fit only if it must be
});
const c = cut(p, 240, { at: "middle" });
label.textContent = toText(p, c);
if (truncated(c)) label.title = p.text;
```

A cut is one number, the kept head and tail offsets packed together, so re-cutting thousands of rows allocates nothing; `head(c)`, `tail(c)` and `toText(p, c)` read it. Two cuts are `===` when they keep the same head and tail, so a memo can compare them. Options: `at` (`"end"`, `"start"`, `"middle"`), `ratio`, `tailGraphemes`, `words` (`true`, `false` or `{ within: px }`), `trim` and `ellipsis`, a string or the width of an element you render in its place.

<details>
<summary>Keeping parts of the text with <code>protect</code></summary>

`protect` takes a pattern, a `{ pattern, weight, whole }`, or an array of them. A middle cut keeps protected matches before the rest of the text, the highest weight first (0 to 1, default 1), each on the side nearer its middle; `ratio` shares only the room they leave. A match shows whole while it fits, then as much as fits, cut on its side toward the ellipsis; with `whole: true` it shows whole or not at all, and no cut ever splits it.

```ts
// The file name first, then the first folder: "~/Projects/…/line-breaker.test.ts",
// then "~/Pr…/line-breaker.test.ts", then "…breaker.test.ts".
prepare(path, font, { protect: [/\/[^/]+$/, { pattern: /^~\/[^/]+\//, weight: 0.5 }] });
// A mention shows whole or not at all.
prepare(message, font, { protect: { pattern: /@[\w.]+/g, whole: true } });
// A person's first name, then their last word whole while both fit, and the rest to the
// head: "Maximilian…Ortega" where an end cut shows "Maximilian Rodrigue…".
const p = prepare(name, font, {
  protect: [/^\S+/u, { pattern: /[^\s-]+$/u, weight: 0.5, whole: true }],
});
cut(p, width, { at: "middle", ratio: 1 });
```

</details>

`font` is a CSS font shorthand or a `Face`: `canvasFace(font)`, `tableFace` from `pretrunc/metrics`, or `face(measure)` over your own.

## Several lines

```ts
import { clamp, prepareLines } from "pretrunc/lines";

const p = prepareLines(story, '16px "Inter Variable"', { whiteSpace: "pre-wrap" });
const c = clamp(p, width, { lines: 3, at: "end", after: moreButtonWidth });
```

## Components

`Truncate` and `Clamp` follow their element's width and font, and cut again on resize and when web fonts load. With `render="full"` they keep the whole text in the page for copying and screen readers. Both take `dir` for their element. With `dir="auto"` the first strong character of the text in the element sets its direction (with `render="kept"` and a start cut, that's the shown tail's, so the ellipsis can change sides as the cut moves past the last left-to-right word), so right-to-left text cut at its end shows the ellipsis on its left even in a left-to-right page; it also aligns each text to its own start in a `text-align: start` box, so in a column of mixed names right-to-left ones align right and left-to-right ones left, whatever the page, and text with no strong character, such as "22/10", reads left to right.

<details>
<summary>Solid</summary>

```tsx
import { FontProvider, Truncate } from "pretrunc/solid";
import { Clamp } from "pretrunc/solid/lines";

<Truncate text={path} at="middle" protect={/\/[^/]+$/} />
<Clamp text={story} lines={3} expanded={open()} after={<button>more</button>} />
<FontProvider font='14px "Inter Variable"' letterSpacing={0}>
  <For each={rows()}>{(row) => <Truncate text={row.name} />}</For>
</FontProvider>
```

`FontProvider` gives a list its font once, so its rows read no computed style.

The package exports a `solid` condition pointing at its TypeScript source, which Solid's Vite plugin compiles with the app; other bundlers get the built JavaScript in `dist/`.

</details>

<details>
<summary>React</summary>

```tsx
import { FontProvider, Truncate, useCut } from "pretrunc/react";
import { Clamp } from "pretrunc/react/lines";

<Truncate text={path} at="middle" protect={/\/[^/]+$/} />
<Clamp text={story} lines={3} expanded={open} after={<button>more</button>} />
<FontProvider font='14px "Inter Variable"' letterSpacing={0}>
  {rows.map((row) => <Truncate key={row.id} text={row.name} />)}
</FontProvider>
```

The components take the same props as the Solid ones, with `className`. `<Truncate>` reads its cut through `useSyncExternalStore`, and a cut is one number, so a resize that doesn't move a row's cut doesn't render that row. `useCut` gives `{ ref, prepared, cut }` for markup of your own, and `useBox` the width, font and letter spacing a cut follows.

</details>

## No canvas

`pretrunc/metrics` measures from a table of a font's advances and kerning, for server rendering or a worker. The `pretrunc-metrics` command writes one from a font file, reading it with [fontkit](https://github.com/foliojs/fontkit), which only the command needs:

```sh
pnpm add -D fontkit
pnpm exec pretrunc-metrics inter-latin.woff2 src/inter-metrics.ts "Inter Variable"
```

```ts
import { prepare } from "pretrunc";
import { tableFace } from "pretrunc/metrics";
import inter from "./inter-metrics.ts";

const p = prepare(name, tableFace(inter, 15));
```

A table never measures narrower than the browser, so its cuts never overflow, but can be up to 10% wider, so they may land a little early. Give text cut from a table `text-rendering: geometricPrecision`: without it, Chromium on Linux lays each glyph on a whole pixel, wider than any table can know.

## Known limitations

- In WebKit, a tab in `pre-wrap` text can wrap a clamp to a line more than asked, when the tab starts under half a `0` from a tab stop. pretext models WebKit's tabs with half a space there; the fix belongs in pretext ([#9](https://github.com/LewisAlderman/pretrunc/issues/9)).
- A middle clamp can show part of one word less in a wider box, in about one case in 100,000. Ending it would cost flicker on ordinary text ([#1](https://github.com/LewisAlderman/pretrunc/issues/1)).
- Right-to-left text is cut in logical order and renders with the element's direction. Cuts are measured left to right, so mixed text laid out right to left, by `dir="rtl"`, `dir="auto"` or a right-to-left page, can run past its box by a pixel or so where neutral characters sit between its runs, as in "محمد A.V. — 12:30" ([#17](https://github.com/LewisAlderman/pretrunc/issues/17)). Mixed-direction text can also reorder around a middle ellipsis.
- Cuts made from a metrics table (`pretrunc/metrics`) never overflow, but can land up to 10% early, since a table is never narrower than any engine.

## Developing

<details>
<summary>Commands, and where the design is written down</summary>

[Vite+](https://viteplus.dev) runs everything: `vp install`, then `vp run setup` once for the Git hooks and the Effect lint rules.

- `vp check`: format, lint and type-check. `vp exec knip` finds unused files, exports and dependencies.
- `vp run test`: every test, in Node and in Chromium, Firefox and WebKit through Playwright.
- `vp run bench`: timings against pretext's ellipsis demo and pretext-truncate, written to `bench/results.<engine>.md`.
- `vp run demo`: the demo page, with a playground and a 2,000-row table, on `localhost:3100`.
- `vp run build`: `dist/`, JavaScript and declarations.
- `vp run demo:build`: the demo as a static site in `dist-demo/`, which GitHub Pages serves.
- Releases: every push to `main` updates a draft release pull request, with the version and changelog worked out from the Conventional Commits since the last release. Merging it tags the release and stages it on npm, where a maintainer approves it with two-factor authentication ([uppt](https://github.com/danielroe/uppt)).

[DESIGN.md](DESIGN.md) records the algorithm, the engine quirks it handles, the benchmarks and every decision behind them.

</details>

## Credits

[pretext](https://github.com/chenglou/pretext) by [Cheng Lou](https://github.com/chenglou) broke the ground pretrunc stands on. It showed that text can be measured and laid out in the browser without asking the DOM, close enough to each engine's line breaking to trust and fast enough to redo on every resize. Knowing where lines fall before they paint makes layouts possible that the DOM makes slow or out of reach, and [its demos](https://chenglou.me/pretext/) show many of them, a cut with an ellipsis at the end and in the middle among them. `pretrunc/lines` lays out every multi-line cut with pretext.

[pretext-truncate](https://github.com/ShipItAndPray/pretext-truncate) by ShipItAndPray put pretext to work on truncation, clamping text to a number of lines with no flash of the full text. Both projects are the benchmark's points of comparison, run from vendored copies credited in `bench/prior-art.ts`.

## Licence

MIT. The benchmark vendors code from pretext and pretext-truncate, both MIT, with attribution in `bench/prior-art.ts`. `fixtures/inter-latin.ts` holds metrics generated from [Inter](https://rsms.me/inter/), under the SIL Open Font License 1.1; it's used by the tests and demo and isn't part of the package.
