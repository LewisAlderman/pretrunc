/** Measures text in one font. Canvas by default; a metrics table can stand in (sprint-poker#54). */
export interface Face {
  /** The width of a string in px, as one run of text. */
  readonly m: (text: string) => number;
  /** Widths already measured, by text: graphemes, grapheme pairs, words and ellipses. */
  readonly c: Map<string, number>;
  /** Widths of single characters below U+0300 by code, NaN until measured. */
  readonly u: Float64Array;
  /** Widths of pairs of characters below U+0300, by `first * 768 + second`. */
  readonly p: Map<number, number>;
  /** Widths of pairs of ASCII characters, by `first * 128 + second`, NaN until measured. */
  readonly q: Float64Array;
  /**
   * Kerning beside each ellipsis, by ellipsis: `[code]` between a character below U+0300
   * and the ellipsis after it, `[768 + code]` between the ellipsis and the character.
   * Shared by every text in the face. NaN until measured.
   */
  readonly e: Map<string, Float64Array>;
}

/** A face over your own measure function: a metrics table, node-canvas, a test double. */
export const face = (measure: (text: string) => number): Face => ({
  m: measure,
  c: new Map(),
  u: new Float64Array(768).fill(Number.NaN),
  p: new Map(),
  q: new Float64Array(16384).fill(Number.NaN),
  e: new Map(),
});

let context: OffscreenCanvasRenderingContext2D | undefined;
// Setting `font` parses it every time, and reading it back gives a normalised string
// that differs from what was set, so the last font set is kept here instead.
let current = "";
const faces = new Map<string, Face>();

/** The canvas face for a CSS font shorthand, shared by everything in that font. */
export const fontFace = (font: string): Face => {
  let f = faces.get(font);
  if (!f) {
    f = face((text) => {
      context ??= new OffscreenCanvas(0, 0).getContext("2d")!;
      if (current !== font) context.font = current = font;
      return context.measureText(text).width;
    });
    faces.set(font, f);
  }
  return f;
};

/**
 * Drops the canvas face for `font`, or every one, so text prepared afterwards is
 * measured again. Call it once a web font loads: widths measured before are the
 * fallback font's.
 */
export const forget = (font?: string): void => {
  if (font === undefined) faces.clear();
  else faces.delete(font);
};

/** The width of `text` in `f`, measured once. */
export const widthOf = (f: Face, text: string): number => {
  let w = f.c.get(text);
  if (w === undefined) f.c.set(text, (w = f.m(text)));
  return w;
};

// Most text is in characters below U+0300, one UTF-16 unit each, so their widths are
// found by code: no string is built unless one has to be measured.
export const unitOf = (f: Face, code: number): number => {
  let w = f.u[code]!;
  // NaN, not yet measured.
  if (w !== w) f.u[code] = w = f.m(String.fromCharCode(code));
  return w;
};
export const pairOf = (f: Face, first: number, second: number): number => {
  // ASCII pairs, most of most text, come from a flat table, the rest from a map.
  if (first < 128 && second < 128) {
    const key = first * 128 + second;
    let w = f.q[key]!;
    if (w !== w) f.q[key] = w = f.m(String.fromCharCode(first, second));
    return w;
  }
  const key = first * 768 + second;
  let w = f.p.get(key);
  if (w === undefined) f.p.set(key, (w = f.m(String.fromCharCode(first, second))));
  return w;
};
