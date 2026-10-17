import {
  layout,
  type LayoutCursor,
  layoutNextLineRange,
  type PrepareOptions as PretextOptions,
  prepareWithSegments,
  type PreparedTextWithSegments,
  walkLineRanges,
} from "@chenglou/pretext";
import {
  measureRichInlineStats,
  prepareRichInline,
  type RichInlineBox,
  type RichInlineItem,
} from "@chenglou/pretext/rich-inline";
import {
  type Cut,
  type CutOptions,
  cutFrom,
  head,
  pack,
  type Prepared,
  prepareRange,
} from "./cut.ts";
import { fontFace } from "./face.ts";

/** Text prepared for laying out in lines with pretext. */
export interface Lines {
  /** The text as its white space mode paints it; every offset refers to this string. */
  readonly text: string;
}

export interface LinesOptions {
  /** CSS `white-space`. Default "normal". */
  readonly whiteSpace?: "normal" | "pre-wrap";
  readonly wordBreak?: "normal" | "keep-all";
  /** CSS `letter-spacing` in px. */
  readonly letterSpacing?: number;
  /** As in `prepare`: matches the last line's cut keeps whole or drops whole. */
  readonly protect?: RegExp;
}

export interface ClampOptions extends CutOptions {
  /** Room in px to keep free after the text's end, for an element such as a "more" link. */
  readonly after?: number;
}

interface Internal extends Lines {
  readonly l: PreparedTextWithSegments;
  readonly font: string;
  /** Each segment's start offset, then the text's length. */
  readonly s: number[];
  readonly o: LinesOptions;
  /** pretext's options, as `prepareWithSegments` takes them. */
  readonly q: PretextOptions;
  /** A tab's width at most, in `pre-wrap`: eight spaces. 0 in `normal`. */
  readonly tab: number;
  /** The last line region the core prepared: from, to, and its preparation. */
  r: readonly [number, number, Prepared] | undefined;
}

const START: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
let segmenter: Intl.Segmenter | undefined;

export const prepareLines = (text: string, font: string, options: LinesOptions = {}): Lines => {
  const q: PretextOptions = {
    ...(options.whiteSpace ? { whiteSpace: options.whiteSpace } : {}),
    ...(options.wordBreak ? { wordBreak: options.wordBreak } : {}),
    ...(options.letterSpacing ? { letterSpacing: options.letterSpacing } : {}),
  };
  const l = prepareWithSegments(text, font, q);
  // pretext collapses white space as the core does, or keeps it in `pre-wrap` (with CRLF
  // as one break), and its segments join to the text every offset refers to.
  let joined = "";
  const s = [0];
  for (const segment of l.segments) s.push((joined += segment).length);
  const tab =
    options.whiteSpace === "pre-wrap"
      ? 8 * (fontFace(font).m(" ") + (options.letterSpacing ?? 0))
      : 0;
  const p: Internal = { text: joined, l, font, s, o: options, q, tab, r: undefined };
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
  options: ClampOptions = {},
): Cut => {
  const p = lines as Internal;
  const { text, l, font, s, o } = p;
  const { at = "end", ratio = 0.5, words = true, trim = true, ellipsis = "…", after = 0 } = options;
  const n = Math.max(1, count);
  const length = text.length;
  const spacing = o.letterSpacing ?? 0;
  const ew =
    typeof ellipsis === "number"
      ? ellipsis
      : fontFace(font).m(ellipsis) + spacing * ellipsis.length;
  const segments = l.segments.length;
  const offset = (c: LayoutCursor) =>
    s[c.segmentIndex]! +
    (c.graphemeIndex
      ? [...(segmenter ??= new Intl.Segmenter()).segment(l.segments[c.segmentIndex]!)][
          c.graphemeIndex
        ]!.index
      : 0);
  // How many lines the text from `from` takes, the first `first` px wide, counting no
  // further than one past `limit`, and one more when `after` doesn't fit beside the
  // last. Pure arithmetic over pretext's prepared widths.
  const linesFrom = (from: LayoutCursor, first: number, limit: number, extra = after) => {
    let lines = 0;
    let c: LayoutCursor = from;
    let room = first;
    let last = 0;
    while (lines <= limit) {
      const range = layoutNextLineRange(l, room, c);
      if (range === null) break;
      lines++;
      c = range.end;
      last = range.width + width - room;
      room = width;
    }
    return lines + +(extra > 0 && last + extra > width);
  };
  // Text that fits shows whole, with nothing after it, so `after` takes no room here.
  if (linesFrom(START, width, n, 0) <= n) return pack(length, length);

  // The start of line `index` (from 0); the text has more lines than that.
  const lineStart = (index: number) => {
    let c = START;
    for (let i = 0; i < index; i++) c = layoutNextLineRange(l, width, c)!.end;
    return c;
  };
  // The core's end cut of the line starting at `line`, in `room` px. A cut keeps at most
  // a line, so the core prepares only the region from there to the end of the line
  // after, or to a hard break, and keeps the last one for the next cut.
  const endCut = (line: LayoutCursor, room: number, e: string | number) => {
    const from = offset(line);
    const next = layoutNextLineRange(l, width, line);
    const beyond = next && layoutNextLineRange(l, width, next.end);
    let to = beyond ? offset(beyond.end) : length;
    const hard = text.indexOf("\n", from);
    if (hard >= 0 && hard < to) to = hard;
    if (!p.r || p.r[0] !== from || p.r[1] !== to) {
      p.r = [from, to, prepareRange(text, from, to, font, o, p.tab)];
    }
    // The text goes on past the region, so the ellipsis always needs its room.
    return from + head(cutFrom(p.r[2], 0, room, { ...options, at: "end", ellipsis: e }, true));
  };

  // pretext's plain and rich-inline layouts can each be the one that matches an engine,
  // so the final check is the stricter of them.
  const room = width - 1 / 64;
  // Engines lay tabs out three ways, and pretext predicts none of them exactly under
  // letter spacing: Chrome and WebKit let a tab hang past the line's end, Firefox keeps
  // it with the word before and wraps the two together. So text with tabs is also
  // checked with each tab as eight no-break spaces: as wide as a stop can take, and held
  // to the text on both sides.
  const tabbed = p.tab > 0 && text.includes("\t");
  const { whiteSpace, wordBreak } = p.q;
  const layoutOptions = {
    ...(whiteSpace ? { whiteSpace } : {}),
    ...(wordBreak ? { wordBreak } : {}),
  };
  // Whether text, an ellipsis and text, then `after`'s room, lay out in n lines: the
  // ellipsis given as a width and the room after as boxes of their size.
  const within = (before: string, rest: string) => {
    if (typeof ellipsis === "string" && !after) {
      const plain = prepareWithSegments(before + ellipsis + rest, font, p.q);
      if (layout(plain, room, 1).lineCount > n) return false;
    }
    const items: Array<RichInlineItem | RichInlineBox> = [];
    const words = (text: string) => {
      if (text) items.push({ text, font, ...(spacing ? { letterSpacing: spacing } : {}) });
    };
    // A text ellipsis is one run with the text, as it renders; apart, the layout would
    // find a break between them that the joined string doesn't have.
    if (typeof ellipsis === "string") words(before + ellipsis + rest);
    else {
      words(before);
      items.push({ width: ellipsis });
      words(rest);
    }
    if (after) items.push({ width: after });
    return measureRichInlineStats(prepareRichInline(items, layoutOptions), room).lineCount <= n;
  };
  const held = (text: string) => text.replaceAll("\t", "\u00a0".repeat(8));
  // Whether the cut keeping [0, h) and [at, length) really lays out in n lines. The
  // model lays the tail out apart from the head, and the joined line can wrap
  // differently: a tail that begins mid-word can't break where a line start could, and
  // an ellipsis can end the line before.
  const fits = (h: number, at: number) => {
    const before = text.slice(0, h);
    const rest = text.slice(at);
    return within(before, rest) && (!tabbed || within(held(before), held(rest)));
  };
  // The grapheme start before `h`.
  const back = (h: number) => {
    const graphemes = [
      ...(segmenter ??= new Intl.Segmenter()).segment(text.slice(Math.max(0, h - 32), h)),
    ];
    return h - graphemes[graphemes.length - 1]!.segment.length;
  };

  if (at === "end") return pack(endCut(lineStart(n - 1), width - after, ellipsis), length);

  // The text before the tail stays on lines [0, line) and `used` px of line `line`.
  const line = at === "start" ? 0 : Math.min(n - 1, Math.floor(n * ratio));
  const start = lineStart(line);
  const from = offset(start);
  let h = at === "start" ? 0 : endCut(start, (n * ratio - line) * width, 0);
  for (;;) {
    const used = (h > from ? fontFace(font).m(text.slice(from, h)) + spacing * (h - from) : 0) + ew;
    // Where the tail may start, after the head (cutting nothing is no cut), with its
    // cursor: word starts, or every grapheme start without word preference. When
    // trimming, never white space nor `,;:`. The text's end always closes the list.
    const starts = (wordsOnly: boolean) => {
      const list: Array<readonly [number, LayoutCursor]> = [];
      for (let i = 0; i < segments; i++) {
        if (s[i + 1]! <= h || (trim && /^\s+$/.test(l.segments[i]!))) continue;
        let g = 0;
        for (const grapheme of (segmenter ??= new Intl.Segmenter()).segment(l.segments[i]!)) {
          const at = s[i]! + grapheme.index;
          if (at > h && !(trim && /[,;:]/.test(text[at]!))) {
            list.push([at, { segmentIndex: i, graphemeIndex: g }]);
          }
          if (wordsOnly) break;
          g++;
        }
      }
      list.push([length, START]);
      return list;
    };
    // The first start whose tail fits the model: its lines, the first beside the head
    // and the ellipsis, end by line n. A later start never takes more lines.
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
    // The cut settles on the real layout: later while it runs over, then earlier while
    // one more start still fits.
    while (i < list.length - 1 && !fits(h, list[i]![0])) i++;
    while (i > 0 && fits(h, list[i - 1]![0])) i--;
    // With no tail at all still running over, as when the room after leaves less than
    // the head took, the head gives up a grapheme and the tail is found again.
    if (h <= from || i < list.length - 1 || fits(h, length)) return pack(h, list[i]![0]);
    h = Math.max(from, back(h));
  }
};
