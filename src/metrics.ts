import { type Face, face } from "./face.ts";

/**
 * A font's widths, written by `scripts/metrics.ts` from the font file: what a face needs
 * to measure text with no canvas, on a server, in a worker, or before the font loads.
 */
export interface Metrics {
  /** The family it was read from, as CSS names it. */
  readonly family: string;
  readonly unitsPerEm: number;
  /** The characters covered, in order. */
  readonly chars: string;
  /** Each covered character's advance, in font units, in the order of `chars`. */
  readonly advances: ReadonlyArray<number>;
  /** Kerned pairs as triples: first's index in `chars`, second's, adjustment in font units. */
  readonly kerning: ReadonlyArray<number>;
}

// A character the table doesn't cover comes from some fallback font, so it is counted
// wider than any fallback glyph a cut is likely to meet, CJK and emoji included.
const UNKNOWN = 1.5;

interface Decoded {
  readonly advance: Map<number, number>;
  readonly kern: Map<number, number>;
}
const decoded = new WeakMap<Metrics, Decoded>();
const decode = (metrics: Metrics): Decoded => {
  let d = decoded.get(metrics);
  if (!d) {
    const codes = Array.from(metrics.chars, (c) => c.codePointAt(0)!);
    const advance = new Map<number, number>();
    for (let i = 0; i < codes.length; i++) advance.set(codes[i]!, metrics.advances[i]!);
    const kern = new Map<number, number>();
    const k = metrics.kerning;
    for (let i = 0; i < k.length; i += 3) {
      kern.set(codes[k[i]!]! * 0x110000 + codes[k[i + 1]!]!, k[i + 2]!);
    }
    decoded.set(metrics, (d = { advance, kern }));
  }
  return d;
};

/** Measures text in `metrics` at `px` px: each character's advance plus each pair's kerning. */
export const measure = (metrics: Metrics, px: number, text: string): number => {
  const { advance, kern } = decode(metrics);
  const em = metrics.unitsPerEm;
  let units = 0;
  let previous = -1;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    units += advance.get(code) ?? UNKNOWN * em;
    if (previous >= 0) units += kern.get(previous * 0x110000 + code) ?? 0;
    previous = code;
  }
  return (units * px) / em;
};

/** A face that measures with `metrics` at `px` px, for `prepare` with no canvas. */
export const tableFace = (metrics: Metrics, px: number): Face =>
  face((text) => measure(metrics, px, text));

/**
 * A stand-in for `OffscreenCanvas` that measures with tables instead of a font engine,
 * for pretext and `pretrunc/lines` where there is no canvas: install it as
 * `globalThis.OffscreenCanvas` before the first `prepareLines`. The context reads the
 * size and the first family with a table from its `font`, and falls back to the first.
 */
export const tableCanvas = (tables: ReadonlyArray<Metrics>) =>
  class {
    getContext() {
      let px = 16;
      let metrics = tables[0]!;
      return {
        get font() {
          return `${px}px ${metrics.family}`;
        },
        set font(font: string) {
          // `[style] [weight] 15px[/line-height] "Family", fallback`
          const parts = /([\d.]+)px(?:\/\S+)?\s+(.*)$/.exec(font);
          px = Number.parseFloat(parts?.[1] ?? "16");
          metrics = tables[0]!;
          // The first family named that has a table.
          search: for (const family of (parts?.[2] ?? "").split(",")) {
            const name = family.trim().replace(/^["']|["']$/g, "");
            for (const table of tables) {
              if (table.family === name) {
                metrics = table;
                break search;
              }
            }
          }
        },
        measureText: (text: string) => ({ width: measure(metrics, px, text) }),
      };
    }
  };
