# pretrunc

Cut text at its start, middle or end so it fits a width, on one line or across N lines, measured before it paints. A cut never lays out wider than its box in Chromium, Firefox or WebKit.

In Inter at 15 px:

```text
~/Projects/atlas…line-breaker.test.ts    middle at 260 px, the file name kept whole
Alexandra Richardson-…                   end at 180 px, backed off to the hyphen
…atherstonehaugh                         start at 140 px
```

- **Small.** The single-line core is 2.4 KB minified and brotli-compressed, with no dependencies. Multi-line cuts add 2 KB plus [pretext](https://github.com/chenglou/pretext), which only `pretrunc/lines` imports.
- **Fast.** Text is measured once, then cut at any width by arithmetic: a resize re-cuts 5,000 rows in 1 to 3 ms. Middle cuts are 2 to 3 times faster than pretext's ellipsis demo cold.
- **Exact.** It counts kerning beside the ellipsis, WebKit's dropped kerning at break opportunities, letter spacing, ligatures and joined scripts, and never splits a grapheme.
- **Steady.** As a box is dragged, each end of a cut moves one way; the ellipsis doesn't flicker.

## Install

```sh
pnpm add pretrunc
```

`@chenglou/pretext` is an optional peer dependency, needed only for `pretrunc/lines`; `solid-js` and `@solidjs/web` only for the Solid adapter.

## One line

```ts
import { cut, prepare, toText, truncated } from "pretrunc";

const p = prepare("~/Projects/atlas/src/text/line-breaker.test.ts", '15px "Inter Variable"', {
  protect: /[^/]+$/g, // the file name stays whole or goes whole
});
const c = cut(p, 240, { at: "middle", tailMatch: 0 }); // the tail starts at the file name
label.textContent = toText(p, c);
if (truncated(c)) label.title = p.text;
```

A cut is one number, the kept head and tail offsets packed together, so re-cutting thousands of rows allocates nothing; `head(c)`, `tail(c)` and `toText(p, c)` read it. Two cuts are `===` when they keep the same head and tail, so a memo can compare them. Options: `at` (`"end"`, `"start"`, `"middle"`), `ratio`, `tailGraphemes`, `tailMatch`, `words` (`true`, `false` or `{ within: px }`), `trim` and `ellipsis`, a string or the width of an element you render in its place. `font` is a CSS font shorthand or a `Face`: `canvasFace(font)`, `tableFace` from `pretrunc/metrics`, or `face(measure)` over your own.

## Several lines

```ts
import { clamp, prepareLines } from "pretrunc/lines";

const p = prepareLines(story, '16px "Inter Variable"', { whiteSpace: "pre-wrap" });
const c = clamp(p, width, { lines: 3, at: "end", after: moreButtonWidth });
```

## Solid

```tsx
import { FontProvider, Truncate } from "pretrunc/solid";
import { Clamp } from "pretrunc/solid/lines";

<Truncate text={path} at="middle" protect={/[^/]+$/g} tailMatch={0} />
<Clamp text={story} lines={3} expanded={open()} after={<button>more</button>} />
<FontProvider font='14px "Inter Variable"' letterSpacing={0}>
  <For each={rows()}>{(row) => <Truncate text={row.name} />}</For>
</FontProvider>
```

`Truncate` and `Clamp` follow their element's width and font, re-cut on resize and when web fonts load, and with `render="full"` keep the whole text in the page for copying and screen readers. `FontProvider` gives a list its font once, so its rows read no computed style.

The package exports a `solid` condition pointing at its TypeScript source, which Solid's Vite plugin compiles with the app; other bundlers get the built JavaScript in `dist/`.

## No canvas

`pretrunc/metrics` measures from a table of a font's advances and kerning, for server rendering or a worker: `vp run metrics <font file> <out.ts> [family]` writes one from a font file. A table never measures narrower than the browser, so its cuts never overflow, but can be up to 10% wider, so they may land a little early. Give text cut from a table `text-rendering: geometricPrecision`: without it, Chromium on Linux lays each glyph on a whole pixel, wider than any table can know.

## Developing

[Vite+](https://viteplus.dev) runs everything: `vp install`, then `vp run setup` once for the Git hooks and the Effect lint rules.

- `vp check`: format, lint and type-check.
- `vp run test`: every test, in Node and in Chromium, Firefox and WebKit through Playwright.
- `vp run bench`: timings against pretext's ellipsis demo and pretext-truncate, written to `bench/results.<engine>.md`.
- `vp run demo`: the demo page, with a playground and a 2,000-row table, on `localhost:3100`.
- `vp run build`: `dist/`, JavaScript and declarations.

[DESIGN.md](DESIGN.md) records the algorithm, the engine quirks it handles, the benchmarks and every decision behind them. pretrunc began as a package inside sprint-poker; references like `sprint-poker#90` point at that repo's issues.

## Licence

MIT. The benchmark vendors code from pretext and pretext-truncate, both MIT, with attribution in `bench/prior-art.ts`. `fixtures/inter-latin.ts` holds metrics generated from [Inter](https://rsms.me/inter/), under the SIL Open Font License 1.1; it's used by the tests and demo and isn't part of the package.
