import inter from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { assert, beforeAll, describe, it } from "@effect/vitest";
import { Arbitrary, Array, Schema } from "effect";
import { toText } from "./cut.ts";
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
});
