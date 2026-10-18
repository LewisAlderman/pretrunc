import { assert, describe, it } from "@effect/vitest";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { Clamp } from "./react-lines.ts";
import { Truncate } from "./react.ts";

const NAME = "Alexandra Richardson-Featherstonehaugh";

// On a server there is no element to measure, so the text renders whole and the
// browser's own ellipsis stands in until the client cuts it.
describe("React on a server", () => {
  it("renders a Truncate's whole text with the browser's ellipsis", () => {
    const html = renderToString(h(Truncate, { text: NAME, at: "middle" }));
    assert.include(html, NAME);
    assert.include(html, "text-overflow:ellipsis");
  });

  it("renders a Clamp's whole text", () => {
    const html = renderToString(h(Clamp, { text: NAME, lines: 2 }));
    assert.include(html, NAME);
  });
});
