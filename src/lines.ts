import {
  clearCache,
  type LayoutCursor,
  layoutNextLineRange,
  materializeLineRange,
  type PrepareOptions as PretextOptions,
  prepareWithSegments,
  type PreparedTextWithSegments,
  walkLineRanges,
} from "@chenglou/pretext";
import {
  layoutNextRichInlineLineRange,
  materializeRichInlineLineRange,
  prepareRichInline,
  type RichInlineBox,
  type RichInlineCursor,
  type RichInlineItem,
  type RichInlineLineRange,
  walkRichInlineLineRanges,
} from "@chenglou/pretext/rich-inline";
import {
  type Cut,
  type CutOptions,
  cutFrom,
  head,
  pack,
  type Prepared,
  type Protect,
  prepareRange,
} from "./cut.ts";
import { alsoForget, type FaceData, faceOf, widthOf } from "./face.ts";

// pretext keeps its own widths by font, so a `forget` after a web font loads drops them
// too: kept, they are the fallback's, and a clamp can fit text in fewer lines than it
// paints in.
alsoForget(clearCache);

/** Text prepared for laying out in lines with pretext. */
export interface PreparedLines {
  /** The text as its white space mode paints it; every offset refers to this string. */
  readonly text: string;
}

export interface PrepareLinesOptions {
  /** CSS `white-space`. Default "normal". */
  readonly whiteSpace?: "normal" | "pre-wrap";
  readonly wordBreak?: "normal" | "keep-all";
  /** CSS `letter-spacing` in px. */
  readonly letterSpacing?: number;
  /**
   * As in `prepare`, but a clamp counts only whole matches, on its last line, and keeps
   * each whole or drops it whole.
   */
  readonly protect?: Protect;
}

export interface ClampOptions extends CutOptions {
  /** How many lines to keep. */
  readonly lines: number;
  /** Room in px to keep free after the text's end, for an element such as a "more" link. */
  readonly after?: number;
}

interface Internal extends PreparedLines {
  readonly l: PreparedTextWithSegments;
  readonly font: string;
  /** Each segment's start offset, then the text's length. */
  readonly s: number[];
  readonly o: PrepareLinesOptions;
  /** pretext's options, as `prepareWithSegments` takes them. */
  readonly q: PretextOptions;
  /** A tab's width at most, in `pre-wrap`: eight spaces and half a `ch`. 0 in `normal`. */
  readonly tab: number;
  /** The last line region the core prepared: from, to, and its preparation. */
  r: readonly [number, number, Prepared] | undefined;
  /** Where a tail may start: word starts, then every grapheme start, each found once. */
  c: Starts | undefined;
  d: Starts | undefined;
}

/**
 * Tail starts in order: each one's offset, segment and grapheme index in the segment,
 * and 1 when a trimming cut never starts a tail there, in white space or at `,;:`. `n`
 * of them, then room to spare.
 */
interface Starts {
  readonly at: Int32Array;
  readonly seg: Int32Array;
  readonly g: Int32Array;
  readonly f: Uint8Array;
  readonly n: number;
}

const START: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
let segmenter: Intl.Segmenter | undefined;
// The candidate tail starts of the clamp in progress, as indices into its `Starts`, -1
// for the text's end. Shared and grown as needed, so a clamp allocates no list.
let list = new Int32Array(64);
let listed = 0;

const graphemesOf = (text: string) => [...(segmenter ??= new Intl.Segmenter()).segment(text)];

// A word longer than a line breaks between graphemes, and pretext measures the parts
// grapheme by grapheme, where the engines measure a part as text: WebKit alone, Chromium
// and Firefox within the whole word, its last grapheme kerned against the one after. A
// part can come out over a px wider than pretext has it, so a line it fills to the edge
// loses its last grapheme or box to the next line in an engine, and every line after
// shifts (#8). This is text's widest width in an engine, measured both ways before
// `after`, the text after it when the line ends inside a word. White space at the end
// hangs, and a line with a tab is left to the tab checks. Widths are kept in the face,
// so a clamp again at a width it has seen measures nothing.
const engineWidth = (face: FaceData, spacing: number, text: string, after = "") => {
  text = text.replace(/[ \n]+$/, "");
  const next = graphemesOf(after.slice(0, 16))[0]?.segment;
  return text.includes("\t")
    ? 0
    : Math.max(widthOf(face, text), next ? widthOf(face, text + next) - widthOf(face, next) : 0) +
        spacing * graphemesOf(text).length;
};

// Lays `line`, from `next` in `room` px, out again in less room while it starts
// (`inside`) or ends inside a word, or is wider than `edge`, and runs over by `widthOf`,
// so it gives up a break at a time, as far as one grapheme: the strictest engine's line,
// never ending after any engine's.
const settleLine = <L extends { readonly width: number; readonly end: LayoutCursor }>(
  line: L | null,
  room: number,
  inside: boolean,
  edge: number,
  next: (room: number) => L | null,
  widthOf: (line: L) => number,
) => {
  for (
    let fit = room, tries = 0;
    line && (inside || line.end.graphemeIndex || line.width > edge) && tries < 8;
    tries++
  ) {
    const over = Math.max(line.width, widthOf(line)) - room;
    if (over <= 0) break;
    line = next((fit = Math.min(fit - over, line.width) - 0.001)) ?? line;
  }
  return line;
};

// pretext's next line of `p` from `c` in `room` px, settled as `settleLine` settles it
// when it starts or ends inside a word, or is wider than `edge`.
const nextLine = (
  p: PreparedTextWithSegments,
  face: FaceData,
  spacing: number,
  room: number,
  c: LayoutCursor,
  edge = room,
) => {
  const line = layoutNextLineRange(p, room, c);
  return line && (c.graphemeIndex || line.end.graphemeIndex || line.width > edge)
    ? settleLine(
        line,
        room,
        c.graphemeIndex > 0,
        edge,
        (room) => layoutNextLineRange(p, room, c),
        (line) =>
          engineWidth(
            face,
            spacing,
            materializeLineRange(p, line).text,
            graphemesOf(p.segments[line.end.segmentIndex] ?? "")[line.end.graphemeIndex]?.segment,
          ),
      )
    : line;
};

// Word starts are segment starts, which pretext already gives, so only a grapheme table
// meets the segmenter, and only once a clamp needs one: without word preference, or
// when no word start fits.
const startsOf = (p: Internal, graphemes: boolean): Starts => {
  const known = graphemes ? p.d : p.c;
  if (known) return known;
  const { l, s, text } = p;
  const size = (graphemes ? text.length : l.segments.length) + 1;
  const at = new Int32Array(size);
  const seg = new Int32Array(size);
  const g = new Int32Array(size);
  const f = new Uint8Array(size);
  let n = 0;
  for (let i = 0; i < l.segments.length; i++) {
    const segment = l.segments[i]!;
    const space = /^\s+$/.test(segment);
    let k = 0;
    for (const grapheme of graphemes ? graphemesOf(segment) : [{ index: 0 }]) {
      const offset = s[i]! + grapheme.index;
      const code = text.charCodeAt(offset);
      at[n] = offset;
      seg[n] = i;
      g[n] = k++;
      f[n++] = +(space || code === 44 || code === 58 || code === 59);
    }
  }
  const starts = { at, seg, g, f, n };
  return graphemes ? (p.d = starts) : (p.c = starts);
};

export const prepareLines = (
  text: string,
  font: string,
  options: PrepareLinesOptions = {},
): PreparedLines => {
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
  // A tab advances to the next stop, eight spaces apart, unless that is under half a `ch`
  // away, when Firefox and WebKit take the stop after, as CSS Text says: so up to eight
  // spaces and half a "0".
  const face = faceOf(font);
  const tab =
    options.whiteSpace === "pre-wrap"
      ? 8 * (widthOf(face, " ") + (options.letterSpacing ?? 0)) + widthOf(face, "0") / 2
      : 0;
  const p: Internal = {
    text: joined,
    l,
    font,
    s,
    o: options,
    q,
    tab,
    r: undefined,
    c: undefined,
    d: undefined,
  };
  return p;
};

/** The room in px after the last line of the whole text, where a "less" link would go. */
export const roomAfter = (lines: PreparedLines, width: number): number => {
  let last = 0;
  walkLineRanges((lines as Internal).l, width, (line) => (last = line.width));
  return width - last;
};

/**
 * Cuts text to `options.lines` lines of `width` px, with the ellipsis at the end of the
 * last line, the start of the first, or inside a middle line (`ratio` of the way through).
 */
export const clamp = (lines: PreparedLines, width: number, options: ClampOptions): Cut => {
  const p = lines as Internal;
  const { text, l, font, s, o } = p;
  const { at = "end", ratio = 0.5, words = true, trim = true, ellipsis = "…", after = 0 } = options;
  const n = Math.max(1, options.lines);
  const length = text.length;
  const spacing = o.letterSpacing ?? 0;
  const face = faceOf(font);
  const ew =
    typeof ellipsis === "number" ? ellipsis : widthOf(face, ellipsis) + spacing * ellipsis.length;
  const next = (room: number, c: LayoutCursor) => nextLine(l, face, spacing, room, c);
  const offset = (c: LayoutCursor) =>
    s[c.segmentIndex]! +
    (c.graphemeIndex ? graphemesOf(l.segments[c.segmentIndex]!)[c.graphemeIndex]!.index : 0);
  // How many lines the text from `from` takes, the first `first` px wide, counting no
  // further than one past `limit`, and one more when `after` doesn't fit beside the
  // last. Arithmetic over pretext's prepared widths, but for a break inside a word.
  const linesFrom = (from: LayoutCursor, first: number, limit: number, extra = after) => {
    let lines = 0;
    let c: LayoutCursor = from;
    let room = first;
    let last = 0;
    while (lines <= limit) {
      const range = next(room, c);
      if (range === null) break;
      lines++;
      c = range.end;
      last = range.width + width - room;
      room = width;
    }
    return lines + +(extra > 0 && last + extra > width);
  };
  // The start of line `index` (from 0); the model has more lines than that.
  const lineStart = (index: number) => {
    let c = START;
    for (let i = 0; i < index; i++) c = next(width, c)!.end;
    return c;
  };
  // The core's end cut of the line starting at `line`, in `room` px. A cut keeps at most
  // a line, so the core prepares only the region from there to the end of the line
  // after, or to a hard break, and keeps the last one for the next cut.
  const endCut = (line: LayoutCursor, room: number, e: string | number) => {
    const from = offset(line);
    const after = next(width, line);
    const beyond = after && next(width, after.end);
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
  // so the final check is the stricter of them. It lays out at the model's width: a
  // line that fit the model and not a narrower check shifted the tail at some widths
  // and not the next. The last line's cut keeps its own slack in the core.
  // Engines lay tabs out three ways, and pretext predicts none of them exactly under
  // letter spacing: Chrome and WebKit let a tab hang past the line's end, Firefox keeps
  // it with the word before and wraps the two together. So text with tabs is also
  // checked with each tab as no-break spaces, as many as reach the widest a tab can
  // take, held to the text on both sides.
  const tabbed = p.tab > 0 && text.includes("\t");
  const nbsp = "\u00a0".repeat(tabbed ? Math.ceil(p.tab / (widthOf(face, "\u00a0") + spacing)) : 0);
  const { whiteSpace, wordBreak } = p.q;
  const layoutOptions = {
    ...(whiteSpace ? { whiteSpace } : {}),
    ...(wordBreak ? { wordBreak } : {}),
  };
  // The checks also settle a line within a px of the edge: pretext can sum a line's parts
  // narrower than an engine lays them out together, as Firefox puts "文 😀 ~/…" at 72.03 px
  // where pretext has 71.45 (#10).
  const edge = width - 1;
  // Whether the plain layout of `joined` takes n lines at most. Its lines are laid out
  // again one by one, settled, only when one breaks inside a word or nears the edge.
  const plainWithin = (joined: string) => {
    const plain = prepareWithSegments(joined, font, p.q);
    let broken = false;
    let lines = walkLineRanges(
      plain,
      width,
      (line) => void (broken ||= line.end.graphemeIndex > 0 || line.width > edge),
    );
    if (lines > n || !broken) return lines <= n;
    lines = 0;
    for (
      let c = START, line;
      lines <= n && (line = nextLine(plain, face, spacing, width, c, edge));
    ) {
      lines++;
      c = line.end;
    }
    return lines <= n;
  };
  // Whether the rich-inline layout of `items` takes n lines at most, each line settled
  // as `nextLine` settles it.
  const richWithin = (items: Array<RichInlineItem | RichInlineBox>) => {
    const prepared = prepareRichInline(items, layoutOptions);
    // A text part's width is its widest in an engine, or pretext's when that is wider.
    const widest = (line: RichInlineLineRange) => {
      let w = line.width;
      for (const f of materializeRichInlineLineRange(prepared, line).fragments) {
        const { text } = items[f.itemIndex] as RichInlineItem;
        if (f.text) {
          w += Math.max(
            0,
            engineWidth(
              face,
              spacing,
              f.text,
              f.sourceEnd < text.length && line.end.graphemeIndex ? text.slice(f.sourceEnd) : "",
            ) - f.occupiedWidth,
          );
        }
      }
      return w;
    };
    let broken = false;
    let c: RichInlineCursor | undefined;
    let lines = walkRichInlineLineRanges(
      prepared,
      width,
      (line) => void (broken ||= line.end.graphemeIndex > 0 || line.width > edge),
    );
    if (lines > n || !broken) return lines <= n;
    for (lines = 0; lines <= n; lines++) {
      const from = c;
      const next = (room: number) => layoutNextRichInlineLineRange(prepared, room, from);
      const line = settleLine(
        next(width),
        width,
        (from?.graphemeIndex ?? 0) > 0,
        edge,
        next,
        widest,
      );
      if (!line) break;
      c = line.end;
    }
    return lines <= n;
  };
  // Whether text, an ellipsis and text, then `after`'s room, lay out in n lines: the
  // ellipsis given as a width and the room after as boxes of their size.
  const within = (before: string, rest: string) => {
    if (typeof ellipsis === "string" && !after && !plainWithin(before + ellipsis + rest)) {
      return false;
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
    return richWithin(items);
  };
  const held = (text: string) => text.replaceAll("\t", nbsp);
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
    const graphemes = graphemesOf(text.slice(Math.max(0, h - 32), h));
    return h - graphemes[graphemes.length - 1]!.segment.length;
  };

  // Text that fits shows whole, with nothing after it, so `after` takes no room here.
  // Tabbed text must also fit with each tab at its widest, which the model doesn't know.
  const fitted = linesFrom(START, width, n, 0);
  if (fitted <= n) {
    const all = held(text);
    if (
      !tabbed ||
      (plainWithin(all) &&
        richWithin([{ text: all, font, ...(spacing ? { letterSpacing: spacing } : {}) }]))
    ) {
      return pack(length, length);
    }
  }
  // The model's lines, at most n. Tabbed text the model fits in fewer can still run
  // over with its tabs at their widest, so the cut works within the lines it has.
  const drawn = Math.min(n, fitted);

  if (at === "end") {
    let h = endCut(lineStart(drawn - 1), width - after, ellipsis);
    // The core cuts the last line with each tab at its widest, but the lines before come
    // from the model, so tabbed text is checked on the real layout too, as start and
    // middle cuts are.
    while (tabbed && h > 0 && !fits(h, length)) h = back(h);
    return pack(h, length);
  }

  // The text before the tail stays on lines [0, line) and `used` px of line `line`.
  const line = at === "start" ? 0 : Math.min(drawn - 1, Math.floor(n * ratio));
  const start = lineStart(line);
  const from = offset(start);
  // The head's share of its line. The tail gets the rest of that line whatever the head
  // keeps of its share, so neither end takes the other's slack and, as the width moves,
  // each end only ever grows or only ever shrinks.
  const share = at === "start" ? 0 : (n * ratio - line) * width;
  let h = at === "start" ? 0 : endCut(start, share, 0);
  // The table the candidates index into, word starts or grapheme starts.
  let c: Starts;
  // Candidate `i`'s offset and line cursor; -1 is the text's end.
  const offsetOf = (i: number) => (list[i]! < 0 ? length : c.at[list[i]!]!);
  const cursorOf = (i: number): LayoutCursor =>
    list[i]! < 0 ? START : { segmentIndex: c.seg[list[i]!]!, graphemeIndex: c.g[list[i]!]! };
  const used = share + ew;
  // Where the tail may start, after head `h` (cutting nothing is no cut): word starts,
  // or every grapheme start without word preference. When trimming, never white space
  // nor `,;:`. The text's end always closes the list.
  const starts = (h: number, wordsOnly: boolean) => {
    c = startsOf(p, !wordsOnly);
    if (list.length < c.n + 1) list = new Int32Array(2 * (c.n + 1));
    listed = 0;
    let lo = 0;
    let hi = c.n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (c.at[mid]! > h) hi = mid;
      else lo = mid + 1;
    }
    for (let j = lo; j < c.n; j++) if (!(trim && c.f[j])) list[listed++] = j;
    list[listed++] = -1;
  };
  // The first start whose tail fits the model: its lines, the first beside the head
  // and the ellipsis, end by line n. A later start never takes more lines.
  const first = () => {
    let lo = 0;
    let hi = listed - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (linesFrom(cursorOf(mid), width - used, n - line) <= n - line) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };
  // Whether the real layout refused the model's start for the last tail found.
  let slipped = false;
  // The cut settles on the real layout: later while it runs over, and, with no head
  // whose room it would take, earlier while one more start still fits.
  const settle = (h: number) => {
    const model = first();
    let i = model;
    while (i < listed - 1 && !fits(h, offsetOf(i))) i++;
    if (at === "start") while (i > 0 && fits(h, offsetOf(i - 1))) i--;
    slipped ||= i > model;
    return i;
  };
  // The earliest tail start that really fits after head `h`, or -1 when none does.
  const tailOf = (h: number) => {
    slipped = false;
    starts(h, words !== false);
    let i = settle(h);
    // With no word start that really fits, the tail starts between graphemes, as the
    // core falls back. Only after settling: the model can pass a word start that the
    // joined layout refuses, when the ellipsis takes a line of its own.
    if (i === listed - 1 && words !== false) {
      starts(h, false);
      i = settle(h);
    }
    return i < listed - 1 || fits(h, length) ? offsetOf(i) : -1;
  };
  for (;;) {
    let t = tailOf(h);
    if (t >= 0 || h <= from) {
      // No tail fits even with the head back at its line's start, so the head shows
      // alone, and settles on the real layout like any other cut: an engine can break
      // its lines elsewhere than the model, as Firefox breaks after a slash and not before
      // an ellipsis, and wrap even the head alone past them (#7).
      if (t < 0) {
        t = length;
        while (h > 0 && !fits(h, length)) h = back(h);
      }
      // When the real layout refused the model's start, the head's last word and the tail
      // wrap together: one more letter of head can push the ellipsis or the tail's first
      // word to the next line and cost the tail more than it gave. Then every
      // shorter head back to the start of its line or of that word, whichever is earlier,
      // is tried, and the one that keeps the most text in all wins, the longest on a tie,
      // so a wider box doesn't show less. Text is counted without white space, which
      // shows as nothing.
      if (at === "middle" && slipped) {
        const ink = (a: number, b: number) => {
          let count = 0;
          for (let i = a; i < b; i++) if (text.charCodeAt(i) > 32) count++;
          return count;
        };
        const words = startsOf(p, false);
        let lo = 0;
        let hi = words.n;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (words.at[mid]! < h) lo = mid + 1;
          else hi = mid;
        }
        // Spaces are segments too: the word is the last start that isn't one.
        while (lo > 0 && words.f[lo - 1]) lo--;
        const floor = Math.min(from, lo ? words.at[lo - 1]! : 0);
        let best = h;
        let bestTail = t;
        for (let shorter = h; shorter > floor;) {
          shorter = Math.max(floor, back(shorter));
          const rest = tailOf(shorter);
          if (rest >= 0 && ink(rest, bestTail) > ink(shorter, best)) {
            best = shorter;
            bestTail = rest;
          }
        }
        h = best;
        t = bestTail;
      }
      return pack(h, t);
    }
    // With no tail at all still running over, as when the room after leaves less than
    // the head took, the head gives up a grapheme and the tail is found again.
    h = Math.max(from, back(h));
  }
};
