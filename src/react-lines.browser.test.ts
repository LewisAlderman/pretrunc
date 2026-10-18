import inter from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { cleanup, render } from "@testing-library/react";
import { afterEach, assert, beforeAll, describe, expect, it } from "@effect/vitest";
import { createElement as h, useState } from "react";
import { page } from "vite-plus/test/browser/context";
import { Clamp } from "./react-lines.ts";

const LINE = 20;
const TEXT =
  "A weekend cabin on the north shore, twenty minutes from the ferry. Sleeps six, with a wood stove, no reception to speak of, and a rowing boat you're welcome to borrow.";

beforeAll(() => {
  const font = new FontFace("Inter React Clamp", `url(${inter})`);
  document.fonts.add(font);
  return font.load();
});
afterEach(() => cleanup());

const lines = (element: Element) => Math.round(element.getBoundingClientRect().height / LINE);

function Expandable() {
  const [open, setOpen] = useState(false);
  return h(
    "div",
    { style: { width: "220px", font: '15px "Inter React Clamp"', lineHeight: `${LINE}px` } },
    h(Clamp, {
      text: TEXT,
      lines: 3,
      expanded: open,
      after: h(
        "button",
        { type: "button", onClick: () => setOpen((o) => !o) },
        open ? "less" : "more",
      ),
    }),
  );
}

describe("Clamp", () => {
  it("keeps three lines with room for its button, and shows every line once expanded", async () => {
    render(h(Expandable));
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

  it("cuts again as its box narrows", async () => {
    const row = (width: number) =>
      h(
        "div",
        {
          style: { width: `${width}px`, font: '15px "Inter React Clamp"', lineHeight: `${LINE}px` },
        },
        h(Clamp, { text: TEXT, lines: 2, at: "middle" }),
      );
    const { rerender, container } = render(row(400));
    const paragraph = () => container.querySelector("div > div")!;
    await expect.poll(() => paragraph().textContent).toContain("…");
    const wide = paragraph().textContent!;
    rerender(row(200));
    await expect.poll(() => paragraph().textContent).not.toBe(wide);
    assert.isBelow(paragraph().textContent!.length, wide.length);
    assert.isAtMost(lines(paragraph()), 2);
  });
});
