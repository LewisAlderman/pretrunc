---
"pretrunc": minor
---

`Truncate` and `Clamp` take a `dir` prop, set on their element, and unset unless given, so nothing changes for existing callers. `dir="auto"` takes the direction from the text's first strong character: right-to-left text cut at its end in a left-to-right page then shows its ellipsis on the left, at its end, where it showed on the right, before the text as it reads. It also aligns each text to its own start in a `text-align: start` box, in either direction, and text with no strong character reads left to right. Cuts are still measured left to right, so mixed text laid out right to left can run a pixel or so past its box (#17).
