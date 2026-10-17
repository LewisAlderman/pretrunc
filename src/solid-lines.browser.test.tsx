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
});
