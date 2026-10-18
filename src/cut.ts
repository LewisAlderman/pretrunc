import { type Face, type FaceData, faceOf, pairOf, unitOf, widthOf } from "./face.ts";

/** Text measured once, ready to cut at any width. */
export interface Prepared {
  /** The text as `white-space: normal` paints it; every offset refers to this string. */
  readonly text: string;
}

interface Internal extends Prepared {
  readonly f: FaceData;
  /** Graphemes. */
  readonly n: number;
  /**
   * Each grapheme's start offset, then the text's length. Simple text shares one
   * array of 0, 1, 2…, which can run past its length.
   */
  readonly b: number[];
  /**
   * `w[i]`: the width of the first `i` graphemes, kerning between them included,
   * except kerning that narrows across a possible line break.
   */
  readonly w: Float64Array;
  /** `d[i]`: the narrowing kerning `w` leaves out of the first `i` graphemes. */
  readonly d: Float64Array;
  /** `a[i]`: grapheme `i`'s width alone, letter spacing included. */
  readonly a: Float64Array;
  /** Per grapheme: 1 when a word can end beside it, 2 when a cut trims it. */
  readonly c: Uint8Array;
  /** Whether `w - d` matches canvas for the whole text, so cuts can trust `w` without measuring. */
  readonly x: boolean;
  /** The whole text's measured width. */
  readonly y: number;
  /**
   * Protected matches as offset pairs, start then end, in order. A start is clipped to the
   * text's, but an end past the text's stays, so a cut at the end of a range of a longer
   * text still sees the match run on.
   * Empty without `protect`. A few numbers, where marking every unit took an array as
   * long as the text, which in Chromium cost more than the regex.
   */
  readonly k: number[];
  /** How many matches of the whole text come before the first pair, so `tailMatch` counts from the start of it. */
  readonly m: number;
  /** Whether every UTF-16 unit is a grapheme below U+0300, so widths are found by code. */
  readonly u: boolean;
  /** Letter spacing in px, counted per UTF-16 unit: WebKit spaces glyphs, several to a grapheme in Indic and Thai. */
  readonly s: number;
  /** How much wider a tab lays out than canvas measures it, in `pre-wrap`; 0 otherwise. */
  readonly g: number;
  /**
   * Kerning beside each ellipsis cut with, by ellipsis: `[i]` between grapheme `i` and the
   * ellipsis after it, `[n + i]` between the ellipsis and grapheme `i`. NaN until needed.
   */
  j: Map<string, Float64Array> | undefined;
  /** Where the last head search ended, and the last tail search: the next one starts there. */
  v: number;
  z: number;
}

export interface PrepareOptions {
  /** Matches that stay whole or go whole, such as a file name: `/[^/]+$/`. */
  readonly protect?: RegExp;
  /** CSS `letter-spacing` in px, which every grapheme carries after it. */
  readonly letterSpacing?: number;
}

export interface CutOptions {
  /** Where the ellipsis goes. Default "end". */
  readonly at?: "start" | "middle" | "end";
  /** Middle: the head's share of the room. Default 0.5. */
  readonly ratio?: number;
  /** Middle: the tail keeps this many graphemes, when they fit. */
  readonly tailGraphemes?: number;
  /** Middle: the tail starts at this protected match (from 0), when it fits. */
  readonly tailMatch?: number;
  /**
   * Back off to a word boundary within a quarter of what that side keeps (true), within
   * `within` px, or never (false). Default true.
   */
  readonly words?: boolean | { readonly within: number };
  /** Drop spaces and `,;:` beside the ellipsis. Default true. */
  readonly trim?: boolean;
  /** The ellipsis text, or the width in px of an element you render in its place. Default "…". */
  readonly ellipsis?: string | number;
}

/**
 * Kept text is `text.slice(0, head(c)) + ellipsis + text.slice(tail(c))`. Two cuts are
 * `===` when they keep the same head and tail, so a memo can compare them.
 */
export type Cut = number & { readonly cut: unique symbol };

const SHIFT = 2 ** 26;
// Browsers lay text out in 1/64 px units and can round a run's width up by one.
const SLACK = 1 / 64;

let segmenter: Intl.Segmenter | undefined;
// `breaks` and `trims` per character below U+0300, as grapheme flags; built on first use.
let flags: Uint8Array | undefined;
// Offsets 0, 1, 2…: every simple text's grapheme starts. It only grows, and is shared.
const identity = [0];
const none: number[] = [];

/** A cut from its two offsets; for pretrunc's own entries, not re-exported. */
export const pack = (head: number, tail: number): Cut => (head * SHIFT + tail) as Cut;
export const head = (c: Cut): number => Math.floor(c / SHIFT);
export const tail = (c: Cut): number => c % SHIFT;
export const truncated = (c: Cut): boolean => head(c) < tail(c);
export const toText = (p: Prepared, c: Cut, ellipsis = "…"): string =>
  truncated(c) ? p.text.slice(0, head(c)) + ellipsis + p.text.slice(tail(c)) : p.text;

// A word can end beside white space, a hyphen, a slash, an underscore, a full stop or an
// ellipsis, an en or em dash. From U+2E80 up (CJK, emoji) every character is a word of its own.
const breaks = /[\s\-/_.…–—⺀-￿]/;
const trims = /[\s,;:]/;
// WebKit lays out the text between two break opportunities as a run of its own, so
// kerning across one, after a hyphen, a dash, CJK or an ellipsis, never reaches the
// page there, while Chrome and Firefox keep it. Across a possible break, only kerning
// that widens counts: never narrower than any engine lays it out. WebKit also turns
// kerning off under letter spacing, so with it no narrowing kerning counts anywhere.
const across = (kerning: number, broken: unknown) => (broken ? Math.max(0, kerning) : kerning);

export const prepare = (
  text: string,
  font: string | Face,
  options: PrepareOptions = {},
): Prepared =>
  build(
    // Most text has no run of white space to collapse, so one test saves two replaces.
    /[\t\n\f\r]| {2}|^ | $/.test(text)
      ? text.replace(/[\t\n\f\r ]+/g, " ").replace(/^ | $/g, "")
      : text,
    typeof font === "string" ? faceOf(font) : (font as FaceData),
    options,
  );

/**
 * Prepares `full.slice(from, to)` as it stands, white space kept, with protected
 * matches found in all of `full`, and a tab `tab` px wide when that's given: the most
 * a tab stop can take. For pretrunc's own entries.
 */
export const prepareRange = (
  full: string,
  from: number,
  to: number,
  font: string,
  options: PrepareOptions,
  tab = 0,
): Prepared => build(full.slice(from, to), faceOf(font), options, full, from, tab);

const build = (
  t: string,
  f: FaceData,
  options: PrepareOptions,
  full = t,
  from = 0,
  tab = 0,
): Prepared => {
  const spacing = options.letterSpacing ?? 0;
  // Below U+0300 every UTF-16 unit is a grapheme, CRLF aside, which white space
  // handling removes or a hard break ends a line at, so most text never meets the
  // segmenter. The class is anything from U+0300 up.
  const simple = !/[^\0-\u02ff]/.test(t);
  let b = identity;
  if (simple) while (b.length <= t.length) b.push(b.length);
  else {
    b = Array.from((segmenter ??= new Intl.Segmenter()).segment(t), (g) => g.index);
    b.push(t.length);
  }
  const n = simple ? t.length : b.length - 1;
  const w = new Float64Array(n + 1);
  const d = new Float64Array(n + 1);
  const a = new Float64Array(n);
  const c = new Uint8Array(n);
  // Whether each word, measured whole, matches the sum of its pairs (`w - d`, kerning
  // uncapped, letter spacing left out). Then the whole text does, since nothing shapes
  // across a space, and every cut of it is arithmetic. Words repeat across texts in one
  // font, as names and folders do, so most are measured once for a whole table.
  let x = true;
  let word = 0;
  const check = (end: number) => {
    if (x && end - word > 1) {
      const sum =
        w[end]! - d[end]! - w[word + 1]! + d[word + 1]! + a[word]! - spacing * (b[end]! - b[word]!);
      x = Math.abs(widthOf(f, t.slice(b[word], b[end])) - sum) < 0.01;
    }
  };
  if (!flags) {
    flags = new Uint8Array(768);
    for (let code = 0; code < 768; code++) {
      const ch = String.fromCharCode(code);
      flags[code] = +breaks.test(ch) | (+trims.test(ch) << 1);
    }
  }
  let previous = "";
  let before = 0;
  for (let i = 0; i < n; i++) {
    // A grapheme adds its own advance, the kerning from its pair and its letter
    // spacing. The step is never below 0, so a binary search stays valid.
    let own: number;
    let kerning = 0;
    let space = false;
    if (simple) {
      const code = t.charCodeAt(i);
      own = tab && code === 9 ? tab : unitOf(f, code);
      c[i] = flags[code]!;
      if (i && !(tab && (code === 9 || t.charCodeAt(i - 1) === 9))) {
        kerning = pairOf(f, t.charCodeAt(i - 1), code) - before - own;
      }
      space = code === 32;
    } else {
      const g = t.slice(b[i], b[i + 1]);
      own = tab && g === "\t" ? tab : widthOf(f, g);
      c[i] = +breaks.test(g) | (+trims.test(g) << 1);
      if (i && !(tab && (g === "\t" || previous === "\t"))) {
        kerning = widthOf(f, previous + g) - before - own;
      }
      space = g === " ";
      previous = g;
    }
    const spaced = spacing * (b[i + 1]! - b[i]!);
    a[i] = own + spaced;
    const counted = i ? across(kerning, spacing || c[i - 1]! & 1) : 0;
    w[i + 1] = w[i]! + Math.max(0, own + counted) + spaced;
    d[i + 1] = d[i]! + counted - kerning;
    if (space) {
      check(i);
      word = i + 1;
    }
    before = own;
  }
  check(n);
  // Text the model can't be trusted with, such as ligatures or joined scripts, is
  // measured whole.
  // Canvas has no tab stops, so a measured tab is widened to the most a stop can take.
  const g = tab && tab - widthOf(f, "\t");
  // The width that has to fit for the text to show whole, kerning counted as for a cut.
  const y = x ? w[n]! : f.m(t) + spacing * t.length + g * (t.split("\t").length - 1) + d[n]!;
  let k = none;
  let m = 0;
  if (options.protect) {
    k = [];
    let before = 0;
    // Counted over the whole text, so `tailMatch` names the same match in any range of
    // it. `matchAll` throws on a pattern without the g flag, so one is given it.
    const pattern = options.protect;
    for (const match of full.matchAll(
      pattern.global ? pattern : new RegExp(pattern, pattern.flags + "g"),
    )) {
      const start = match.index - from;
      const end = start + match[0].length;
      if (start < t.length && end > 0) {
        if (!k.length) m = before;
        k.push(Math.max(0, start), end);
      }
      before++;
    }
  }
  const p: Internal = {
    text: t,
    f,
    n,
    b,
    w,
    d,
    a,
    c,
    x,
    y,
    k,
    m,
    u: simple,
    s: spacing,
    g,
    j: undefined,
    v: 0,
    z: n,
  };
  return p;
};

// The cut in progress. A cut runs to its end without calling out except to a face's
// measure, so its helpers read this state instead of closing over it: a resize frame
// over thousands of rows then allocates nothing per cut.
let P: Internal;
let N = 0;
let O = 0;
let room = 0;
let E: string | number = "";
let EW = 0;
let J: Float64Array | undefined;
let at: CutOptions["at"] = "end";

const grapheme = (i: number) => P.text.slice(P.b[i], P.b[i + 1]);
// The head from grapheme O to `h` alone: its first grapheme without kerning before it.
const headWidth = (h: number) => (h > O ? P.w[h]! - P.w[O + 1]! + P.a[O]! : 0);
// The tail alone: its first grapheme's own advance, without the kerning before it.
const tailWidth = (t: number) => (t < N ? P.w[N]! - P.w[t + 1]! + P.a[t]! : 0);
// A word boundary inside the text: backing off to either end would keep nothing.
const isBreak = (i: number) => i > O && i < N && ((P.c[i - 1]! | P.c[i]!) & 1) !== 0;
// Whether a cut before grapheme `i` falls inside a protected match.
const inside = (i: number) => {
  const at = P.b[i]!;
  const k = P.k;
  for (let j = 0; j < k.length && k[j]! < at; j += 2) if (at < k[j + 1]!) return true;
  return false;
};
const kern = (left: string, right: string) =>
  widthOf(P.f, left + right) - widthOf(P.f, left) - widthOf(P.f, right);
// The kerning between grapheme `i` and the ellipsis after it (`side` 0) or before it (1).
const beside = (i: number, side: number) => {
  // Simple text shares its face's kerning by character code; other text keeps its own.
  const at = P.u ? side * 768 + P.text.charCodeAt(i) : side * N + i;
  let kerning = J![at]!;
  // NaN, not yet measured.
  if (kerning !== kerning) {
    kerning = side ? kern(E as string, grapheme(i)) : kern(grapheme(i), E as string);
    J![at] = kerning;
  }
  return kerning;
};

// The largest `h` whose head fits `r` px, and the smallest `t` whose tail does. A resize
// moves a cut a grapheme or two, so each search gallops from where the last one on this
// text ended, doubling its step until it brackets the answer, then bisects the bracket.
// The widths only grow with `h`, so the answer is the one a plain bisection finds.
const maxHead = (r: number) => {
  let lo = O;
  let hi = N;
  let i = Math.max(P.v, O);
  // `lo` always fits, as the empty head does even in no room, so it is never measured.
  for (let step = 1; lo < hi; step *= 2) {
    if (i === lo || headWidth(i) <= r) {
      lo = i;
      i += step;
      if (i > hi) break;
    } else {
      hi = i - 1;
      i -= step;
      if (i < lo) break;
    }
  }
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (headWidth(mid) <= r) lo = mid;
    else hi = mid - 1;
  }
  return (P.v = lo);
};
const minTail = (r: number) => {
  let lo = 0;
  let hi = N;
  let i = P.z;
  for (let step = 1; lo < hi; step *= 2) {
    if (i === hi || tailWidth(i) <= r) {
      hi = i;
      i -= step;
      if (i < lo) break;
    } else {
      lo = i + 1;
      i += step;
      if (i > hi) break;
    }
  }
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tailWidth(mid) <= r) hi = mid;
    else lo = mid + 1;
  }
  return (P.z = lo);
};

// How wide a cut paints. When the model matched canvas over the whole text it is
// trusted; otherwise the cut is measured for real, plus the kerning that a break
// opportunity drops in WebKit. Either way the kerning beside the ellipsis is added,
// and the one after it always crosses a break.
const measure = (h: number, t: number) => {
  const { text, f, b, d, c, x } = P;
  let painted = headWidth(h) + EW + tailWidth(t);
  if (!x) {
    const before = text.slice(b[O], b[h]);
    const after = text.slice(b[t]);
    painted = J
      ? f.m(before + E + after) + EW - widthOf(f, E as string)
      : f.m(before) + EW + f.m(after);
    painted += P.s * (b[h]! - b[O]! + b[N]! - b[t]!);
    if (P.g) painted += P.g * ((before + after).split("\t").length - 1);
    if (h > O) painted += d[h]! - d[O + 1]!;
    if (t < N) painted += d[N]! - d[t + 1]!;
  }
  if (J && h > O) {
    const kerning = beside(h - 1, 0);
    painted += across(kerning, P.s || c[h - 1]! & 1) - (x ? 0 : kerning);
  }
  if (J && t < N) {
    const kerning = beside(t, 1);
    painted += across(kerning, 1) - (x ? 0 : kerning);
  }
  return painted;
};

// What a side paints beside the ellipsis: its text and the kerning across to it.
const headSide = (h: number) =>
  headWidth(h) + (J && h > O ? across(beside(h - 1, 0), P.s || P.c[h - 1]! & 1) : 0);
const tailSide = (t: number) => tailWidth(t) + (J && t < N ? across(beside(t, 1), 1) : 0);
// The most a side keeps within `budget`: the search, then a step or two for the
// kerning beside the ellipsis, which the search leaves out.
const fitHead = (budget: number) => {
  let i = maxHead(budget);
  while (i > O && headSide(i) > budget) i--;
  while (i < N && headSide(i + 1) <= budget) i++;
  return i;
};
const fitTail = (budget: number) => {
  let i = minTail(budget);
  while (i < N && tailSide(i) > budget) i++;
  while (i > 0 && tailSide(i - 1) <= budget) i--;
  return i;
};

let h = 0;
let t = 0;
// Shrink the cut a grapheme at a time until it fits, from the side that keeps more.
const shrink = () => {
  while ((h > O || t < N) && measure(h, t) > room) {
    if (at === "end" || (at === "middle" && h > N - t)) h--;
    else t++;
  }
};

/**
 * `cut`, keeping the text before grapheme `origin` out of the cut, the head starting
 * there; with `more`, the text goes on after its end, so even text that fits leaves
 * room for the ellipsis. For pretrunc's own entries: only an end cut uses them.
 */
export const cutFrom = (
  prepared: Prepared,
  origin: number,
  width: number,
  options: CutOptions = {},
  more = false,
): Cut => {
  const p = prepared as Internal;
  const { b, w, k } = p;
  const { ratio = 0.5, words = true, trim = true, ellipsis = "…" } = options;
  P = p;
  N = p.n;
  O = origin;
  room = width - SLACK;
  if (!N || (!O && !more && p.y <= room)) return pack(b[N]!, b[N]!);
  at = options.at ?? "end";
  E = ellipsis;
  if (typeof ellipsis === "string") {
    // Its letter spacing counted per UTF-16 unit, never less than per grapheme.
    EW = widthOf(p.f, ellipsis) + p.s * ellipsis.length;
    const kerns = p.u ? p.f.e : (p.j ??= new Map());
    J = kerns.get(ellipsis);
    if (!J) kerns.set(ellipsis, (J = new Float64Array(p.u ? 1536 : 2 * N).fill(Number.NaN)));
  } else {
    EW = ellipsis;
    J = undefined;
  }

  // The head keeps graphemes [O, h) and the tail [t, N), in `r` px of text. Each side
  // keeps the most that fits its own share and never takes the other's slack, so as the
  // width moves, each side only ever grows or only ever shrinks: the ellipsis doesn't
  // drift a grapheme one way and back.
  const r = room - EW;
  h = N;
  t = N;
  let pinned = false;
  if (at === "start") {
    h = O;
    t = fitTail(r);
  } else if (at === "end") {
    h = fitHead(r);
  } else {
    let fixed = -1;
    const { tailGraphemes, tailMatch } = options;
    if (tailGraphemes !== undefined) fixed = Math.max(0, N - tailGraphemes);
    else if (tailMatch !== undefined) {
      // The first grapheme that starts inside match `tailMatch`, or none.
      const j = 2 * (tailMatch - p.m);
      fixed = 0;
      while (fixed < N && !(j >= 0 && b[fixed]! >= k[j]! && b[fixed]! < k[j + 1]!)) fixed++;
    }
    let head = r * ratio;
    if (fixed >= 0 && fixed < N && tailSide(fixed) <= r) {
      t = fixed;
      head = r - tailSide(t);
      pinned = true;
    } else {
      t = fitTail(r - head);
      // A protected match the tail would split takes room from the head while all of
      // it fits, instead of vanishing the moment it outgrows the tail's share; one that
      // doesn't fit goes whole and leaves the head the room. Either way the cut switches
      // once, at the width where the match starts to fit, never back and forth.
      if (inside(t)) {
        let start = t;
        while (start > 0 && inside(start)) start--;
        if (tailSide(start) <= r) t = start;
        else while (t < N && inside(t)) t++;
        head = r - tailSide(t);
        pinned = true;
      }
    }
    h = Math.min(t, fitHead(head));
  }
  // Text the model can't be trusted with settles on real measurements: shrink until it
  // fits, then each side grows while one more fits, which also finds a longer cut that a
  // ligature paints narrower.
  if (!p.x) {
    shrink();
    if (at !== "start") while (h < t && measure(h + 1, t) <= room) h++;
    if (at !== "end") while (t > h && measure(h, t - 1) <= room) t--;
  }
  if (words !== false) {
    // A quarter of what the side keeps, not of the room: a limit that grew with the width
    // while the cut point held still would cross the distance to a break mid-grapheme and
    // snap the side back a word, then forward again at the next grapheme.
    let limit = words === true ? headWidth(h) / 4 : words.within;
    let i = h;
    while (i > O && !isBreak(i) && w[h]! - w[i - 1]! <= limit) i--;
    if (isBreak(i)) h = i;
    // A tail fixed by `tailGraphemes`, `tailMatch` or a protected match already starts
    // where it should.
    if (words === true) limit = tailWidth(t) / 4;
    i = t;
    while (!pinned && i < N && !isBreak(i) && w[i + 1]! - w[t]! <= limit) i++;
    if (isBreak(i)) t = i;
  }
  while (h > O && (inside(h) || (trim && p.c[h - 1]! & 2))) h--;
  while (t < N && (inside(t) || (trim && p.c[t]! & 2))) t++;
  // Dropping graphemes can widen shaped text, as when a letter loses its joining form.
  shrink();
  return pack(b[h]!, b[t]!);
};

export const cut = (prepared: Prepared, width: number, options: CutOptions = {}): Cut =>
  cutFrom(prepared, 0, width, options);

/** The grapheme that starts at or contains `offset`; for pretrunc's own entries. */
export const graphemeAt = (prepared: Prepared, offset: number): number => {
  const { b, n } = prepared as Internal;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (b[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};
