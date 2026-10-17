import inter from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { assert, beforeAll, describe, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import { Arbitrary, Array, Schema } from "effect";
import { head, tail, toText, truncated } from "./cut.ts";
import { clamp, prepareLines } from "./lines.ts";

const FONT = '15px "Inter Lines"';
const LINE = 20;

let block: HTMLDivElement;
beforeAll(() => {
  block = document.createElement("div");
  block.style.font = FONT;
  block.style.lineHeight = `${LINE}px`;
  block.style.overflowWrap = "break-word";
  document.body.append(block);
  const font = new FontFace("Inter Lines", `url(${inter})`);
  document.fonts.add(font);
  return font.load();
});

// How many lines the engine wraps the text to at `width`.
const wraps = (text: string, width: number) => {
  block.style.width = `${width}px`;
  block.textContent = text;
  return Math.round(block.getBoundingClientRect().height / LINE);
};

const word = Arbitrary.schema(
  Schema.Literals([
    "planning",
    "poker",
    "estimate",
    "the",
    "a",
    "of",
    "re-entry",
    "Supercalifragilistic",
    "~/Projects/atlas/src",
    "AVATAR",
    "office",
    "naïve",
    "😀",
    "中文",
    "مرحبا",
    ",",
    ".",
  ]),
);
const text = Arbitrary.map(Arbitrary.array(word, { maxLength: 40 }), Array.join(" "));
// Words the model can trust in Inter: no emoji, CJK or joined script, which are measured.
const latinWord = Arbitrary.schema(
  Schema.Literals([
    "planning",
    "poker",
    "estimate",
    "the",
    "a",
    "of",
    "re-entry",
    "Supercalifragilistic",
    "~/Projects/atlas/src",
    "AVATAR",
    "office",
    "naïve",
    ",",
    ".",
  ]),
);
const latin = Arbitrary.map(Arbitrary.array(latinWord, { maxLength: 40 }), Array.join(" "));
const between = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum, maximum }))));
const at = Arbitrary.schema(Schema.Literals(["start", "middle", "end"]));
const flag = Arbitrary.schema(Schema.Boolean);

describe("clamp in a real engine", () => {
  it.prop(
    "never wraps to more lines than asked",
    [text, between(60, 400), between(1, 4), at, flag],
    ([s, width, n, where, words]) => {
      const p = prepareLines(s, FONT);
      const c = clamp(p, width, n, { at: where, words });
      assert.isAtMost(
        wraps(toText(p, c), width),
        n,
        JSON.stringify([p.text, width, n, where, words]),
      );
    },
    { arbitrary: { runs: 200 } },
  );

  const gap = Arbitrary.schema(Schema.Literals([" ", " ", " ", "  ", "\n", "\t"]));
  const spaced = Arbitrary.map(
    Arbitrary.array(Arbitrary.all([word, gap]), { maxLength: 30 }),
    (pairs) =>
      Array.join(
        Array.map(pairs, ([w, g]) => w + g),
        "",
      ),
  );
  // An inline-block of `width` px, as an element the caller renders would be.
  const box = (width: number) => {
    const element = document.createElement("span");
    element.style.cssText = `display: inline-block; width: ${width}px; height: 1px`;
    return element;
  };
  // How many lines the engine wraps a clamp's result to, boxes and all.
  const wrapsTo = (
    s: string,
    width: number,
    n: number,
    at: "start" | "middle" | "end",
    words: boolean,
    whiteSpace: "normal" | "pre-wrap",
    spacing: number,
    e: string | number,
    after: number,
  ) => {
    const p = prepareLines(s, FONT, { whiteSpace, letterSpacing: spacing });
    const c = clamp(p, width, n, { at, words, ellipsis: e, after });
    block.style.width = `${width}px`;
    block.style.whiteSpace = whiteSpace;
    block.style.letterSpacing = `${spacing}px`;
    // Rendered as the components render it: a text ellipsis in one string with the
    // text, since WebKit lays separate text nodes out as separate runs; a width-only
    // ellipsis and the room after as elements. A clamp that cuts nothing shows no
    // "more", so nothing comes after it.
    if (truncated(c)) {
      const before = p.text.slice(0, head(c));
      const rest = p.text.slice(tail(c));
      block.replaceChildren(
        ...(typeof e === "string" ? [before + e + rest] : [before, box(e), rest]),
        ...(after ? [box(after)] : []),
      );
    } else block.replaceChildren(p.text);
    const lines = Math.round(block.getBoundingClientRect().height / LINE);
    block.style.whiteSpace = "";
    block.style.letterSpacing = "";
    return lines;
  };

  it.prop(
    "never wraps to more lines than asked, with pre-wrap, letter spacing and boxes",
    [
      spaced,
      between(60, 400),
      between(1, 4),
      at,
      flag,
      Arbitrary.schema(Schema.Literals(["normal", "pre-wrap"])),
      Arbitrary.schema(Schema.Literals([0, 1])),
      Arbitrary.schema(Schema.Literals(["…", 15])),
      Arbitrary.schema(Schema.Literals([0, 30])),
    ],
    (input) => {
      assert.isAtMost(wrapsTo(...input), input[2], JSON.stringify(input));
    },
    { arbitrary: { runs: 300 } },
  );

  it.prop(
    "clamps Latin text again from cached widths, measuring nothing once warm",
    [latin, at],
    ([s, where]) => {
      const p = prepareLines(s, FONT);
      const widths = [180, 240, 320];
      for (const width of widths) clamp(p, width, 2, { at: where });
      let calls = -1;
      const measured = vi.spyOn(OffscreenCanvasRenderingContext2D.prototype, "measureText");
      try {
        for (const width of widths) clamp(p, width, 2, { at: where });
        calls = measured.mock.calls.length;
      } finally {
        measured.mockRestore();
      }
      assert.strictEqual(calls, 0, JSON.stringify([s, where]));
    },
    { arbitrary: { runs: 50 } },
  );

  it("keeps tabbed pre-wrap text to its lines when a tab under half a ch from its stop takes the next (sprint-poker#76)", () => {
    const beside = "中文\t~/Projects/atlas/src  poker\t~/Projects/atlas/src  ";
    const arabic = "مرحبا\t,\tمرحبا\nnaïve ";
    assert.isAtMost(wrapsTo(beside, 143, 3, "middle", false, "pre-wrap", 0, "…", 30), 3);
    assert.isAtMost(wrapsTo(arabic, 97, 2, "start", false, "pre-wrap", 0, 15, 0), 2);
  });
});
