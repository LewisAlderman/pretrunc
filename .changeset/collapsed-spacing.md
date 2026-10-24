---
"pretrunc": patch
---

`Truncate` with `render="full"` no longer runs past its box under letter spacing in Chromium and Firefox. The cut part sat in a `font-size: 0` span, but letter spacing in px doesn't shrink with the font, so each of its characters still took the spacing: a middle cut of a 38-character name at 140 px with 2 px spacing laid out at 180.6 px. The span now sets `letter-spacing: 0` too.
