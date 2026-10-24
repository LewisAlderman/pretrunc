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

  it("ends right-to-left text with the ellipsis on its left in a left-to-right page, with dir auto", async () => {
    render(
      h(
        "div",
        { style: { width: "220px", font: '15px "Inter React Clamp"', lineHeight: `${LINE}px` } },
        h(Clamp, { text: ARABIC, lines: 2, dir: "auto", className: "arabic" }),
      ),
    );
    await expect.poll(() => document.querySelector(".arabic")?.textContent).toContain("…");
    const { ellipsis, before } = besideEllipsis(document.querySelector(".arabic")!);
    // Centres, since WebKit snaps a range inside a joined word to whole pixels.
    assert.isBelow(ellipsis.left + ellipsis.right, before.left + before.right);
  });

  it("sets no dir unless given, so existing callers lay out as before", async () => {
    render(
      h(
        "div",
        { style: { width: "220px", font: '15px "Inter React Clamp"', lineHeight: `${LINE}px` } },
        h(Clamp, { text: ARABIC, lines: 2, className: "arabic" }),
      ),
    );
    await expect.poll(() => document.querySelector(".arabic")?.textContent).toContain("…");
    assert.isNull(document.querySelector(".arabic")!.getAttribute("dir"));
  });
});
