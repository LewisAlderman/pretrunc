import inter from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { assert, beforeAll, describe, it } from "@effect/vitest";
import { Arbitrary, Array, Schema } from "effect";
import {
  cut,
  type Cut,
  face,
  fontFace,
  head,
  prepare,
  type Prepared,
  tail,
  toText,
  truncated,
} from "./index.ts";

// Inter's latin file, so widths don't depend on the machine's fonts. Other scripts fall
// back to system fonts, the same way in canvas and in the DOM.
const FONT = '15px "Inter Test"';

let span: HTMLSpanElement;
beforeAll(() => {
  span = document.createElement("span");
  span.style.font = FONT;
  span.style.whiteSpace = "pre";
  document.body.append(span);
  const font = new FontFace("Inter Test", `url(${inter})`);
  document.fonts.add(font);
  return font.load();
});

// The width the engine lays the text out at, which is what has to fit.
const paints = (text: string, spacing = 0) => {
  span.style.letterSpacing = `${spacing}px`;
  span.textContent = text;
  return span.getBoundingClientRect().width;
};

const latin = [
  "Ada",
  "Lovelace",
  "Alexandra",
  "Richardson",
  "Wolfgang",
  "AVATAR",
  "Toyota",
  "office",
  "fluffy",
  "~/Projects",
  "/src/",
  "layout.ts",
  "line-breaker",
  "WAVE",
  "To",
  " ",
  " ",
  ",",
  ".",
  "café",
  "naïve",
];
const world = [
  ...latin,
  "é", // e and a combining acute: two units, one grapheme
  "😀",
  "👍🏽",
  "🇬🇧",
  "中文",
  "日本語",
  "مرحبا",
  " بالعالم",
  "हिन्दी",
  "ไทย",
];
const textOf = (pieces: ReadonlyArray<string>) =>
  Arbitrary.map(
    Arbitrary.array(Arbitrary.schema(Schema.Literals(pieces)), { maxLength: 12 }),
    Array.join(""),
  );
const share = Arbitrary.map(
  Arbitrary.schema(Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 110 })))),
  (q) => q / 100,
);
const at = Arbitrary.schema(Schema.Literals(["start", "middle", "end"]));
const flag = Arbitrary.schema(Schema.Boolean);
const ellipsis = Arbitrary.schema(Schema.Literals(["…", "...", " … "]));
const runs = { arbitrary: { runs: 300 } };

const widthFor = (p: Prepared, q: number) => Math.round(paints(p.text) * q * 4) / 4;
const kept = (p: Prepared, c: Cut) => head(c) + p.text.length - tail(c);

describe("cut in a real engine", () => {
  it.prop(
    "never lays out wider than the width",
    [
      textOf(world),
      share,
      at,
      flag,
      flag,
      ellipsis,
      Arbitrary.schema(Schema.Literals([0, 0, 0.5, 2])),
    ],
    ([s, q, where, words, trim, e, spacing]) => {
      const p = prepare(s, FONT, { letterSpacing: spacing });
      const width = widthFor(p, q);
      const c = cut(p, width, { at: where, words, trim, ellipsis: e });
      if (!truncated(c) || kept(p, c) > 0) {
        const input = JSON.stringify([p.text, width, where, e, spacing]);
        assert.isAtMost(paints(toText(p, c, e), spacing), width, input);
      }
    },
    runs,
  );

  it.prop(
    "keeps Latin text to within one grapheme of the widest cut that fits",
    [textOf(latin), share, Arbitrary.schema(Schema.Literals(["start", "end"]))],
    ([s, q, where]) => {
      const p = prepare(s, FONT);
      const width = widthFor(p, q);
      const c = cut(p, width, { at: where, words: false, trim: false });
      if (!truncated(c)) return;
      // Two more graphemes, Latin text here being one unit per grapheme.
      const wider =
        where === "end"
          ? p.text.slice(0, head(c) + 2) + "…"
          : "…" + p.text.slice(Math.max(0, tail(c) - 2));
      if (wider.length - 1 < p.text.length) {
        assert.isAbove(paints(wider), width, JSON.stringify([p.text, width, where]));
      }
    },
    runs,
  );

  it.prop(
    "cuts Latin text in Inter from cached widths, measuring nothing once warm",
    [textOf(latin), at],
    ([s, where]) => {
      const canvas = fontFace(FONT);
      let calls = 0;
      const counted = face((text) => {
        calls++;
        return canvas.m(text);
      });
      const p = prepare(s, counted);
      const full = canvas.m(p.text);
      const widths = Array.map([0.2, 0.4, 0.6, 0.8], (q) => Math.round(full * q));
      for (const width of widths) cut(p, width, { at: where });
      calls = 0;
      for (const width of widths) cut(p, width, { at: where });
      assert.strictEqual(calls, 0, JSON.stringify(p.text));
    },
    { arbitrary: { runs: 100 } },
  );
});
