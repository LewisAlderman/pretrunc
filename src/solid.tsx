import type { JSX } from "@solidjs/web";
import {
  type Accessor,
  createContext,
  createMemo,
  createSignal,
  onSettled,
  Show,
  untrack,
  useContext,
} from "solid-js";
import {
  cut,
  type Cut,
  type CutOptions,
  head,
  prepare,
  type Prepared,
  tail,
  truncated,
} from "./cut.ts";
import { fontOf, observe, onFonts, spacingOf } from "./dom.ts";
import { faceOf, widthOf } from "./face.ts";

export interface CutProps extends CutOptions {
  readonly text: string;
  /** The room in px. Left out, it is observed from the element. */
  readonly width?: number;
  /** A CSS font shorthand. Left out, it is read from the element's computed style. */
  readonly font?: string;
  /** CSS `letter-spacing` in px. Left out, it is read from the element's computed style. */
  readonly letterSpacing?: number;
  readonly protect?: RegExp;
}

export interface CutHandle {
  /** Give it the element whose width and font the cut follows. */
  readonly ref: (element: Element) => void;
  readonly prepared: Accessor<Prepared | undefined>;
  /** Undefined until the width and font are known. */
  readonly cut: Accessor<Cut | undefined>;
}

export interface Box {
  /** Give it the element whose width and font the text follows. */
  readonly ref: (element: Element) => void;
  /** The width given, or the element's content width; undefined until observed. */
  readonly width: Accessor<number | undefined>;
  /** The font given, or the element's; undefined until it mounts. */
  readonly font: Accessor<string | undefined>;
  /** The letter spacing given, or the element's, in px. */
  readonly spacing: Accessor<number>;
  /** Changes whenever web fonts load: read it where text is prepared. */
  readonly fonts: Accessor<number>;
}

export interface FontProviderProps {
  /** A CSS font shorthand that every cut inside is in, unless it's given its own. */
  readonly font?: string;
  /** CSS `letter-spacing` in px for every cut inside, unless it's given its own. */
  readonly letterSpacing?: number;
  readonly children?: JSX.Element;
}

const Fonts = createContext<FontProviderProps>({});

/**
 * Gives every `Truncate`, `Clamp` and `createBox` inside the font and letter spacing
 * their text renders in, once for a list. Each would otherwise read its element's
 * computed style when it mounts: 5,000 rows take 4 to 5 ms of style reads. Cuts follow
 * what's given, so give what the rows really render in.
 */
export function FontProvider(props: FontProviderProps): JSX.Element {
  return <Fonts value={props}>{props.children}</Fonts>;
}

/**
 * The width and font text is cut to: the ones given, then a `FontProvider`'s, or an
 * element's, observed. Whether to observe the width and read the font is decided once,
 * when it settles.
 */
export const createBox = (props: {
  readonly width?: number;
  readonly font?: string;
  readonly letterSpacing?: number;
}): Box => {
  const provided = useContext(Fonts);
  const given = () => props.font ?? provided.font;
  const spacing = () => props.letterSpacing ?? provided.letterSpacing;
  let element: Element | undefined;
  const [observed, setObserved] = createSignal<number>();
  const [computed, setComputed] = createSignal<string>();
  const [spaced, setSpaced] = createSignal(0);
  const [fonts, setFonts] = createSignal(0);
  onSettled(() => {
    const stops = [onFonts(() => setFonts((n) => n + 1))];
    const readFont = untrack(given) === undefined;
    const readSpacing = untrack(spacing) === undefined;
    if (element && (readFont || readSpacing)) {
      const style = getComputedStyle(element);
      if (readFont) setComputed(fontOf(element, style));
      if (readSpacing) setSpaced(spacingOf(element, style));
    }
    if (element && untrack(() => props.width) === undefined) {
      stops.push(observe(element, setObserved));
    }
    return () => {
      for (const stop of stops) stop();
    };
  });
  return {
    ref: (e) => (element = e),
    width: () => props.width ?? observed(),
    font: () => given() ?? computed(),
    spacing: () => spacing() ?? spaced(),
    fonts,
  };
};

export interface CreateCutProps extends CutProps {
  /**
   * The ellipsis is painted in an element of its own, so it is measured as a run of its
   * own and no kerning across it counts. Read once.
   */
  readonly separateEllipsis?: boolean;
}

/** The cut of `props.text` for an element's width and font, or for the ones given. */
export const createCut = (props: CreateCutProps): CutHandle =>
  cutOf(
    props,
    untrack(() => props.separateEllipsis),
  );

const cutOf = (props: CutProps, apart: boolean | undefined): CutHandle => {
  const box = createBox(props);
  const font = box.font;
  const prepared = createMemo(() => {
    box.fonts();
    const f = font();
    if (f === undefined) return undefined;
    return prepare(props.text, f, {
      ...(props.protect ? { protect: props.protect } : {}),
      letterSpacing: box.spacing(),
    });
  });
  const result = createMemo(() => {
    const p = prepared();
    const width = box.width();
    const f = font();
    if (p === undefined || width === undefined || f === undefined) return undefined;
    const ellipsis = props.ellipsis ?? "…";
    return apart && typeof ellipsis === "string"
      ? cut(p, width, {
          ...props,
          ellipsis: widthOf(faceOf(f), ellipsis) + box.spacing() * ellipsis.length,
        })
      : cut(p, width, props);
  });
  return { ref: box.ref, prepared, cut: result };
};

export interface TruncateProps extends CutProps {
  readonly ellipsis?: string;
  /**
   * "kept" (default) paints the kept text, with the whole text in `title` once cut.
   * "full" paints all of it with the cut part collapsed to no width, so copy,
   * find-in-page and screen readers get the whole text. Read once.
   */
  readonly render?: "kept" | "full";
  readonly class?: string;
}

/** One line of text, cut to fit its box. */
export function Truncate(props: TruncateProps): JSX.Element {
  const full = untrack(() => props.render === "full");
  const handle = cutOf(props, full);
  const ellipsis = () => props.ellipsis ?? "…";
  // Head, cut part, tail and, once cut, the whole text. Undefined until the first cut.
  const parts = createMemo(() => {
    const p = handle.prepared();
    const c = handle.cut();
    if (p === undefined || c === undefined) return undefined;
    const text = p.text;
    return [
      text.slice(0, head(c)),
      text.slice(head(c), tail(c)),
      text.slice(tail(c)),
      truncated(c) ? text : undefined,
    ] as const;
  });
  // Until the first cut, the browser's own end ellipsis stands in.
  return (
    <span
      ref={handle.ref}
      class={props.class}
      style={{
        display: "block",
        overflow: "hidden",
        "white-space": "nowrap",
        "text-overflow": "ellipsis",
      }}
      title={full ? undefined : parts()?.[3]}
    >
      {full ? (
        <>
          {parts()?.[0] ?? props.text}
          <span style={{ "font-size": "0" }}>{parts()?.[1]}</span>
          <Show when={parts()?.[3]}>
            <span
              aria-hidden="true"
              style={{ "user-select": "none", "-webkit-user-select": "none" }}
            >
              {ellipsis()}
            </span>
          </Show>
          {parts()?.[2]}
        </>
      ) : (
        <>{(parts()?.[0] ?? props.text) + (parts()?.[3] ? ellipsis() + parts()![2] : "")}</>
      )}
    </span>
  );
}
