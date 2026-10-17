import {
  layout,
  type LayoutCursor,
  layoutNextLineRange,
  prepareWithSegments,
  type PreparedTextWithSegments,
  walkLineRanges,
} from "@chenglou/pretext";
import {
  type Cut,
  type CutOptions,
  cutFrom,
  graphemeAt,
  head,
  pack,
  prepare,
  type Prepared,
} from "./cut.ts";
import { fontFace } from "./face.ts";

/** Text prepared for laying out in lines with pretext. */
export interface Lines {
  /** The text as `white-space: normal` paints it; every offset refers to this string. */
  readonly text: string;
}

export interface LinesOptions {
  readonly wordBreak?: "normal" | "keep-all";
  /** As in `prepare`: matches the last line's cut keeps whole or drops whole. */
  readonly protect?: RegExp;
}

interface Internal extends Lines {
  readonly l: PreparedTextWithSegments;
  readonly font: string;
  /** Each segment's start offset, then the text's length. */
  readonly s: number[];
  readonly o: LinesOptions;
  /** The core's preparation of the same text, made on the first cut that needs it. */
  c: Prepared | undefined;
}

const START: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
let segmenter: Intl.Segmenter | undefined;

export const prepareLines = (text: string, font: string, options: LinesOptions = {}): Lines => {
  const l = prepareWithSegments(
    text,
    font,
    options.wordBreak ? { wordBreak: options.wordBreak } : {},
  );
  // pretext collapses white space as the core does, so its segments join to the same text.
  let joined = "";
  const s = [0];
  for (const segment of l.segments) s.push((joined += segment).length);
  const p: Internal = { text: joined, l, font, s, o: options, c: undefined };
  return p;
};

/** Whether an element `room` px wide fits after the last line, as a "less" link would. */
export const lessFits = (lines: Lines, width: number, room: number): boolean => {
  let last = 0;
  walkLineRanges((lines as Internal).l, width, (line) => (last = line.width));
  return last + room <= width;
};

/**
 * Cuts text to `count` lines of `width` px, with the ellipsis at the end of the last
 * line, the start of the first, or inside a middle line (`ratio` of the way through).
 */
export const clamp = (
  lines: Lines,
  width: number,
  count: number,
  options: CutOptions = {},
): Cut => {
  const p = lines as Internal;
  const { text, l, font, s, o } = p;
  const { at = "end", ratio = 0.5, words = true, trim = true, ellipsis = "…" } = options;
  const n = Math.max(1, count);
  const length = text.length;
  const ew = typeof ellipsis === "number" ? ellipsis : fontFace(font).m(ellipsis);
  const segments = l.segments.length;
  const offset = (c: LayoutCursor) =>
    s[c.segmentIndex]! +
    (c.graphemeIndex
      ? [...(segmenter ??= new Intl.Segmenter()).segment(l.segments[c.segmentIndex]!)][
          c.graphemeIndex
        ]!.index
      : 0);
  // How many lines the text from `from` takes, the first `first` px wide, counting no
  // further than one past `limit`. Pure arithmetic over pretext's prepared widths.
  const linesFrom = (from: LayoutCursor, first: number, limit: number) => {
    let lines = 0;
    let c: LayoutCursor = from;
    let room = first;
    while (lines <= limit) {
      const range = layoutNextLineRange(l, room, c);
      if (range === null) break;
      lines++;
      c = range.end;
      room = width;
    }
    return lines;
  };
  if (linesFrom(START, width, n) <= n) return pack(length, length);

  // The start of line `index` (from 0); the text has more lines than that.
  const lineStart = (index: number) => {
    let c = START;
    for (let i = 0; i < index; i++) c = layoutNextLineRange(l, width, c)!.end;
    return offset(c);
  };
  // The core's end cut of the text from `from`, as one line in `room` px. One core
  // preparation of the whole text serves every line and every width.
  const endCut = (from: number, room: number, e: string | number) => {
    const core = (p.c ??= prepare(text, font, o));
    return head(
      cutFrom(core, graphemeAt(core, from), room, { ...options, at: "end", ellipsis: e }),
    );
  };

  if (at === "end") return pack(endCut(lineStart(n - 1), width, ellipsis), length);

  // The text before the tail stays on lines [0, line) and `used` px of line `line`.
  const line = at === "start" ? 0 : Math.min(n - 1, Math.floor(n * ratio));
  const h = at === "start" ? 0 : endCut(lineStart(line), (n * ratio - line) * width, 0);
  const used = (h ? fontFace(font).m(text.slice(lineStart(line), h)) : 0) + ew;
  // Where the tail may start, after the head (cutting nothing is no cut), with its cursor:
  // word starts, or every grapheme start without word preference. When trimming, never a space nor
  // `,;:`. The text's end always closes the list.
  const starts = (wordsOnly: boolean) => {
    const list: Array<readonly [number, LayoutCursor]> = [];
    for (let i = 0; i < segments; i++) {
      if (s[i + 1]! <= h || (trim && l.kinds[i] === "space")) continue;
      let g = 0;
      for (const grapheme of (segmenter ??= new Intl.Segmenter()).segment(l.segments[i]!)) {
        const at = s[i]! + grapheme.index;
        if (at > h && !(trim && /[,;:]/.test(text[at]!)))
          list.push([at, { segmentIndex: i, graphemeIndex: g }]);
        if (wordsOnly) break;
        g++;
      }
    }
    list.push([length, START]);
    return list;
  };
  // The first start whose tail fits the model: its lines, the first beside the head and
  // the ellipsis, end by line n. A later start never takes more lines.
  const first = (list: ReturnType<typeof starts>) => {
    let lo = 0;
    let hi = list.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (linesFrom(list[mid]![1], width - used, n - line) <= n - line) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };
  let list = starts(words !== false);
  let i = first(list);
  // With no word start that fits, the tail starts between graphemes, as the core falls back.
  if (i === list.length - 1 && words !== false) i = first((list = starts(false)));
  // The model lays the tail out apart from the head, and the joined line can wrap
  // differently: a tail that begins mid-word can't break where a line start could, and an
  // ellipsis can end the line before. So the cut settles on the real layout, later while
  // it runs over, then earlier while one more start still fits.
  const e = typeof ellipsis === "string" ? ellipsis : "";
  const fits = (at: number) =>
    layout(prepareWithSegments(text.slice(0, h) + e + text.slice(at), font, o), width - 1 / 64, 1)
      .lineCount <= n;
  while (i < list.length - 1 && !fits(list[i]![0])) i++;
  while (i > 0 && fits(list[i - 1]![0])) i--;
  return pack(h, list[i]![0]);
};
