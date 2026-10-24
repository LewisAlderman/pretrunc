import inter from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { cleanup, render } from "@solidjs/testing-library";
import type { JSX } from "@solidjs/web";
import { afterEach, assert, beforeAll, describe, expect, it } from "@effect/vitest";
import { createSignal, flush, For } from "solid-js";
import { vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";
import { cut, prepare } from "./cut.ts";
import { faceOf } from "./face.ts";
import { createCut, FontProvider, Truncate } from "./solid.tsx";

const FAMILY = "Inter Adapter";
const NAME = "Alexandra Richardson-Featherstonehaugh";
const ARABIC = "محمد عبد الرحمن";
// Right-to-left first, then Latin runs among neutrals that a right-to-left paragraph
// reorders.
const MIXED = "محمد A.V. — 12:30";

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

function Box(props: { readonly width: number; readonly children: JSX.Element }) {
  return (
    <div style={{ width: `${props.width}px`, font: `16px "${FAMILY}"` }}>{props.children}</div>
  );
}

describe("Truncate", () => {
  it("cuts to its box as the box resizes, with the whole text in its title", async () => {
    const [width, setWidth] = createSignal(140);
    render(() => (
      <Box width={width()}>
        <Truncate text={NAME} at="middle" />
      </Box>
    ));
    const name = page.getByText(/…/);
    await expect.element(name).toHaveAttribute("title", NAME);
    assert.isAtMost(laidOut(name.element()), 140);

    setWidth(600);
    await expect.element(page.getByText(NAME)).toBeInTheDocument();
    assert.isNull(page.getByText(NAME).element().getAttribute("title"));
  });

  it("ends right-to-left text with the ellipsis on its left in a left-to-right page, with dir auto", async () => {
    render(() => (
      <Box width={70}>
        <Truncate text={ARABIC} dir="auto" />
      </Box>
    ));
    const name = page.getByTitle(ARABIC);
    await expect.element(name).toBeInTheDocument();
    const { ellipsis, before } = besideEllipsis(name.element());
    // Centres, since WebKit snaps a range inside a joined word to whole pixels.
    assert.isBelow(ellipsis.left + ellipsis.right, before.left + before.right);
  });

  it("sets no dir unless given, so existing callers lay out as before", async () => {
    render(() => (
      <Box width={70}>
        <Truncate text={ARABIC} />
      </Box>
    ));
    const name = page.getByTitle(ARABIC);
    await expect.element(name).toBeInTheDocument();
    assert.isNull(name.element().getAttribute("dir"));
  });

  // Cuts are measured left to right; laid out right to left, the neutrals between the
  // Latin runs move, and the line can come out wider than the box (#17).
  const widestOver = (setWidth: (width: number) => void, element: () => Element) => {
    let worst = -Infinity;
    for (let width = 20; width <= 160; width += 0.25) {
      setWidth(width);
      flush();
      worst = Math.max(worst, laidOut(element()) - width);
    }
    return worst;
  };

  it.fails("keeps mixed text laid out right to left by dir auto within its box (#17)", () => {
    const [width, setWidth] = createSignal(20);
    render(() => (
      <Box width={width()}>
        <Truncate text={MIXED} width={width()} dir="auto" class="mixed" />
      </Box>
    ));
    assert.isAtMost(
      widestOver(setWidth, () => document.querySelector(".mixed")!),
      0,
    );
  });

  it.fails("keeps mixed text under a right-to-left ancestor within its box (#17)", () => {
    const [width, setWidth] = createSignal(20);
    render(() => (
      <div dir="rtl">
        <Box width={width()}>
          <Truncate text={MIXED} width={width()} class="mixed" />
        </Box>
      </div>
    ));
    assert.isAtMost(
      widestOver(setWidth, () => document.querySelector(".mixed")!),
      0,
    );
  });

  it("cuts to the box's letter spacing", async () => {
    render(() => (
      <div style={{ "letter-spacing": "2px" }}>
        <Box width={140}>
          <Truncate text={NAME} words={false} />
        </Box>
      </div>
    ));
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
      render(() => (
        <Box width={240}>
          <Truncate text={NAME} words={false} class="own" />
          <FontProvider font={`32px "${FAMILY}"`} letterSpacing={0}>
            <Truncate text={NAME} words={false} class="provided" />
          </FontProvider>
        </Box>
      ));
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
    const [width, setWidth] = createSignal(140);
    render(() => (
      <Box width={width()}>
        <Truncate text={NAME} at="middle" render="full" />
      </Box>
    ));
    await expect.element(page.getByText("…")).toBeInTheDocument();
    let calls = -1;
    const measured = vi.spyOn(OffscreenCanvasRenderingContext2D.prototype, "measureText");
    try {
      const before = document.body.textContent;
      setWidth(220);
      await expect.poll(() => document.body.textContent).not.toBe(before);
      calls = measured.mock.calls.length;
    } finally {
      measured.mockRestore();
    }
    assert.strictEqual(calls, 0);
  });

  it("paints the whole text when asked, so copying it gives every character", async () => {
    render(() => (
      <Box width={140}>
        <Truncate text={NAME} at="middle" render="full" />
      </Box>
    ));
    const ellipsis = page.getByText("…");
    await expect.element(ellipsis).toBeInTheDocument();
    const name = ellipsis.element().parentElement!;
    assert.isAtMost(laidOut(name), 140);
    getSelection()!.selectAllChildren(name);
    assert.strictEqual(getSelection()!.toString(), NAME);
  });

  it("collapses the cut part to no width under letter spacing", async () => {
    render(() => (
      <div style={{ "letter-spacing": "2px" }}>
        <Box width={140}>
          <Truncate text={NAME} at="middle" render="full" />
        </Box>
      </div>
    ));
    const ellipsis = page.getByText("…");
    await expect.element(ellipsis).toBeInTheDocument();
    assert.isAtMost(laidOut(ellipsis.element().parentElement!), 140);
  });

  it("cuts again once a web font loads, to the new font's widths", async () => {
    // A family with no face yet, as before a web font arrives: the first cut is the
    // fallback font's. A face added before render would start loading at once.
    render(() => (
      <div style={{ width: "140px", font: '16px "Inter Late", monospace' }}>
        <Truncate text={NAME} words={false} />
      </div>
    ));
    const name = page.getByText(/…/);
    await expect.element(name).toBeInTheDocument();
    const before = name.element().textContent;
    const late = new FontFace("Inter Late", `url(${inter})`);
    document.fonts.add(late);
    await late.load();
    await expect.poll(() => name.element().textContent).not.toBe(before);
    assert.isAtMost(laidOut(name.element()), 140);
  });
});

describe("createCut", () => {
  it("measures the ellipsis as a run of its own with separateEllipsis", async () => {
    const font = `16px "${FAMILY}"`;
    const widths = Array.from({ length: 121 }, (_, i) => 40 + i * 2);
    function Probe(props: { readonly width: number; readonly separate: boolean }) {
      const handle = createCut({
        text: NAME,
        get width() {
          return props.width;
        },
        font,
        letterSpacing: 0,
        words: false,
        get separateEllipsis() {
          return props.separate;
        },
      });
      return <span data-cut={`${props.width} ${props.separate}`}>{String(handle.cut())}</span>;
    }
    render(() => (
      <For each={widths}>
        {(width) => (
          <>
            <Probe width={width} separate={false} />
            <Probe width={width} separate={true} />
          </>
        )}
      </For>
    ));
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
