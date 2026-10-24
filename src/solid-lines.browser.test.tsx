import inter from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, assert, beforeAll, describe, expect, it } from "@effect/vitest";
import { createSignal } from "solid-js";
import { page } from "vite-plus/test/browser/context";
import { Clamp } from "./solid-lines.tsx";

const LINE = 20;
const TEXT =
  "A weekend cabin on the north shore, twenty minutes from the ferry. Sleeps six, with a wood stove, no reception to speak of, and a rowing boat you're welcome to borrow.";

beforeAll(() => {
  const font = new FontFace("Inter Clamp", `url(${inter})`);
  document.fonts.add(font);
  return font.load();
});
afterEach(() => cleanup());

const ARABIC =
  "محمد عبد الرحمن بن عبد العزيز، من مدينة الرياض، يكتب عن السفر والطعام والكتب التي يقرأها كل شهر.";

// The ellipsis's box and the grapheme's before it, in the element's first text node.
const besideEllipsis = (element: Element) => {
  const node = element.firstChild as Text;
  const at = node.data.indexOf("…");
  const range = document.createRange();
  range.setStart(node, at);
  range.setEnd(node, at + 1);
  const ellipsis = range.getBoundingClientRect();
  range.setStart(node, at - 1);
  range.setEnd(node, at);
  return { ellipsis, before: range.getBoundingClientRect() };
};

const lines = (element: Element) => Math.round(element.getBoundingClientRect().height / LINE);

describe("Clamp", () => {
  it("keeps three lines with room for its button, and shows every line once expanded", async () => {
    const [open, setOpen] = createSignal(false);
    render(() => (
      <div style={{ width: "220px", font: '15px "Inter Clamp"', "line-height": `${LINE}px` }}>
        <Clamp
          text={TEXT}
          lines={3}
          expanded={open()}
          after={
            <button type="button" onClick={() => setOpen((o) => !o)}>
              {open() ? "less" : "more"}
            </button>
          }
        />
      </div>
    ));
    const more = page.getByRole("button", { name: "more" });
    await expect.element(more).toBeInTheDocument();
    const paragraph = more.element().closest("div")!;
    await expect.poll(() => lines(paragraph)).toBe(3);
    assert.include(paragraph.textContent, "…");

    await more.click();
    await expect.element(page.getByRole("button", { name: "less" })).toBeInTheDocument();
    assert.include(paragraph.textContent, TEXT);
    assert.isAbove(lines(paragraph), 3);
  });

  it("ends right-to-left text with the ellipsis on its left in a left-to-right page, with dir auto", async () => {
    render(() => (
      <div style={{ width: "220px", font: '15px "Inter Clamp"', "line-height": `${LINE}px` }}>
        <Clamp text={ARABIC} lines={2} dir="auto" class="arabic" />
      </div>
    ));
    await expect.poll(() => document.querySelector(".arabic")?.textContent).toContain("…");
    const { ellipsis, before } = besideEllipsis(document.querySelector(".arabic")!);
    // Centres, since WebKit snaps a range inside a joined word to whole pixels.
    assert.isBelow(ellipsis.left + ellipsis.right, before.left + before.right);
  });
});
