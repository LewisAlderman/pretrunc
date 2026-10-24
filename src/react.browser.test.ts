import inter from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { cleanup, render } from "@testing-library/react";
import { afterEach, assert, beforeAll, describe, expect, it } from "@effect/vitest";
import { Array, Effect } from "effect";
import { createElement as h, Profiler, type ReactNode } from "react";
import { vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";
import { cut, prepare } from "./cut.ts";
import { faceOf } from "./face.ts";
import { FontProvider, Truncate, useCut } from "./react.ts";

const FAMILY = "Inter React";
const NAME = "Alexandra Richardson-Featherstonehaugh";
const ARABIC = "محمد عبد الرحمن";

beforeAll(() => {
  const font = new FontFace(FAMILY, `url(${inter})`);
  document.fonts.add(font);
  return font.load();
});
afterEach(() => cleanup());

// How wide the element's contents lay out, ellipsis and collapsed text included.
const laidOut = (element: Element) => {
  const range = document.createRange();
  range.selectNodeContents(element);
  return range.getBoundingClientRect().width;
};

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

const Box = (props: { readonly width: number; readonly children?: ReactNode }) =>
  h("div", { style: { width: `${props.width}px`, font: `16px "${FAMILY}"` } }, props.children);

// One animation frame, by when a resize's observer and the render it schedules have run.
const frame = Effect.callback<void>((resume) => {
  requestAnimationFrame(() => resume(Effect.void));
});
const frames = async (n: number) => {
  for (let i = 0; i < n; i++) await Effect.runPromise(frame);
};

describe("Truncate", () => {
  it("cuts to its box as the box resizes, with the whole text in its title", async () => {
    const { rerender } = render(h(Box, { width: 140 }, h(Truncate, { text: NAME, at: "middle" })));
    const name = page.getByText(/…/);
    await expect.element(name).toHaveAttribute("title", NAME);
    assert.isAtMost(laidOut(name.element()), 140);

    rerender(h(Box, { width: 600 }, h(Truncate, { text: NAME, at: "middle" })));
    await expect.element(page.getByText(NAME)).toBeInTheDocument();
    assert.isNull(page.getByText(NAME).element().getAttribute("title"));
  });

  it("renders nothing for a resize that doesn't move the cut", async () => {
    let commits = 0;
    render(
      h(
        Profiler,
        { id: "row", onRender: () => commits++ },
        h(Box, { width: 600 }, h(Truncate, { text: NAME })),
      ),
    );
    await expect.element(page.getByText(NAME)).toBeInTheDocument();
    await frames(3);
    const box = page.getByText(NAME).element().parentElement as HTMLElement;
    const settled = commits;
    // The whole text fits at 600 px and at 620, so the cut stays the same number.
    box.style.width = "620px";
    await frames(3);
    assert.strictEqual(commits, settled);
    box.style.width = "140px";
    await expect.element(page.getByText(/…/)).toBeInTheDocument();
    assert.isAbove(commits, settled);
  });

  it("ends right-to-left text with the ellipsis on its left in a left-to-right page, with dir auto", async () => {
    render(h(Box, { width: 70 }, h(Truncate, { text: ARABIC, dir: "auto" })));
    const name = page.getByTitle(ARABIC);
    await expect.element(name).toBeInTheDocument();
    const { ellipsis, before } = besideEllipsis(name.element());
    // Centres, since WebKit snaps a range inside a joined word to whole pixels.
    assert.isBelow(ellipsis.left + ellipsis.right, before.left + before.right);
  });

  it("sets no dir unless given, so existing callers lay out as before", async () => {
    render(h(Box, { width: 70 }, h(Truncate, { text: ARABIC })));
    const name = page.getByTitle(ARABIC);
    await expect.element(name).toBeInTheDocument();
    assert.isNull(name.element().getAttribute("dir"));
  });

  it("cuts to the box's letter spacing", async () => {
    render(
      h(
        "div",
        { style: { letterSpacing: "2px" } },
        h(Box, { width: 140 }, h(Truncate, { text: NAME, words: false })),
      ),
    );
    const name = page.getByText(/…/);
    await expect.element(name).toBeInTheDocument();
    assert.isAtMost(laidOut(name.element()), 140);
  });

  it("reads its element's style once, and not at all in a FontProvider, cutting to the provider's font", async () => {
    const original = window.getComputedStyle;
    let reads = 0;
    window.getComputedStyle = (...args) => {
      reads++;
      return original.apply(window, args);
    };
    try {
      // The provider's font is twice the size the row renders in, so its cut keeps less.
      render(
        h(
          Box,
          { width: 240 },
          h(Truncate, { text: NAME, words: false, className: "own" }),
          h(
            FontProvider,
            { font: `32px "${FAMILY}"`, letterSpacing: 0 },
            h(Truncate, { text: NAME, words: false, className: "provided" }),
          ),
        ),
      );
      await expect.element(page.getByTitle(NAME).nth(1)).toBeInTheDocument();
      assert.strictEqual(reads, 1);
    } finally {
      window.getComputedStyle = original;
    }
    const own = document.querySelector(".own")!.textContent!;
    const provided = document.querySelector(".provided")!.textContent!;
    assert.isBelow(provided.length, own.length * 0.7, JSON.stringify([own, provided]));
  });

  it("cuts again on resize without measuring, the whole text painted", async () => {
    const row = (width: number) =>
      h(Box, { width }, h(Truncate, { text: NAME, at: "middle", render: "full" }));
    const { rerender } = render(row(140));
    await expect.element(page.getByText("…")).toBeInTheDocument();
    let calls = -1;
    const measured = vi.spyOn(OffscreenCanvasRenderingContext2D.prototype, "measureText");
    try {
      const before = document.body.textContent;
      rerender(row(220));
      await expect.poll(() => document.body.textContent).not.toBe(before);
      calls = measured.mock.calls.length;
    } finally {
      measured.mockRestore();
    }
    assert.strictEqual(calls, 0);
  });

  it("paints the whole text when asked, so copying it gives every character", async () => {
    render(h(Box, { width: 140 }, h(Truncate, { text: NAME, at: "middle", render: "full" })));
    const ellipsis = page.getByText("…");
    await expect.element(ellipsis).toBeInTheDocument();
    const name = ellipsis.element().parentElement!;
    assert.isAtMost(laidOut(name), 140);
    getSelection()!.selectAllChildren(name);
    assert.strictEqual(getSelection()!.toString(), NAME);
  });

  it("collapses the cut part to no width under letter spacing", async () => {
    render(
      h(
        "div",
        { style: { letterSpacing: "2px" } },
        h(Box, { width: 140 }, h(Truncate, { text: NAME, at: "middle", render: "full" })),
      ),
    );
    const ellipsis = page.getByText("…");
    await expect.element(ellipsis).toBeInTheDocument();
    assert.isAtMost(laidOut(ellipsis.element().parentElement!), 140);
  });

  it("cuts again once a web font loads, to the new font's widths", async () => {
    // A family with no face yet, as before a web font arrives: the first cut is the
    // fallback font's. A face added before render would start loading at once.
    render(
      h(
        "div",
        { style: { width: "140px", font: '16px "Inter React Late", monospace' } },
        h(Truncate, { text: NAME, words: false }),
      ),
    );
    const name = page.getByText(/…/);
    await expect.element(name).toBeInTheDocument();
    const before = name.element().textContent;
    const late = new FontFace("Inter React Late", `url(${inter})`);
    document.fonts.add(late);
    await late.load();
    await expect.poll(() => name.element().textContent).not.toBe(before);
    assert.isAtMost(laidOut(name.element()), 140);
  });
});

describe("useCut", () => {
  it("measures the ellipsis as a run of its own with separateEllipsis", async () => {
    const font = `16px "${FAMILY}"`;
    const widths = Array.makeBy(121, (i) => 40 + i * 2);
    function Probe(props: { readonly width: number; readonly separate: boolean }) {
      const handle = useCut({
        text: NAME,
        width: props.width,
        font,
        letterSpacing: 0,
        words: false,
        separateEllipsis: props.separate,
      });
      return h("span", { "data-cut": `${props.width} ${props.separate}` }, String(handle.cut));
    }
    render(
      h(
        "div",
        null,
        ...Array.flatMap(widths, (width) => [
          h(Probe, { key: `${width} joined`, width, separate: false }),
          h(Probe, { key: `${width} apart`, width, separate: true }),
        ]),
      ),
    );
    await expect.element(page.getByText(/^\d+$/).first()).toBeInTheDocument();
    const shown = (width: number, separate: boolean) =>
      Number(document.querySelector(`[data-cut="${width} ${separate}"]`)!.textContent);
    const p = prepare(NAME, font);
    // Apart, nothing kerns across the ellipsis, so it takes its own width as an element would.
    const apart = { words: false, ellipsis: faceOf(font).m("…") };
    let differ = 0;
    for (const width of widths) {
      const joined = cut(p, width, { words: false });
      const alone = cut(p, width, apart);
      assert.strictEqual(shown(width, false), joined, `${width} px, joined`);
      assert.strictEqual(shown(width, true), alone, `${width} px, apart`);
      if (joined !== alone) differ++;
    }
    // Only widths where kerning beside the ellipsis moves the cut tell the two apart.
    assert.isAbove(differ, 0);
  });
});
