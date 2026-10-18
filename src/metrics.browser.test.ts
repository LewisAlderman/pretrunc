import interFile from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { assert, beforeAll, describe, it } from "@effect/vitest";
import { Arbitrary, Array, Schema } from "effect";
import inter from "../fixtures/inter-latin.ts";
import { cut, head, prepare, tail, toText, truncated } from "./index.ts";
import { measure, tableFace } from "./metrics.ts";

// The table is read from the same file the page loads, so a cut made from the table, as
// a server would make it, has to fit the text the browser lays out.
const FONT = '15px "Inter Table"';

// Chromium on Linux lays each glyph on a whole pixel unless the text asks for geometric
// precision, so a table-made cut needs it there (#3). These checks ask for it in every
// engine, in layout and in canvas.
const canvas = new OffscreenCanvas(0, 0).getContext("2d")!;
canvas.font = FONT;
canvas.textRendering = "geometricPrecision";
const measured = (text: string) => canvas.measureText(text).width;

let span: HTMLSpanElement;
beforeAll(() => {
  span = document.createElement("span");
  span.style.cssText = `font: ${FONT}; white-space: pre; text-rendering: geometricPrecision`;
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
    { maxLength: 40 },
  ),
  Array.join(""),
);
const share = Arbitrary.map(
  Arbitrary.schema(Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 110 })))),
  (q) => q / 100,
);
const at = Arbitrary.schema(Schema.Literals(["start", "middle", "end"]));

describe("metrics in a real engine", () => {
  // Each advance is the widest a character's contextual glyphs take, so the table can
  // be wider than the engine where a neighbour swaps in a narrower glyph, never narrower.
  it.prop(
    "measures Latin text never narrower than this engine's canvas, and within 10%",
    [latin],
    ([s]) => {
      const table = measure(inter, 15, s);
      const engine = measured(s);
      assert.isAtLeast(table, engine - 0.001, JSON.stringify(s));
      assert.isAtMost(table, engine * 1.1 + 0.05, JSON.stringify(s));
    },
    { arbitrary: { runs: 300 } },
  );

  it("measures a long line no narrower than this engine, though Firefox rounds each glyph (#5)", () => {
    // Most of these glyphs round up to Firefox's 1/60 px: 0.4 px over the line, summed exactly.
    const s = "Wolfgangline-breakerToyotaToyotaToyotaoffice".repeat(8);
    assert.isAtLeast(measure(inter, 15, s), measured(s) - 0.001);
    assert.isAtLeast(measure(inter, 15, s), paints(s) - 0.001);
  });

  it.prop(
    "cuts from the table never lay out wider than the width",
    [latin, share, at],
    ([s, q, where]) => {
      const p = prepare(s, tableFace(inter, 15));
      const width = Math.round(paints(p.text) * q * 4) / 4;
      const c = cut(p, width, { at: where });
      if (truncated(c) && head(c) === 0 && tail(c) === p.text.length) return;
      assert.isAtMost(paints(toText(p, c)), width, JSON.stringify([p.text, width, where]));
    },
    { arbitrary: { runs: 300 } },
  );

  // Without geometric precision, Chromium on Linux lays both out wider than the table.
  it("measures a colon between digits and cuts an accented word within this engine (#3)", () => {
    assert.isAtLeast(measure(inter, 15, "12:30"), measured("12:30") - 0.05);
    const p = prepare("caféline-breaker", tableFace(inter, 15));
    assert.isAtMost(paints(toText(p, cut(p, 99.5, { at: "start" }))), 99.5);
  });
});
