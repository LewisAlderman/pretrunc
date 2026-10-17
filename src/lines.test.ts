import { layout, prepareWithSegments } from "@chenglou/pretext";
import { measureRichInlineStats, prepareRichInline } from "@chenglou/pretext/rich-inline";
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
    "starts a start clamp's tail as early as fits: one grapheme earlier runs over",
    [text, between(40, 300), between(1, 5), Arbitrary.schema(Schema.Literals(["start"]))],
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

  // A drag moves the width a pixel at a time; a clamp whose ends jump one way and back
  // reads as flicker. In the middle the head and the tail share a line, and a head
  // that grows within its share can push the tail's first word to the next line, so
  // there the tail may give up what the head gains, never more. With word preference
  // the tail starts only at words, so it gives up a whole one at a time. A long word
  // that wraps letter by letter across the junction can cost the tail more than the
  // head gained (#90), so giving up part of one word passes too.
  it.prop(
    "moves each end one way as the width grows: the head never gives up, nor the tail",
    [
      text,
      between(40, 300),
      Arbitrary.schema(Schema.Literals([0.25, 1, 3, 12])),
      between(1, 5),
      at,
      flag,
    ],
    ([s, width, step, n, where, words]) => {
      const p = prepareLines(s, FONT);
      const narrow = clamp(p, width, n, { at: where, words });
      const wide = clamp(p, width + step, n, { at: where, words });
      if (!truncated(wide)) return;
      const input = JSON.stringify([p.text, width, step, n, where, words]);
      assert.isAtMost(head(narrow), head(wide), input);
      if (where === "middle") {
        const gained = head(wide) - head(narrow);
        const dropped = p.text.slice(tail(narrow), tail(wide));
        const oneWord = !/\S\s+\S/.test(dropped.trim());
        assert.isTrue(dropped.length <= gained || oneWord, input);
      } else assert.isAtLeast(tail(narrow), tail(wide), input);
    },
    // Its failures sit at a few widths per text, so it runs more cases than the rest.
    { arbitrary: { runs: 20000 } },
  );
});

describe("clamp examples", () => {
  it("keeps a tail when the ellipsis takes a line of its own (#87)", () => {
    const p = prepareLines("x/y Supercalifragilistic", FONT);
    // At 42 px "…" ends its line, so the word start can't follow it; graphemes can.
    assert.strictEqual(toText(p, clamp(p, 42, 4, { at: "start" })), "…percalifragilistic");
  });

  it.fails("keeps no less in the middle at a wider width, a long word at the junction (#90)", () => {
    const p = prepareLines("Ada a re-entry Supercalifragilistic , lot Ada re-entry", FONT);
    const kept = (width: number) => {
      const c = clamp(p, width, 5, { at: "middle", words: false });
      return head(c) + p.text.length - tail(c);
    };
    // At 91 px the head gains "c" and the tail loses "frag".
    assert.isAtLeast(kept(91), kept(90));
  });
});

describe("clamp with every option", () => {
  // Hard breaks, runs of spaces and tabs, for pre-wrap; normal collapses them.
  const gap = Arbitrary.schema(Schema.Literals([" ", " ", " ", "  ", "\n", "\t"]));
  const spaced = Arbitrary.map(
    Arbitrary.array(Arbitrary.all([word, gap]), { maxLength: 30 }),
    (pairs) =>
      Array.join(
        Array.map(pairs, ([w, g]) => w + g),
        "",
      ),
  );
  const whiteSpace = Arbitrary.schema(Schema.Literals(["normal", "pre-wrap"]));
  const spacing = Arbitrary.schema(Schema.Literals([0, 1]));
  const ellipsis = Arbitrary.schema(Schema.Literals(["…", 15]));
  const after = Arbitrary.schema(Schema.Literals([0, 20]));

  it.prop(
    "never takes more lines than asked, the ellipsis and the room after laid out as boxes",
    [spaced, between(40, 300), between(1, 5), at, flag, whiteSpace, spacing, ellipsis, after],
    ([s, width, n, where, words, ws, by, e, room]) => {
      const p = prepareLines(s, FONT, { whiteSpace: ws, letterSpacing: by });
      const c = clamp(p, width, n, { at: where, words, ellipsis: e, after: room });
      const item = (text: string) => ({ text, font: FONT, letterSpacing: by });
      // A clamp that cuts nothing shows no "more", so nothing comes after it.
      const items = truncated(c)
        ? [
            item(p.text.slice(0, head(c))),
            typeof e === "string" ? item(e) : { width: e },
            item(p.text.slice(tail(c))),
            ...(room ? [{ width: room }] : []),
          ]
        : [item(p.text)];
      const laid = prepareRichInline(
        Array.filter(items, (i) => !("text" in i) || i.text !== ""),
        { whiteSpace: ws },
      );
      const input = JSON.stringify([p.text, width, n, where, words, ws, by, e, room]);
      assert.isAtMost(measureRichInlineStats(laid, width).lineCount, n, input);
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
