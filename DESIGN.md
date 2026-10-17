# pretrunc design

Cut text at its start, middle or end so it fits a width, on one line or across N lines. Framework-agnostic TypeScript core, a Solid 2 adapter, and pretext for multi-line only. Built inside sprint-poker as a workspace package, extracted to its own repo later.

## Decisions

| Question                   | Decision                                                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shapes                     | Single line: start, middle, end. Multi-line: end clamp, start, middle.                                                                                                                                                                      |
| Pretext                    | Tiered entries. `pretrunc` never imports pretext; `pretrunc/lines` does. Pretext is 38.8 KB gzipped and doesn't tree-shake, so only multi-line callers pay for it.                                                                          |
| Accuracy                   | Never overflow. A result always fits as the browser paints it, and may keep one grapheme less than the tightest fit.                                                                                                                        |
| Workloads                  | Thousands of rows re-cut during a live column resize; no flash on first paint; server rendering later.                                                                                                                                      |
| Cut points                 | Any grapheme as the floor; word boundaries preferred; caller-protected spans stay whole or go whole; whitespace and dangling punctuation trimmed at the cut.                                                                                |
| Middle split               | A head ratio (default 0.5), or a tail of N graphemes, or a tail that holds a protected span.                                                                                                                                                |
| Output                     | UTF-16 offsets, with the string built on demand.                                                                                                                                                                                            |
| Ellipsis                   | Any string, measured in the text's font; a width in px for an inline element the caller renders; a "… more" / "less" toggle.                                                                                                                |
| Hidden text                | The core returns offsets; the adapter renders either the kept text with a `title`, or the full text with the cut range collapsed.                                                                                                           |
| Adapters                   | Solid 2 now. React later, in its own issue.                                                                                                                                                                                                 |
| Width and font             | Explicit `width` and `font` win; leave them out and the adapter observes the element.                                                                                                                                                       |
| SSR                        | Font metrics table, after the core. v1 designs the measurer interface so it drops in.                                                                                                                                                       |
| Size budget (min + brotli) | `pretrunc` ≤ 1.5 KB (1 KB was the first aim; every option above costs 1.4 KB), `pretrunc/dom` ≤ 0.4 KB, `pretrunc/solid` ≤ 1 KB beyond the core (0.6 KB was the first aim), `pretrunc/lines` ≤ 1 KB plus pretext. A test fails on a breach. |
| First use                  | Seat names in sprint-poker, middle cut, in a self-hosted Inter Variable.                                                                                                                                                                    |

## Prior art and what this does differently

- `pretext-truncate` scans the last line backwards one character at a time, calling `prepare` twice on a fresh substring per step: O(n) measurement passes per cut. React only. End only.
- `pretext-ellipsis` hides the text until measured, then clips the last line with CSS `overflow: hidden` instead of computing a cut. React only.
- pretext's `pages/demos/ellipsis.model.ts` is the reference for browser behaviour: a line clamp ends the way `-webkit-line-clamp` does (the line breaks where it would without the clamp, the ellipsis follows if both fit, otherwise the line is cut after the last grapheme that leaves it room), and its middle cut keeps a path's file name. It finds cuts by asking for lines one candidate at a time.

pretrunc replaces candidate-by-candidate measuring with arithmetic over widths it already holds, confirmed by at most one or two real measurements, and in the common case none.

## Result: one number

A cut is two UTF-16 offsets into the prepared text: kept text is `[0, head) + [tail, length)`. One shape covers every mode: an end cut has `tail === length`, a start cut has `head === 0`, a middle cut has both, and text that fits has `head === tail === length`.

The two offsets pack into one number, `head * 2**26 + tail`, exact in a double for text under 2^26 UTF-16 units. `cut()` therefore allocates nothing, and a reactive memo over it compares by value: a resize that doesn't move the cut re-renders nothing in Solid, and in React a `useSyncExternalStore` snapshot stays equal. Helpers unpack it:

```ts
head(c); // Math.floor(c / 2**26)
tail(c); // c % 2**26
truncated(c); // head(c) < tail(c)
toText(p, c, ellipsis); // allocates; call it where you render
```

## Core API (`pretrunc`)

```ts
const p = prepare(text, font, { protect: /[^/]+$/g });
const c = cut(p, width, {
  at: "middle", // "end" (default) | "start" | "middle"
  ratio: 0.5, // middle: the head's share of the room
  tail: 8, // middle: keep the last 8 graphemes instead of a ratio
  keep: 0, // middle: the tail starts at protected match 0 (a file name, an extension)
  words: true, // back off to a word boundary within a quarter of the room, or within `words` px
  trim: true, // drop spaces and `,;:` beside the ellipsis
  ellipsis: "…", // a string, or a width in px for an element you render
});
```

`prepare` collapses white space the way `white-space: normal` paints it, and offsets refer to `p.text`, the collapsed string. Protected spans are a global RegExp matched against that string, since offsets into the caller's text would shift when white space collapses. `font` is a CSS font shorthand, measured with canvas, or a `Face` from `face(measure)`: a metrics table (#54), node-canvas or a test double.

### Measuring without measuring

The expensive operations are `Intl.Segmenter` and `measureText`. The core avoids both where it can.

1. **No segmenter for simple text.** Below U+0300 every UTF-16 unit is one grapheme, CRLF aside, and collapsing white space removes CRLF. One regex test decides whether the text needs `Intl.Segmenter` at all; one lazily created segmenter serves the rest.
2. **Shared widths per font.** Each font's face caches every width it measures, by string: each grapheme alone, each pair of neighbours, each ellipsis. A grapheme adds `width(pair) - width(previous)` to the running total, its advance plus the kerning between them. A table of 5,000 names in one font measures each distinct character and pair once, a few hundred `measureText` calls in all, not one per row per resize.
3. **Trust per text.** `prepare` measures the whole text once and compares it with the sum. Within 0.01 px, the pair model holds for that text, and every cut of it is arithmetic: pair widths, plus the kerning on each side of the ellipsis. Otherwise (ligatures, Arabic joining, Indic shaping) each candidate cut is measured for real.

Canvas measures small emoji wider than the DOM paints them on macOS, as pretext documents. Wider means a shorter cut, so the contract holds without pretext's emoji correction.

### The cut

`prepare` stores grapheme start offsets, each grapheme's own width and a prefix sum `W[i]` of the first `i` graphemes, kerning included. Each step of the sum is clamped at 0, so binary search stays valid even with negative kerning. A tail's width is exact: `W[n] - W[t + 1]` plus grapheme `t` alone, since nothing precedes it but the ellipsis.

- **End:** the largest `h` with `W[h] ≤ room`. Binary search, O(log n).
- **Start:** the smallest `t` whose tail fits.
- **Middle (ratio):** the head takes the largest `h` within `ratio × room`, the tail the smallest `t` within what's left, then the head takes any slack the tail's rounding left. Three binary searches.
- **Middle (tail graphemes or a protected match):** fix `t`, then cut the head into the rest. If the fixed tail alone doesn't fit, fall back to the ratio.

The search leaves out the kerning beside the ellipsis, and in measured text the shaping across graphemes. Both are a pixel or two, so the cut then settles one grapheme at a time: shrink until it fits, then grow each side while one more fits. Trusted text settles in arithmetic. Measured text settles in two to four real measurements, and settling also finds a longer cut that a ligature paints narrower.

Engines differ on kerning across a line-break opportunity. WebKit lays out the text between two break opportunities as a run of its own, so kerning after a hyphen, a dash, CJK or the ellipsis never reaches the page, while Chrome, Firefox and canvas keep it: in Inter at 15 px, canvas puts "…To" at 29.96 px and WebKit lays it out at 30.47. Across a possible break the model counts kerning only when it widens, so it is never narrower than any engine's layout, and in Chrome and Firefox at most a fraction of a pixel loose. The trust check still compares canvas with the exact sum, and measured text adds back the kerning WebKit drops. Chrome also rounds a laid-out width up to the next 1/64 px, which the cut's 1/64 px slack covers.

Then the boundary passes, in order: back off to a word boundary if one lies within the backoff limit, snap out of protected matches (always towards keeping less), trim spaces and `,;:` beside the ellipsis. Each pass only removes graphemes. Removing a grapheme can widen shaped text, as when an Arabic letter loses its joining form, so the cut shrinks again once more at the end.

A secant search over the room was tried and dropped: it stalled on misses smaller than a grapheme, and one number cannot correct both sides of a middle cut. Galloping from the previous cut was left out: it saves a few comparisons on a binary search over a few dozen graphemes and costs bytes.

## Multi-line API (`pretrunc/lines`)

```ts
const p = prepareLines(text, font, { whiteSpace, wordBreak, letterSpacing }); // wraps pretext's prepareWithSegments
const c = clamp(p, width, 3, { at: "end", words: true, ellipsis: "… more" });
lessFits(p, width, lessWidth); // whether "less" fits after the last line once expanded
```

Offsets refer to `p.text`, the concatenation of pretext's segments, so the same `head`, `tail` and `toText` helpers apply.

- **End:** walk the first N−1 lines with `layoutNextLineRange`, which builds no strings. If the rest fits on one line, nothing is cut. Otherwise run the core's end cut on the remainder of line N. Kept text rendered in a wrapping block re-wraps to the same lines, because greedy wrapping of a prefix gives the prefix's lines.
- **Start:** keep the last N lines. pretext's line streams accept any cursor, including one partway through a word, and a width per line. So each candidate start `j` is a probe of N lines, the first `width − ellipsis` wide, laid out from `j` over the existing prepared handle: no new `prepare`, no measuring, pure arithmetic. Binary search over `j`: O(N log n). Snap `j` forward to a word start when `words` is on.
- **Middle:** the head fills `ratio × N × width` of area, ending at offset `k` on line `h` at x position `x`. The tail start `j` is the smallest whose lines, laid out from `j` with a first line `width − x − ellipsis` wide and full lines after, fit the N−h lines left. Binary search over `j`.

Start and middle cuts join two ranges the model laid out apart, and at the junction the browser may wrap differently: a tail that begins mid-word can't break where a line start could. So both confirm the final string with one real `prepareWithSegments` and `layout`, mostly cache hits in pretext's segment cache, and step back while it runs to N+1 lines.

## DOM helpers (`pretrunc/dom`)

Shared by every adapter, so the React adapter later is thin.

- **One ResizeObserver** for all elements, dispatching through a `WeakMap<Element, callback>`. Its first notification arrives after layout and before paint, so an observed element is cut before its first frame.
- **Font from computed style,** read once per element and assembled from `font-style`, `font-weight`, `font-size` and `font-family`. The `font` shorthand reads back empty in some engines, and `font-stretch` reads back as a percentage, which canvas rejects.
- **Font epoch.** On `document.fonts` `loading`, once `document.fonts.ready` settles, every cached width is dropped and subscribers prepare and cut again. WebKit fires no `loadingdone` for a face loaded from script, so that event can't be the trigger. Before a web font loads, cuts use the fallback's metrics, which is right for what's on screen at that moment.

## Solid adapter (`pretrunc/solid`)

```tsx
<Truncate text={name()} at="middle" /> // observes width and font
<Truncate text={title()} at="end" width={column()} font={BODY_FONT} /> // no observer, no style reads
const c = createCut(() => prepared(), () => width(), { at: "middle" }) // Accessor<Cut>
```

- `render="kept"` (default) paints the kept text and ellipsis, with the full text in `title`.
- `render="full"` paints all the text: the cut range sits in a `font-size: 0` span and the ellipsis in an `aria-hidden`, unselectable span, so copy, find-in-page and screen readers get the full text. The cut measures the ellipsis as a run of its own, since no kerning crosses into its element. Browser tests check in Chromium, Firefox and WebKit that it lays out within its box and that selecting it copies every character.
- Multi-line components live in `pretrunc/solid/lines`, so a single-line page never loads pretext.

## Not in v1

Each has an `idea` issue: the font metrics table for SSR, workers and cutting before the font loads (#54), the React adapter (#55), letter spacing in the single-line core (#56), and extracting pretrunc to its own repo and publishing it to npm (#57). RTL text cuts in logical order and renders with the element's `dir`; mixed bidi text can reorder around a middle ellipsis, and v1 only documents that.

## Proof

- **Properties** (fast-check), run in real browsers, each checked against the browser's own layout of the result: never overflows (a `nowrap` span of the kept text is no wider than `width`); tight (with `words` and `trim` off, keeping one more grapheme overflows); monotone (a wider box never keeps less); identity (text that fits comes back whole); no grapheme is split; protected spans stay whole or go whole; the packed number round-trips.
- **Browsers:** Chromium, Firefox and WebKit through vitest's Playwright provider. The app's browser project runs Chromium only; the package adds the other two.
- **Benchmarks:** against `pretext-truncate`'s `findTruncationPoint` and the pretext demo's `clampLines` and `layoutMiddle`, on the same inputs: a cold cut including `prepare`, a warm re-cut at a new width, and one resize frame over 5,000 rows.
- **Size:** a test bundles each entry with `vp pack`, compresses it with brotli and fails over budget.

## Build order

1. Package scaffold: `packages/pretrunc`, workspace entry, subpath exports, size test, browser test project with three engines.
2. Measurer: char-code fast path, advance and kerning tables, calibration, tiers.
3. Single-line cut: end, start, middle and its three splits, protected spans, words, trim. Properties.
4. `pretrunc/dom`: shared observer, computed font, font epoch.
5. `pretrunc/solid`: `createCut`, `<Truncate>` with both renderings.
6. sprint-poker: Inter Variable through `@fontsource-variable/inter`, seat names cut in the middle.
7. `pretrunc/lines`: end, start, middle, confirmation, `lessFits`, and `pretrunc/solid/lines`.
8. Benchmarks against the prior art.
