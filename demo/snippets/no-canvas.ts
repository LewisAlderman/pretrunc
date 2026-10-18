import type { Metrics } from "pretrunc/metrics";
declare const inter: Metrics;
declare const story: string;
declare const width: number;
// ---cut---
import {
  cut,
  prepare,
  toText,
} from "pretrunc";
import { tableFace } from "pretrunc/metrics";

// `vp run metrics` writes `inter` from
// the font file. No canvas: a server or a
// worker can cut text too.
const p = prepare(
  story,
  tableFace(inter, 16),
);
const shown = toText(p, cut(p, width));
