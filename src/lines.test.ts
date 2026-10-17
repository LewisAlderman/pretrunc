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

  // Tail starts are found once per text and kept, which must never show.
  it.prop(
    "clamps the same whatever the text was clamped at before",
    [
      text,
      Arbitrary.array(Arbitrary.all([between(40, 300), between(1, 5), at, flag, flag]), {
        minLength: 2,
        maxLength: 6,
      }),
    ],
    ([s, calls]) => {
      const p = prepareLines(s, FONT);
      for (const [width, n, where, words, trim] of calls) {
        const options = { at: where, words, trim };
        const fresh = prepareLines(s, FONT);
        assert.strictEqual(
          clamp(p, width, n, options),
          clamp(fresh, width, n, options),
          JSON.stringify([s, calls]),
        );
      }
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
  // reads as flicker. In the middle the head and the tail share a line, so the two
  // trade: a head that grows can push the tail's start along, and when they wrap as one
  // run a shorter head can let the tail keep more (#90). There a wider box shows no less
  // text, white space and the `,;:` a trimming cut steps over aside, but for part of one
  // word in rare cases where the ellipsis or the tail's first word wraps (#94).
  it.prop(
    "moves each end one way as the width grows, and in the middle never shows less than a word less",
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
      if (where === "middle") {
        const shown = (c: typeof wide) =>
          (p.text.slice(0, head(c)) + p.text.slice(tail(c))).replace(/[\s,;:]/g, "").length;
        let word = 0;
        for (const w of p.text.split(/[\s,;:]+/)) word = Math.max(word, w.length);
        assert.isAtMost(shown(narrow) - word, shown(wide), input);
      } else {
        assert.isAtMost(head(narrow), head(wide), input);
        assert.isAtLeast(tail(narrow), tail(wide), input);
      }
    },
    // Its failures sit at a few widths per text, so it runs more cases than the rest.
    { arbitrary: { runs: 20000 } },
  );
});

describe("clamp examples", () => {
  it("keeps a protected match whole when it runs on past a hard break", () => {
    // The last line's cut sees only "ab", up to the break; the match goes on to "cd".
    const p = prepareLines("ab\ncd ef", FONT, { whiteSpace: "pre-wrap", protect: /[a-d\n]+/g });
    assert.strictEqual(toText(p, clamp(p, 100, 1, { words: false })), "…");
  });

  it("keeps a tail when the ellipsis takes a line of its own (#87)", () => {
    const p = prepareLines("x/y Supercalifragilistic", FONT);
    // At 42 px "…" ends its line, so the word start can't follow it; graphemes can.
    assert.strictEqual(toText(p, clamp(p, 42, 4, { at: "start" })), "…percalifragilistic");
  });

  it("keeps no less in the middle at a wider width, a long word at the junction (#90)", () => {
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
