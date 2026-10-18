import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, onSettled, Show } from "solid-js";
import { type CutOptions, head, type Protect, tail, truncated } from "./cut.ts";
import { observe } from "./dom.ts";
import { clamp, prepareLines } from "./lines.ts";
import { createBox } from "./solid.tsx";

export interface ClampProps extends Omit<CutOptions, "tailGraphemes"> {
  readonly text: string;
  /** How many lines to keep. */
  readonly lines: number;
  readonly ellipsis?: string;
  /**
   * Painted after the text whenever it is cut or `expanded`, such as a "more" or
   * "less" button. Its width is observed and kept free on the last line.
   */
  readonly after?: JSX.Element;
  /** Show every line, with `after` following the last one, on its own if it doesn't fit. */
  readonly expanded?: boolean;
  /** The room in px. Left out, it is observed from the element. */
  readonly width?: number;
  /** A CSS font shorthand. Left out, it is read from the element's computed style. */
  readonly font?: string;
  /** CSS `letter-spacing` in px. Left out, it is read from the element's computed style. */
  readonly letterSpacing?: number;
  readonly protect?: Protect;
  readonly whiteSpace?: "normal" | "pre-wrap";
  readonly wordBreak?: "normal" | "keep-all";
  readonly class?: string;
}

/** A paragraph cut to a number of lines at its end, start or middle. */
export function Clamp(props: ClampProps): JSX.Element {
  const box = createBox(props);
  const [afterWidth, setAfterWidth] = createSignal(0);
  // `after` mounts only once the text is cut, so it is observed from its own ref.
  let stop: (() => void) | undefined;
  const watch = (element: Element) => {
    stop?.();
    stop = observe(element, setAfterWidth);
  };
  onSettled(() => () => stop?.());
  const prepared = createMemo(() => {
    box.fonts();
    const font = box.font();
    if (font === undefined) return undefined;
    return prepareLines(props.text, font, {
      ...(props.protect ? { protect: props.protect } : {}),
      ...(props.whiteSpace ? { whiteSpace: props.whiteSpace } : {}),
      ...(props.wordBreak ? { wordBreak: props.wordBreak } : {}),
      letterSpacing: box.spacing(),
    });
  });
  const cut = createMemo(() => {
    const p = prepared();
    const width = box.width();
    const font = box.font();
    if (p === undefined || width === undefined || font === undefined) return undefined;
    // `after` is an element here and a width to `clamp`, so it's always given as one.
    return clamp(p, width, {
      ...props,
      after: props.after === undefined ? 0 : afterWidth(),
    });
  });
  const cutNow = () => {
    const c = cut();
    return c !== undefined && truncated(c);
  };
  const text = () => {
    const p = prepared();
    const c = cut();
    if (props.expanded || p === undefined || c === undefined || !truncated(c)) return props.text;
    return p.text.slice(0, head(c)) + (props.ellipsis ?? "…") + p.text.slice(tail(c));
  };
  return (
    <div
      ref={box.ref}
      class={props.class}
      style={{ "overflow-wrap": "break-word", "white-space": props.whiteSpace ?? "normal" }}
    >
      {text()}
      <Show when={props.after !== undefined && (props.expanded || cutNow())}>
        <span ref={watch} style={{ display: "inline-block" }}>
          {props.after}
        </span>
      </Show>
    </div>
  );
}
