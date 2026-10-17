import { type Face, fontFace, widthOf } from "./face.ts";

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
  /** Whether `w - d` matches canvas for the whole text, so cuts can trust `w` without measuring. */
  readonly x: boolean;
  /** The whole text's measured width. */
  readonly y: number;
  /** Per UTF-16 unit, the protected match it belongs to, counted from 1; 0 outside one. */
  readonly k: Uint16Array;
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

export const head = (c: Cut): number => Math.floor(c / SHIFT);
export const tail = (c: Cut): number => c % SHIFT;
export const truncated = (c: Cut): boolean => head(c) < tail(c);
export const toText = (p: Prepared, c: Cut, ellipsis = "…"): string =>
  truncated(c) ? p.text.slice(0, head(c)) + ellipsis + p.text.slice(tail(c)) : p.text;

// A word can end beside white space, a hyphen, a slash, an underscore, a full stop or an
// ellipsis, an en or em dash. From U+2E80 up (CJK, emoji) every character is a word of its own.
const breaks = /[\s\-/_.…–—⺀-￿]/;
// WebKit lays out the text between two break opportunities as a run of its own, so
// kerning across one, after a hyphen, a dash, CJK or an ellipsis, never reaches the
// page there, while Chrome and Firefox keep it. Across a possible break, only kerning
// that widens counts: never narrower than any engine lays it out.
const across = (kerning: number, broken: boolean) => (broken ? Math.max(0, kerning) : kerning);

export const prepare = (
  text: string,
  font: string | Face,
  options: PrepareOptions = {},
): Prepared => {
  const t = text.replace(/[\t\n\f\r ]+/g, " ").replace(/^ | $/g, "");
  const f = typeof font === "string" ? fontFace(font) : font;
  // Below U+0300 every UTF-16 unit is a grapheme (CRLF is gone with the white space),
  // so most text never meets the segmenter. The class is anything from U+0300 up.
  const b = /[^\0-˿]/.test(t)
    ? Array.from((segmenter ??= new Intl.Segmenter()).segment(t), (g) => g.index)
    : Array.from(t, (_, i) => i);
  b.push(t.length);
  const n = b.length - 1;
  const w = new Float64Array(n + 1);
  const d = new Float64Array(n + 1);
  const a = new Float64Array(n);
  let previous = "";
  for (let i = 0; i < n; i++) {
    const g = t.slice(b[i], b[i + 1]);
    // A grapheme adds its own advance plus the kerning from its pair. The step is never
    // below 0, so a binary search stays valid.
    a[i] = widthOf(f, g);
    const kerning = i ? widthOf(f, previous + g) - a[i - 1]! - a[i]! : 0;
    const counted = across(kerning, breaks.test(previous));
    w[i + 1] = w[i]! + Math.max(0, a[i]! + counted);
    d[i + 1] = d[i]! + counted - kerning;
    previous = g;
  }
  const y = n && f.m(t);
  const k = new Uint16Array(t.length + 1);
  let match = 0;
  if (options.protect)
    for (const m of t.matchAll(options.protect)) k.fill(++match, m.index, m.index + m[0].length);
  const p: Internal = { text: t, f, b, w, d, a, x: Math.abs(y - w[n]! + d[n]!) < 0.01, y, k };
  return p;
};

const trims = /[\s,;:]/;

export const cut = (prepared: Prepared, width: number, options: CutOptions = {}): Cut => {
  const { text, f, b, w, d, a, x, y, k } = prepared as Internal;
  const { at = "end", ratio = 0.5, words = true, trim = true, ellipsis = "…" } = options;
  const n = b.length - 1;
  const pack = (h: number, t: number) => (b[h]! * SHIFT + b[t]!) as Cut;
  const room = width - SLACK;
  if (!n || y <= room) return pack(n, n);

  const g = (i: number) => text.slice(b[i], b[i + 1]);
  const total = w[n]!;
  const string = typeof ellipsis === "string";
  const ew = string ? widthOf(f, ellipsis) : ellipsis;
  // The tail alone: its first grapheme's own advance, without the kerning before it.
  const tailWidth = (t: number) => (t < n ? total - w[t + 1]! + a[t]! : 0);
  // The first index in [0, n] where `p` holds, for `p` false then true; n + 1 if never.
  const first = (p: (i: number) => boolean) => {
    let lo = 0;
    let hi = n + 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (p(mid)) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };
  const maxHead = (r: number) => Math.max(0, first((i) => w[i]! > r) - 1);
  const minTail = (r: number) =>
    Math.min(
      n,
      first((i) => tailWidth(i) <= r),
    );
  const isBreak = (i: number) => i === 0 || i === n || breaks.test(g(i - 1)) || breaks.test(g(i));
  // Whether a cut before grapheme `i` falls inside a protected match.
  const inside = (i: number) => k[b[i]!]! > 0 && k[b[i]!] === k[b[i]! - 1];
  const kern = (left: string, right: string) =>
    widthOf(f, left + right) - widthOf(f, left) - widthOf(f, right);

  // How wide a cut paints. When the model matched canvas over the whole text it is
  // trusted; otherwise the cut is measured for real, plus the kerning that a break
  // opportunity drops in WebKit. Either way the kerning beside the ellipsis is added,
  // and the one after it always crosses a break.
  const measure = (h: number, t: number) => {
    let painted = w[h]! + ew + tailWidth(t);
    if (!x) {
      const before = text.slice(0, b[h]);
      const after = text.slice(b[t]);
      painted = string ? f.m(before + ellipsis + after) : f.m(before) + ew + f.m(after);
      painted += d[h]! + (t < n ? d[n]! - d[t + 1]! : 0);
    }
    if (string && h) {
      const kerning = kern(g(h - 1), ellipsis);
      painted += across(kerning, breaks.test(g(h - 1))) - (x ? 0 : kerning);
    }
    if (string && t < n) {
      const kerning = kern(ellipsis, g(t));
      painted += across(kerning, true) - (x ? 0 : kerning);
    }
    return painted;
  };

  // Shrink the cut a grapheme at a time until it fits, from the side that keeps more.
  const shrink = () => {
    while ((h || t < n) && measure(h, t) > room) {
      if (at === "end" || (at === "middle" && h > n - t)) h--;
      else t++;
    }
  };

  // The head keeps graphemes [0, h) and the tail [t, n), in `r` px of text.
  const r = room - ew;
  let h = n;
  let t = n;
  if (at === "start") {
    h = 0;
    t = minTail(r);
  } else if (at === "end") {
    h = maxHead(r);
  } else {
    let fixed = -1;
    if (options.tail !== undefined) fixed = Math.max(0, n - options.tail);
    else if (options.keep !== undefined) {
      fixed = 0;
      while (fixed < n && k[b[fixed]!] !== options.keep + 1) fixed++;
    }
    t =
      fixed >= 0 && fixed < n && tailWidth(fixed) <= r
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
    while (i > 0 && !isBreak(i) && w[h]! - w[i - 1]! <= limit) i--;
    if (isBreak(i)) h = i;
    i = t;
    while (i < n && !isBreak(i) && w[i + 1]! - w[t]! <= limit) i++;
    if (isBreak(i)) t = i;
  }
  while (h > 0 && (inside(h) || (trim && trims.test(g(h - 1))))) h--;
  while (t < n && (inside(t) || (trim && trims.test(g(t))))) t++;
  // Dropping graphemes can widen shaped text, as when a letter loses its joining form.
  shrink();
  return pack(h, t);
};
