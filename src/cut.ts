import { type Face, fontFace, pairOf, unitOf, widthOf } from "./face.ts";

/** Text measured once, ready to cut at any width. */
export interface Prepared {
  /** The text as `white-space: normal` paints it; every offset refers to this string. */
  readonly text: string;
}

interface Internal extends Prepared {
  readonly f: Face;
  /** Each grapheme's start offset, then the text's length. */
  readonly b: number[];
  /**
   * `w[i]`: the width of the first `i` graphemes, kerning between them included,
   * except kerning that narrows across a possible line break.
   */
  readonly w: Float64Array;
  /** `d[i]`: the narrowing kerning `w` leaves out of the first `i` graphemes. */
  readonly d: Float64Array;
  /** `a[i]`: grapheme `i`'s width alone. */
  readonly a: Float64Array;
  /** Per grapheme: 1 when a word can end beside it, 2 when a cut trims it. */
  readonly c: Uint8Array;
  /** Whether `w - d` matches canvas for the whole text, so cuts can trust `w` without measuring. */
  readonly x: boolean;
  /** The whole text's measured width. */
  readonly y: number;
  /** Per UTF-16 unit, the protected match it belongs to, counted from 1; 0 outside one. */
  readonly k: Uint16Array;
  /**
   * Kerning beside each ellipsis cut with, by ellipsis: `[i]` between grapheme `i` and the
   * ellipsis after it, `[n + i]` between the ellipsis and grapheme `i`. NaN until needed.
   */
  readonly j: Map<string, Float64Array>;
}

export interface PrepareOptions {
  /** Matches that stay whole or go whole, such as a file name: `/[^/]+$/g`. Needs the g flag. */
  readonly protect?: RegExp;
}

export interface CutOptions {
  /** Where the ellipsis goes. Default "end". */
  readonly at?: "start" | "middle" | "end";
  /** Middle: the head's share of the room. Default 0.5. */
  readonly ratio?: number;
  /** Middle: keep the last `tail` graphemes, when they fit. */
  readonly tail?: number;
  /** Middle: the tail starts at protected match `keep` (from 0), when it fits. */
  readonly keep?: number;
  /** Back off to a word boundary within a quarter of the room (true), within this many px, or never (false). Default true. */
  readonly words?: boolean | number;
  /** Drop spaces and `,;:` beside the ellipsis. Default true. */
  readonly trim?: boolean;
  /** The ellipsis text, or the width in px of an element you render in its place. Default "…". */
  readonly ellipsis?: string | number;
}

/**
 * Kept text is `text.slice(0, head) + ellipsis + text.slice(tail)`, packed as
 * `head * 2 ** 26 + tail`: exact for text under 2 ** 26 UTF-16 units.
 */
export type Cut = number & { readonly cut: unique symbol };

const SHIFT = 2 ** 26;
// Browsers lay text out in 1/64 px units and can round a run's width up by one.
const SLACK = 1 / 64;

let segmenter: Intl.Segmenter | undefined;
// `breaks` and `trims` per character below U+0300, as grapheme flags; built on first use.
let flags: Uint8Array | undefined;

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
// that widens counts: never narrower than any engine lays it out.
const across = (kerning: number, broken: unknown) => (broken ? Math.max(0, kerning) : kerning);

export const prepare = (
  text: string,
  font: string | Face,
  options: PrepareOptions = {},
): Prepared => {
  const t = text.replace(/[\t\n\f\r ]+/g, " ").replace(/^ | $/g, "");
  const f = typeof font === "string" ? fontFace(font) : font;
  // Below U+0300 every UTF-16 unit is a grapheme (CRLF is gone with the white space),
  // so most text never meets the segmenter. The class is anything from U+0300 up.
  const simple = !/[^\0-˿]/.test(t);
  const b = simple
    ? Array.from(t, (_, i) => i)
    : Array.from((segmenter ??= new Intl.Segmenter()).segment(t), (g) => g.index);
  b.push(t.length);
  const n = b.length - 1;
  const w = new Float64Array(n + 1);
  const d = new Float64Array(n + 1);
  const a = new Float64Array(n);
  const c = new Uint8Array(n);
  // Whether each word, measured whole, matches the sum of its pairs (`w - d`, kerning
  // uncapped). Then the whole text does, since nothing shapes across a space, and every
  // cut of it is arithmetic. Words repeat across texts in one font, as names and folders
  // do, so most are measured once for a whole table.
  let x = true;
  let word = 0;
  const check = (end: number) => {
    if (x && end - word > 1) {
      const sum = w[end]! - d[end]! - w[word + 1]! + d[word + 1]! + a[word]!;
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
  for (let i = 0; i < n; i++) {
    // A grapheme adds its own advance plus the kerning from its pair. The step is never
    // below 0, so a binary search stays valid.
    let kerning = 0;
    let space = false;
    if (simple) {
      const code = t.charCodeAt(i);
      a[i] = unitOf(f, code);
      c[i] = flags[code]!;
      if (i) kerning = pairOf(f, t.charCodeAt(i - 1), code) - a[i - 1]! - a[i]!;
      space = code === 32;
    } else {
      const g = t.slice(b[i], b[i + 1]);
      a[i] = widthOf(f, g);
      c[i] = +breaks.test(g) | (+trims.test(g) << 1);
      if (i) kerning = widthOf(f, previous + g) - a[i - 1]! - a[i]!;
      space = g === " ";
      previous = g;
    }
    const counted = i ? across(kerning, c[i - 1]! & 1) : 0;
    w[i + 1] = w[i]! + Math.max(0, a[i]! + counted);
    d[i + 1] = d[i]! + counted - kerning;
    if (space) {
      check(i);
      word = i + 1;
    }
  }
  check(n);
  // Text the model can't be trusted with, such as ligatures or joined scripts, is
  // measured whole.
  const y = x ? w[n]! - d[n]! : f.m(t);
  const k = new Uint16Array(t.length + 1);
  let match = 0;
  if (options.protect)
    for (const m of t.matchAll(options.protect)) k.fill(++match, m.index, m.index + m[0].length);
  const p: Internal = { text: t, f, b, w, d, a, c, x, y, k, j: new Map() };
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
const isBreak = (i: number) => i === O || i === N || ((P.c[i - 1]! | P.c[i]!) & 1) !== 0;
// Whether a cut before grapheme `i` falls inside a protected match.
const inside = (i: number) => {
  const at = P.b[i]!;
  return P.k[at]! > 0 && P.k[at] === P.k[at - 1];
};
const kern = (left: string, right: string) =>
  widthOf(P.f, left + right) - widthOf(P.f, left) - widthOf(P.f, right);
// The kerning between grapheme `i` and the ellipsis after it (`side` 0) or before it (1).
const beside = (i: number, side: number) => {
  let kerning = J![side * N + i]!;
  // NaN, not yet measured.
  if (kerning !== kerning) {
    kerning = side ? kern(E as string, grapheme(i)) : kern(grapheme(i), E as string);
    J![side * N + i] = kerning;
  }
  return kerning;
};

// The largest `h` whose head fits `r` px, and the smallest `t` whose tail does.
const maxHead = (r: number) => {
  let lo = O;
  let hi = N;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (headWidth(mid) <= r) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};
const minTail = (r: number) => {
  let lo = 0;
  let hi = N;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tailWidth(mid) <= r) hi = mid;
    else lo = mid + 1;
  }
  return lo;
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
    painted = J ? f.m(before + E + after) : f.m(before) + EW + f.m(after);
    if (h > O) painted += d[h]! - d[O + 1]!;
    if (t < N) painted += d[N]! - d[t + 1]!;
  }
  if (J && h > O) {
    const kerning = beside(h - 1, 0);
    painted += across(kerning, c[h - 1]! & 1) - (x ? 0 : kerning);
  }
  if (J && t < N) {
    const kerning = beside(t, 1);
    painted += across(kerning, 1) - (x ? 0 : kerning);
  }
  return painted;
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
 * `cut`, keeping the text before grapheme `origin` out of the cut: the head starts there.
 * Only an end cut uses it, and only once the caller knows the rest doesn't fit.
 */
export const cutFrom = (
  prepared: Prepared,
  origin: number,
  width: number,
  options: CutOptions = {},
): Cut => {
  const p = prepared as Internal;
  const { b, w, k } = p;
  const { ratio = 0.5, words = true, trim = true, ellipsis = "…" } = options;
  P = p;
  N = b.length - 1;
  O = origin;
  room = width - SLACK;
  if (!N || (!O && p.y <= room)) return pack(b[N]!, b[N]!);
  at = options.at ?? "end";
  E = ellipsis;
  if (typeof ellipsis === "string") {
    EW = widthOf(p.f, ellipsis);
    J = p.j.get(ellipsis);
    if (!J) p.j.set(ellipsis, (J = new Float64Array(2 * N).fill(Number.NaN)));
  } else {
    EW = ellipsis;
    J = undefined;
  }

  // The head keeps graphemes [O, h) and the tail [t, N), in `r` px of text.
  const r = room - EW;
  h = N;
  t = N;
  if (at === "start") {
    h = 0;
    t = minTail(r);
  } else if (at === "end") {
    h = maxHead(r);
  } else {
    let fixed = -1;
    if (options.tail !== undefined) fixed = Math.max(0, N - options.tail);
    else if (options.keep !== undefined) {
      fixed = 0;
      while (fixed < N && k[b[fixed]!] !== options.keep + 1) fixed++;
    }
    t =
      fixed >= 0 && fixed < N && tailWidth(fixed) <= r
        ? fixed
        : minTail(r - w[maxHead(r * ratio)]!);
    h = Math.min(t, maxHead(r - tailWidth(t)));
  }
  // The search leaves out the kerning beside the ellipsis and, where the model isn't
  // trusted, shaping across graphemes: a pixel or two, so the cut settles by single
  // graphemes. It shrinks until it fits, then each side grows while one more fits,
  // which also finds a longer cut that a ligature paints narrower.
  shrink();
  if (at !== "start") while (h < t && measure(h + 1, t) <= room) h++;
  if (at !== "end") while (t > h && measure(h, t - 1) <= room) t--;
  if (words !== false) {
    const limit = words === true ? r / 4 : words;
    let i = h;
    while (i > O && !isBreak(i) && w[h]! - w[i - 1]! <= limit) i--;
    if (isBreak(i)) h = i;
    i = t;
    while (i < N && !isBreak(i) && w[i + 1]! - w[t]! <= limit) i++;
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
  const { b } = prepared as Internal;
  let lo = 0;
  let hi = b.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (b[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};
