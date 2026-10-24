# pretrunc

## 0.2.0

### Minor Changes

- 4776997: `Truncate` and `Clamp` take a `dir` prop, set on their element, and unset unless given, so nothing changes for existing callers. `dir="auto"` takes the direction from the text's first strong character: right-to-left text cut at its end in a left-to-right page then shows its ellipsis on the left, at its end, where it showed on the right, before the text as it reads. It also aligns each text to its own start in a `text-align: start` box, in either direction, and text with no strong character reads left to right. Cuts are still measured left to right, so mixed text laid out right to left can run a pixel or so past its box (#17).

### Patch Changes

- 694b829: `Truncate` with `render="full"` no longer runs past its box under letter spacing in Chromium and Firefox. The cut part sat in a `font-size: 0` span, but letter spacing in px doesn't shrink with the font, so each of its characters still took the spacing: a middle cut of a 38-character name at 140 px with 2 px spacing laid out at 180.6 px. The span now sets `letter-spacing: 0` too.

## 0.1.0

### Minor Changes

- 034afd8: First release: one-line cuts at the start, middle or end, multi-line clamps through pretext, Solid 2 and React 19 adapters, and metrics tables for measuring without a canvas, written from a font file by the `pretrunc-metrics` command.
