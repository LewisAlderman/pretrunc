// The prior art pretrunc is measured against, vendored for the benchmark only, with each
// constant it read from its module turned into a parameter. Both are MIT licensed.
//
// - findTruncationPoint and computeLineBreaks: @shipitandpray/pretext-truncate,
//   src/truncationEngine.ts at 2178091, Copyright (c) ShipItAndPray.
// - fillLine, clampLines, createLabel and layoutMiddle: @chenglou/pretext,
//   pages/demos/ellipsis.model.ts at 0d102a5, Copyright (c) 2026 Pretext contributors.

import {
  layout,
  type LayoutCursor,
  layoutNextLine,
  layoutNextLineRange,
  layoutWithLines,
  prepare,
  prepareWithSegments,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";

// pretext-truncate

const computeLineBreaks = (text: string, containerWidth: number, font: string) => {
  if (!text || containerWidth <= 0) return [];
  const result = layoutWithLines(prepareWithSegments(text, font), containerWidth, 1);
  let charOffset = 0;
  const breaks: Array<{ start: number; end: number; width: number }> = [];
  for (const line of result.lines) {
    const start = charOffset;
    const end = start + line.text.length;
    breaks.push({ start, end, width: line.width });
    charOffset = end;
  }
  return breaks;
};

/** The character index to cut at so `text` fits `maxLines` lines with room for the ellipsis. */
export const findTruncationPoint = (
  text: string,
  maxLines: number,
  containerWidth: number,
  font: string,
  ellipsisWidth: number,
): number => {
  if (!text || containerWidth <= 0 || maxLines <= 0) return 0;
  const lines = computeLineBreaks(text, containerWidth, font);
  if (lines.length <= maxLines) return text.length;
  const targetLine = lines[maxLines - 1]!;
  if (containerWidth - ellipsisWidth <= 0) return targetLine.start;
  const lineText = text.slice(targetLine.start, targetLine.end);
  let charIndex = targetLine.end;
  if (targetLine.width + ellipsisWidth > containerWidth) {
    for (let i = lineText.length; i >= 0; i--) {
      const sub = lineText.slice(0, i);
      if (!sub) {
        charIndex = targetLine.start;
        break;
      }
      layout(prepare(sub, font), Infinity, 1);
      const subLines = layoutWithLines(prepareWithSegments(sub, font), Infinity, 1);
      const subWidth = subLines.lines.length > 0 ? subLines.lines[0]!.width : 0;
      if (subWidth <= containerWidth - ellipsisWidth) {
        charIndex = targetLine.start + i;
        break;
      }
    }
  }
  return charIndex;
};

// pretext's ellipsis demo

const START: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
const FIT_TOLERANCE = 1 / 64;

const trimEndSpace = (text: string) => (text.endsWith(" ") ? text.slice(0, -1) : text);

const fillLine = (
  prepared: PreparedTextWithSegments,
  start: LayoutCursor,
  room: number,
  spaceWidth: number,
): string => {
  let text = "";
  let cursor = start;
  let x = 0;
  for (;;) {
    const piece = layoutNextLine(prepared, room - x, cursor);
    if (piece === null || piece.width > room - x + FIT_TOLERANCE) return text;
    x += piece.width;
    if (piece.text.endsWith(" ")) {
      if (x + spaceWidth > room) return text + piece.text.slice(0, -1);
      x += spaceWidth;
    }
    text += piece.text;
    cursor = piece.end;
  }
};

/** The first `maxLines` lines at `width`, the last leaving `tailWidth` free when text is left. */
export const clampLines = (
  prepared: PreparedTextWithSegments,
  width: number,
  maxLines: number,
  tailWidth: number,
  spaceWidth: number,
): string[] => {
  const lines: string[] = [];
  let cursor = START;
  let lastStart = START;
  let lastWidth = 0;
  for (let i = 0; i < maxLines; i++) {
    const line = layoutNextLine(prepared, width, cursor);
    if (line === null) return lines;
    lines.push(line.text);
    lastStart = cursor;
    lastWidth = line.width;
    cursor = line.end;
  }
  if (layoutNextLineRange(prepared, width, cursor) === null) return lines;
  const last = lines.length - 1;
  lines[last] =
    lastWidth + tailWidth <= width
      ? trimEndSpace(lines[last]!)
      : fillLine(prepared, lastStart, width - tailWidth, spaceWidth);
  return lines;
};

export interface Label {
  readonly text: string;
  readonly prepared: PreparedTextWithSegments;
  readonly starts: LayoutCursor[];
  readonly nameStart: number;
}

export const createLabel = (text: string, font: string): Label => {
  const prepared = prepareWithSegments(text, font);
  const graphemes = layoutWithLines(prepared, 0, 1).lines;
  const starts: LayoutCursor[] = [];
  let nameStart = 0;
  for (let i = 0; i < graphemes.length; i++) {
    starts.push(graphemes[i]!.start);
    if (graphemes[i]!.text === "/") nameStart = i;
  }
  return { text, prepared, starts, nameStart };
};

/** One line keeping a label's start and its file name, or its end, around an ellipsis. */
export const layoutMiddle = (
  label: Label,
  width: number,
  ellipsis: string,
  ellipsisWidth: number,
  spaceWidth: number,
): string => {
  const { prepared, starts, nameStart } = label;
  const whole = layoutNextLineRange(prepared, Number.POSITIVE_INFINITY, START);
  if (whole === null || whole.width <= width) return label.text;
  const room = width - ellipsisWidth;
  let end = "";
  let endWidth = 0;
  const name =
    nameStart > 0 ? layoutNextLine(prepared, Number.POSITIVE_INFINITY, starts[nameStart]) : null;
  if (name !== null && name.width <= room) {
    end = name.text;
    endWidth = name.width;
  } else {
    for (let i = starts.length - 1; i > 0; i--) {
      const rest = layoutNextLine(prepared, Number.POSITIVE_INFINITY, starts[i]);
      if (rest === null || rest.width > room / 2) break;
      end = rest.text;
      endWidth = rest.width;
    }
  }
  return fillLine(prepared, START, room - endWidth, spaceWidth) + ellipsis + end;
};
