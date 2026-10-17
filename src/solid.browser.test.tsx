import inter from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { cleanup, render } from "@solidjs/testing-library";
import type { JSX } from "@solidjs/web";
import { afterEach, assert, beforeAll, describe, expect, it } from "@effect/vitest";
import { createSignal } from "solid-js";
import { page } from "vite-plus/test/browser/context";
import { Truncate } from "./solid.tsx";

const FAMILY = "Inter Adapter";
const NAME = "Alexandra Richardson-Featherstonehaugh";

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
