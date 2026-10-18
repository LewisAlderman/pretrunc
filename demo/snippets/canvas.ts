declare const context: CanvasRenderingContext2D;
declare const labels: string[];
declare const width: number;
// ---cut---
import {
  cut,
  prepare,
  toText,
} from "pretrunc";

// No DOM text: labels are cut and drawn.
const font = '15px "Inter Variable"';
context.font = font;
labels.forEach((label, i) => {
  const p = prepare(label, font);
  const shown = toText(
    p,
    cut(p, width - 16, { at: "middle" }),
  );
  context.fillText(shown, 8, 12 + i * 24);
});
