import { forget } from "./face.ts";

const watched = new WeakMap<Element, (width: number) => void>();
let observer: ResizeObserver | undefined;

/**
 * Calls `listener` with the element's content-box width, first before the element
 * paints and then on every change, through one ResizeObserver shared by every element.
 * Returns the function that stops it.
 */
export const observe = (element: Element, listener: (width: number) => void): (() => void) => {
  observer ??= new ResizeObserver((entries) => {
    for (const entry of entries) watched.get(entry.target)?.(entry.contentRect.width);
  });
  watched.set(element, listener);
  observer.observe(element);
  return () => {
    watched.delete(element);
    observer!.unobserve(element);
  };
};

/**
 * The canvas font for an element's computed style. Built from the longhands: the
 * `font` shorthand reads back empty in some engines, and `font-stretch` reads back as
 * a percentage, which canvas rejects, so it is left out.
 */
export const fontOf = (element: Element): string => {
  const style = getComputedStyle(element);
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
};

const loaded = new Set<() => void>();

/**
 * Calls `listener` whenever web fonts finish loading, after dropping every width
 * measured so far: those were the fallback font's. Prepare the text again in it.
 * Returns the function that stops it.
 */
export const onFonts = (listener: () => void): (() => void) => {
  if (!loaded.size) document.fonts.addEventListener("loading", loading);
  loaded.add(listener);
  return () => {
    loaded.delete(listener);
    if (!loaded.size) document.fonts.removeEventListener("loading", loading);
  };
};

// WebKit fires no `loadingdone` for a face loaded from script, but every engine fires
// `loading`, and `ready` settles once every pending load is done.
const loading = () =>
  void document.fonts.ready.then(() => {
    forget();
    for (const listener of loaded) listener();
  });
