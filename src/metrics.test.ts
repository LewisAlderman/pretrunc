import { layout, prepareWithSegments } from "@chenglou/pretext";
import { assert, describe, it } from "@effect/vitest";
import { Arbitrary, Array, Schema } from "effect";
import * as fontkit from "fontkit";
import { createRequire } from "node:module";
import inter from "../fixtures/inter-latin.ts";
import { readMetrics } from "../scripts/metrics.ts";
import { cut, prepare, toText, truncated } from "./cut.ts";
import { clamp, prepareLines } from "./lines.ts";
import { measure, tableCanvas, tableFace } from "./metrics.ts";

// oxlint-disable-next-line effecttsgo/node-builtin-import -- finds the font file in node_modules for the build tool
const file = createRequire(import.meta.url).resolve(
  "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
);
const font = fontkit.openSync(file) as fontkit.Font;
const laidOut = (text: string, px: number) =>
  (Array.reduce(font.layout(text).positions, 0, (sum, p) => sum + p.xAdvance) * px) /
  font.unitsPerEm;

const CHARS = "AVTWoaeyr.,-… ";
const small = readMetrics(file, "Inter Variable", CHARS);
const text = (chars: string, max: number) =>
  Arbitrary.map(
    Arbitrary.array(Arbitrary.schema(Schema.Literals(Array.fromIterable(chars))), {
      maxLength: max,
    }),
    Array.join(""),
  );

describe("metrics", () => {
  it.prop(
    "never measures narrower than fontkit lays the font out",
    [text(CHARS, 20)],
    ([s]) => {
      // fontkit's layout of a whole string is the reference; the table holds pairs,
      // with each advance widened for what its neighbours can add.
      assert.isAtLeast(measure(small, 15, s), laidOut(s, 15) - 0.01, JSON.stringify(s));
    },
    { arbitrary: { runs: 300 } },
  );

  it("counts a character the table doesn't cover wider than any fallback glyph", () => {
    assert.strictEqual(measure(small, 10, "中"), 15);
  });

  it("cuts text where there is no canvas", () => {
    const p = prepare("Alexandra Richardson-Featherstonehaugh", tableFace(inter, 16));
    const c = cut(p, 120, { at: "middle" });
    assert.isTrue(truncated(c));
    assert.isAtMost(measure(inter, 16, toText(p, c)), 120);
  });

  it("clamps text through pretext where there is no canvas, given the table canvas", () => {
    const canvas = globalThis.OffscreenCanvas;
    globalThis.OffscreenCanvas = tableCanvas([inter]) as unknown as typeof OffscreenCanvas;
    try {
      const FONT = '16px "Inter Variable"';
      const words = Array.join(
        Array.makeBy(40, (i) => `word${i}`),
        " ",
      );
      const p = prepareLines(words, FONT);
      const c = clamp(p, 200, { lines: 3 });
      assert.isTrue(truncated(c));
      assert.isAtMost(layout(prepareWithSegments(toText(p, c), FONT), 200, 1).lineCount, 3);
    } finally {
      globalThis.OffscreenCanvas = canvas;
    }
  });
});
