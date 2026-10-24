// Written with createElement, not JSX, as react.ts is.
import {
  createElement,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { type CutOptions, head, type Protect, tail, truncated } from "./cut.ts";
import { observe } from "./dom.ts";
import { clamp, prepareLines } from "./lines.ts";
import { useBox, useProtect } from "./react.ts";

export interface ClampProps extends Omit<CutOptions, "tailGraphemes"> {
  readonly text: string;
  /** How many lines to keep. */
  readonly lines: number;
  readonly ellipsis?: string;
  /**
   * Painted after the text whenever it is cut or `expanded`, such as a "more" or
   * "less" button. Its width is observed and kept free on the last line.
   */
  readonly after?: ReactNode;
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
  /**
   * The element's `dir`, unset unless given. "auto" takes the direction from the text's
   * first strong character, so right-to-left text cut at its end shows its ellipsis on
   * its left in a left-to-right page. Cuts are measured left to right, so mixed text laid
   * out right to left can run past its box by a pixel or so (#17).
   */
  readonly dir?: "ltr" | "rtl" | "auto";
  readonly className?: string;
}

const box = { display: "inline-block" } as const;

/** A paragraph cut to a number of lines at its end, start or middle. */
export function Clamp(props: ClampProps): ReactNode {
  const b = useBox(props);
  const { font, spacing, fonts } = b;
  const { text, lines, at, ratio, words, trim, ellipsis = "…", whiteSpace, wordBreak } = props;
  const hasAfter = props.after !== undefined;
  // `after` mounts only once the text is cut, so it is observed from its own ref.
  const [after, setAfter] = useState<Element | null>(null);
  const [afterWidth, setAfterWidth] = useState(0);
  useEffect(() => (after ? observe(after, setAfterWidth) : undefined), [after]);
  const protect = useProtect(props.protect);
  const prepared = useMemo(
    () =>
      font === undefined
        ? undefined
        : prepareLines(text, font, {
            ...(protect ? { protect } : {}),
            ...(whiteSpace ? { whiteSpace } : {}),
            ...(wordBreak ? { wordBreak } : {}),
            letterSpacing: spacing,
          }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- fonts changes when a web font loads, after forget() has dropped the widths the last prepare used
    [text, font, spacing, protect, whiteSpace, wordBreak, fonts],
  );
  // Clamps are few beside a table's rows, so each renders on a width change and clamps
  // only when something it reads has changed.
  const width = useSyncExternalStore(b.subscribe, b.width, () => undefined);
  const within = typeof words === "object" ? words.within : words;
  const c = useMemo(() => {
    if (prepared === undefined || width === undefined) return undefined;
    return clamp(prepared, width, {
      lines,
      ellipsis,
      // `after` is an element here and a width to `clamp`, so it's always given as one.
      after: hasAfter ? afterWidth : 0,
      ...(at === undefined ? {} : { at }),
      ...(ratio === undefined ? {} : { ratio }),
      ...(within === undefined ? {} : { words: typeof within === "number" ? { within } : within }),
      ...(trim === undefined ? {} : { trim }),
    });
  }, [prepared, width, lines, ellipsis, hasAfter, afterWidth, at, ratio, within, trim]);
  const cutNow = c !== undefined && truncated(c);
  const shown =
    props.expanded || prepared === undefined || !cutNow
      ? text
      : prepared.text.slice(0, head(c)) + ellipsis + prepared.text.slice(tail(c));
  return createElement(
    "div",
    {
      ref: b.ref,
      className: props.className,
      dir: props.dir,
      style: { overflowWrap: "break-word", whiteSpace: whiteSpace ?? "normal" },
    },
    shown,
    hasAfter && (props.expanded || cutNow)
      ? createElement("span", { ref: setAfter, style: box }, props.after)
      : null,
  );
}
