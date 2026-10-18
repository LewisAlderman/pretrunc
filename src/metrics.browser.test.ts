import interFile from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { assert, beforeAll, describe, it } from "@effect/vitest";
import { Arbitrary, Array, Schema } from "effect";
import inter from "../fixtures/inter-latin.ts";
import { faceOf } from "./face.ts";
import { cut, head, prepare, tail, toText, truncated } from "./index.ts";
import { measure, tableFace } from "./metrics.ts";

// The table is read from the same file the page loads, so a cut made from the table, as
// a server would make it, has to fit the text the browser lays out.
const FONT = '15px "Inter Table"';

let span: HTMLSpanElement;
beforeAll(() => {
  span = document.createElement("span");
  span.style.cssText = `font: ${FONT}; white-space: pre`;
  document.body.append(span);
  const font = new FontFace("Inter Table", `url(${interFile})`);
  document.fonts.add(font);
  return font.load();
});
const paints = (text: string) => {
  span.textContent = text;
  return span.getBoundingClientRect().width;
};

const latin = Arbitrary.map(
  Arbitrary.array(
    Arbitrary.schema(
      Schema.Literals([
        "Ada",
        "Lovelace",
        "AVATAR",
        "Wolfgang",
        "Toyota",
        "office",
        "café",
        "naïve",
        "~/Projects",
        "line-breaker",
        "12:30",
        "(x)",
        " ",
        ",",
        ".",
      ]),
    ),
    { maxLength: 10 },
  ),
  Array.join(""),
);
const share = Arbitrary.map(
  Arbitrary.schema(Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 110 })))),
  (q) => q / 100,
);
const at = Arbitrary.schema(Schema.Literals(["start", "middle", "end"]));
// Chromium on Linux measures some Inter text wider than the table (#3), pinned below.
const linuxChromium = /Linux/.test(navigator.userAgent) && /Chrome\//.test(navigator.userAgent);

describe("metrics in a real engine", () => {
  // Each advance is the widest a character's contextual glyphs take, so the table can
  // be wider than the engine where a neighbour swaps in a narrower glyph, never narrower.
  it.prop(
    "measures Latin text never narrower than this engine's canvas, and within 10%",
    [latin],
    ([s]) => {
      if (linuxChromium) return;
      const table = measure(inter, 15, s);
      const canvas = faceOf(FONT).m(s);
      assert.isAtLeast(table, canvas - 0.05, JSON.stringify(s));
      assert.isAtMost(table, canvas * 1.1 + 0.05, JSON.stringify(s));
    },
    { arbitrary: { runs: 300 } },
  );

  it.prop(
    "cuts from the table never lay out wider than the width",
    [latin, share, at],
    ([s, q, where]) => {
      if (linuxChromium) return;
      const p = prepare(s, tableFace(inter, 15));
      const width = Math.round(paints(p.text) * q * 4) / 4;
      const c = cut(p, width, { at: where });
      if (truncated(c) && head(c) === 0 && tail(c) === p.text.length) return;
      assert.isAtMost(paints(toText(p, c)), width, JSON.stringify([p.text, width, where]));
    },
    { arbitrary: { runs: 300 } },
  );

  (linuxChromium ? it.fails : it)(
    "keeps the table no narrower than Chromium on Linux too (#3)",
    () => {
      assert.isAtLeast(measure(inter, 15, "12:30"), faceOf(FONT).m("12:30") - 0.05);
      const p = prepare("caféline-breaker", tableFace(inter, 15));
      assert.isAtMost(paints(toText(p, cut(p, 99.5, { at: "start" }))), 99.5);
    },
  );
});
