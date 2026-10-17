import { layout, prepareWithSegments } from "@chenglou/pretext";
import { assert, describe, it } from "@effect/vitest";
import { Arbitrary, Array, Schema } from "effect";
import { head, tail, toText, truncated } from "./cut.ts";
import { clamp, lessFits, prepareLines } from "./lines.ts";

// pretext and the core both measure through OffscreenCanvas, so one fake canvas with
// known widths stands in for the browser in Node: each code unit 7 px, capitals 10.
const widthOf = (s: string) => {
  let w = 0;
  for (const c of s) w += c === " " ? 4 : c >= "A" && c <= "Z" ? 10 : c === "…" ? 12 : 7;
  return w;
};
globalThis.OffscreenCanvas = class {
  getContext() {
    return { font: "", measureText: (s: string) => ({ width: widthOf(s) }) };
  }
} as unknown as typeof OffscreenCanvas;

const FONT = "16px Fake";
const lineCount = (text: string, width: number) =>
  layout(prepareWithSegments(text, FONT), width, 1).lineCount;

const word = Arbitrary.schema(
  Schema.Literals([
    "a",
    "lot",
    "of",
    "words",
    "Supercalifragilistic",
    "re-entry",
    "x/y",
    "Ada",
    ",",
  ]),
);
const text = Arbitrary.map(Arbitrary.array(word, { maxLength: 40 }), Array.join(" "));
const between = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum, maximum }))));
const at = Arbitrary.schema(Schema.Literals(["start", "middle", "end"]));
const flag = Arbitrary.schema(Schema.Boolean);
const runs = { arbitrary: { runs: 300 } };

describe("clamp", () => {
  it.prop(
    "never takes more lines than asked",
    [text, between(40, 300), between(1, 5), at, flag],
    ([s, width, n, where, words]) => {
      const p = prepareLines(s, FONT);
      const c = clamp(p, width, n, { at: where, words });
      assert.isAtMost(lineCount(toText(p, c), width), n, JSON.stringify([p.text, width, n, where]));
    },
    runs,
  );

  it.prop(
    "gives back text that fits whole, untouched",
    [text, between(40, 300), between(1, 5), at],
    ([s, width, n, where]) => {
      const p = prepareLines(s, FONT);
      const c = clamp(p, width, n, { at: where });
      assert.strictEqual(truncated(c), lineCount(p.text, width) > n);
    },
    runs,
  );

  it.prop(
    "fills every line at the end: one more grapheme runs over",
    [text, between(40, 300), between(1, 5)],
    ([s, width, n]) => {
      const p = prepareLines(s, FONT);
      const c = clamp(p, width, n, { words: false, trim: false });
      if (!truncated(c)) return;
      const input = JSON.stringify([p.text, width, n, toText(p, c)]);
      assert.isAtLeast(lineCount(p.text.slice(0, head(c)), width), n - 1, input);
      // The cut leaves 1/64 px for engines that round a run's width up.
      assert.isAbove(lineCount(p.text.slice(0, head(c) + 1) + "…", width - 1 / 64), n, input);
    },
    runs,
  );

  it.prop(
    "starts the tail as early as fits: one grapheme earlier runs over",
    [text, between(40, 300), between(1, 5), Arbitrary.schema(Schema.Literals(["start", "middle"]))],
    ([s, width, n, where]) => {
      const p = prepareLines(s, FONT);
      const c = clamp(p, width, n, { at: where, words: false, trim: false });
      if (!truncated(c) || tail(c) <= head(c) + 1) return;
      const earlier = p.text.slice(0, head(c)) + "…" + p.text.slice(tail(c) - 1);
      assert.isAbove(
        lineCount(earlier, width - 1 / 64),
        n,
        JSON.stringify([p.text, width, n, where]),
      );
    },
    runs,
  );

  it.prop(
    "keeps the head before the tail in a middle cut",
    [text, between(40, 300), between(1, 5)],
    ([s, width, n]) => {
      const p = prepareLines(s, FONT);
      const c = clamp(p, width, n, { at: "middle" });
      assert.isAtMost(head(c), tail(c));
    },
    runs,
  );
});

describe("lessFits", () => {
  it("says whether a link fits after the last line", () => {
    // "Ada lot" is 49 px, one line at 60 px, leaving 11 px.
    const p = prepareLines("Ada lot", FONT);
    assert.isTrue(lessFits(p, 60, 11));
    assert.isFalse(lessFits(p, 60, 12));
  });
});
