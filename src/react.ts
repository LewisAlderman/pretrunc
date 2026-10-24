// Written with createElement, not JSX: every .tsx file here compiles as Solid, so plain
// .ts keeps the React adapter clear of the Solid compiler without a second JSX setup.
import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  cut,
  type Cut,
  type CutOptions,
  head,
  prepare,
  type Prepared,
  type Protect,
  tail,
  truncated,
} from "./cut.ts";
import { fontOf, observe, onFonts, spacingOf } from "./dom.ts";
import { faceOf, widthOf } from "./face.ts";

export interface BoxProps {
  /** The room in px. Left out, it is observed from the element. */
  readonly width?: number;
  /** A CSS font shorthand. Left out, it is read from the element's computed style. */
  readonly font?: string;
  /** CSS `letter-spacing` in px. Left out, it is read from the element's computed style. */
  readonly letterSpacing?: number;
}

export interface Box {
  /** Give it the element whose width and font the text follows. */
  readonly ref: (element: Element | null) => void;
  /** The font given, or the element's; undefined until it mounts. */
  readonly font: string | undefined;
  /** The letter spacing given, or the element's, in px. */
  readonly spacing: number;
  /** Changes whenever web fonts load: a dependency wherever text is prepared. */
  readonly fonts: number;
  /** Subscribes to the width, for `useSyncExternalStore`. */
  readonly subscribe: (change: () => void) => () => void;
  /** The width given, or the element's content width; undefined until observed. */
  readonly width: () => number | undefined;
}

export interface FontProviderProps {
  /** A CSS font shorthand that every cut inside is in, unless it's given its own. */
  readonly font?: string;
  /** CSS `letter-spacing` in px for every cut inside, unless it's given its own. */
  readonly letterSpacing?: number;
  readonly children?: ReactNode;
}

interface Provided {
  readonly font: string | undefined;
  readonly letterSpacing: number | undefined;
}

const Fonts = createContext<Provided>({ font: undefined, letterSpacing: undefined });

/**
 * Gives every `Truncate`, `Clamp` and `useBox` inside the font and letter spacing their
 * text renders in, once for a list. Each would otherwise read its element's computed
 * style when it mounts: 5,000 rows take 4 to 5 ms of style reads. Cuts follow what's
 * given, so give what the rows really render in.
 */
export function FontProvider(props: FontProviderProps): ReactNode {
  const { font, letterSpacing } = props;
  const value = useMemo(() => ({ font, letterSpacing }), [font, letterSpacing]);
  return createElement(Fonts, { value }, props.children);
}

/**
 * The width and font text is cut to: the ones given, then a `FontProvider`'s, or an
 * element's. The width is a store, not state, so a component can read what it derives
 * from it with `useSyncExternalStore` and render only when that changes.
 */
export const useBox = (props: BoxProps): Box => {
  const provided = useContext(Fonts);
  const given = props.font ?? provided.font;
  const givenSpacing = props.letterSpacing ?? provided.letterSpacing;
  const [element, setElement] = useState<Element | null>(null);
  const [computed, setComputed] = useState<{ font: string; spacing: number }>();
  const [fonts, setFonts] = useState(0);
  const observed = useRef<number | undefined>(undefined);
  useEffect(() => onFonts(() => setFonts((n) => n + 1)), []);
  const readFont = given === undefined;
  const readSpacing = givenSpacing === undefined;
  // The style is read once per element as it mounts, before it paints, and only for what
  // wasn't given.
  const ref = useCallback(
    (e: Element | null) => {
      setElement(e);
      if (!e || (!readFont && !readSpacing)) return;
      const style = getComputedStyle(e);
      setComputed({ font: fontOf(e, style), spacing: spacingOf(e, style) });
    },
    [readFont, readSpacing],
  );
  const observing = props.width === undefined;
  const subscribe = useCallback(
    (change: () => void) => {
      if (!element || !observing) return () => {};
      return observe(element, (width) => {
        observed.current = width;
        change();
      });
    },
    [element, observing],
  );
  const width = props.width;
  return {
    ref,
    font: given ?? computed?.font,
    spacing: givenSpacing ?? computed?.spacing ?? 0,
    fonts,
    subscribe,
    width: () => width ?? observed.current,
  };
};

export interface CutProps extends CutOptions, BoxProps {
  readonly text: string;
  readonly protect?: Protect;
}

/**
 * `protect` kept by what it says, not by identity: an inline literal is new on every
 * render, and this returns one value while its patterns, weights and wholes stay the same.
 */
export const useProtect = (protect: Protect | undefined): Protect | undefined => {
  let key = "";
  if (protect) {
    for (const given of "length" in protect ? protect : [protect]) {
      const {
        pattern,
        weight = 1,
        whole = false,
      } = given instanceof RegExp ? { pattern: given } : given;
      key += `${pattern}${weight}${whole} `;
    }
  }
  // The value from the render that first saw this key, as React's derived state is kept.
  const [kept, setKept] = useState({ key, protect });
  if (kept.key !== key) setKept({ key, protect });
  return kept.key === key ? kept.protect : protect;
};

export interface UseCutProps extends CutProps {
  /**
   * The ellipsis is painted in an element of its own, so it is measured as a run of its
   * own and no kerning across it counts.
   */
  readonly separateEllipsis?: boolean;
}

export interface CutHandle {
  /** Give it the element whose width and font the cut follows. */
  readonly ref: (element: Element | null) => void;
  readonly prepared: Prepared | undefined;
  /** Undefined until the width and font are known. */
  readonly cut: Cut | undefined;
}

const useCutWith = (props: CutProps, apart: boolean): CutHandle => {
  const box = useBox(props);
  const { font, spacing, fonts } = box;
  const { text } = props;
  const protect = useProtect(props.protect);
  const prepared = useMemo(
    () =>
      font === undefined
        ? undefined
        : prepare(text, font, { ...(protect ? { protect } : {}), letterSpacing: spacing }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- fonts changes when a web font loads, after forget() has dropped the widths the last prepare used
    [text, font, spacing, protect, fonts],
  );
  // The cut is the snapshot: a number, so a resize that doesn't move it renders nothing.
  const snapshot = (): Cut | undefined => {
    const width = box.width();
    if (prepared === undefined || width === undefined || font === undefined) return undefined;
    const ellipsis = props.ellipsis ?? "…";
    return apart && typeof ellipsis === "string"
      ? cut(prepared, width, {
          ...props,
          ellipsis: widthOf(faceOf(font), ellipsis) + spacing * ellipsis.length,
        })
      : cut(prepared, width, props);
  };
  const result = useSyncExternalStore(box.subscribe, snapshot, () => undefined);
  return { ref: box.ref, prepared, cut: result };
};

/** The cut of `props.text` for an element's width and font, or for the ones given. */
export const useCut = (props: UseCutProps): CutHandle =>
  useCutWith(props, props.separateEllipsis === true);

export interface TruncateProps extends CutProps {
  readonly ellipsis?: string;
  /**
   * "kept" (default) paints the kept text, with the whole text in `title` once cut.
   * "full" paints all of it with the cut part collapsed to no width, so copy,
   * find-in-page and screen readers get the whole text.
   */
  readonly render?: "kept" | "full";
  /**
   * The element's `dir`, unset unless given. "auto" takes the direction from the text's
   * first strong character, so right-to-left text cut at its end shows its ellipsis on
   * its left in a left-to-right page. Cuts are measured left to right, so mixed text laid
   * out right to left can run past its box by a pixel or so (#17).
   */
  readonly dir?: "ltr" | "rtl" | "auto";
  readonly className?: string;
}

// Until the first cut, the browser's own end ellipsis stands in.
const line = {
  display: "block",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
} as const;
const collapsed = { fontSize: 0 } as const;
const unselectable = { userSelect: "none", WebkitUserSelect: "none" } as const;

/** One line of text, cut to fit its box. */
export function Truncate(props: TruncateProps): ReactNode {
  const full = props.render === "full";
  const handle = useCutWith(props, full);
  const { prepared: p, cut: c } = handle;
  const ellipsis = props.ellipsis ?? "…";
  const cutNow = p !== undefined && c !== undefined && truncated(c);
  const text = p?.text ?? props.text;
  const kept = cutNow ? text.slice(0, head(c)) : text;
  const rest = cutNow ? text.slice(tail(c)) : "";
  const own = {
    ref: handle.ref,
    className: props.className,
    dir: props.dir,
    style: line,
    title: !full && cutNow ? text : undefined,
  };
  if (!full) return createElement("span", own, kept + (cutNow ? ellipsis + rest : ""));
  return createElement(
    "span",
    own,
    kept,
    createElement("span", { style: collapsed }, cutNow ? text.slice(head(c), tail(c)) : ""),
    cutNow ? createElement("span", { "aria-hidden": true, style: unselectable }, ellipsis) : null,
    rest,
  );
}
