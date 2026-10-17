// pretrunc's demo: every prop in a resizable frame, a playground with a control for each,
// and a stress table. `vp run demo:pretrunc` serves it with hot reload. Keep it in step
// with the API: a new option gets a control here and, if it changes what people see, an
// example.
import "@fontsource-variable/inter";
import "./demo.css";
import { type JSX, render } from "@solidjs/web";
import {
  createEffect,
  createMemo,
  createProjection,
  createSignal,
  For,
  onSettled,
  Show,
} from "solid-js";
import inter from "../fixtures/inter-latin.ts";
import { type CutOptions, cut, head, prepare, tail, toText, truncated } from "../src/index.ts";
import { observe, onFonts } from "../src/dom.ts";
import { clamp, prepareLines } from "../src/lines.ts";
import { tableFace } from "../src/metrics.ts";
import { Clamp } from "../src/solid-lines.tsx";
import { createBox, createCut, Truncate } from "../src/solid.tsx";

const FAMILY = '"Inter Variable"';

// One width for every gallery frame, set from the header; dragging a frame's corner
// still resizes that frame alone.
const [every, setEvery] = createSignal<number>();

// A cutting mat that reports its own width in its corner.
function Mat(props: { readonly children: JSX.Element; readonly wide?: boolean }) {
  const [width, setWidth] = createSignal(0);
  let element: HTMLDivElement | undefined;
  onSettled(() => (element ? observe(element, setWidth) : undefined));
  return (
    <div
      ref={(e) => (element = e)}
      class={props.wide ? "mat wide" : "mat"}
      style={{ width: !props.wide && every() !== undefined ? `${every()}px` : undefined }}
    >
      {props.children}
      <span class="measure">{Math.round(width())} px</span>
    </div>
  );
}

function Frame(props: {
  readonly title: string;
  readonly note: string;
  readonly code: string;
  readonly children: JSX.Element;
}) {
  return (
    <figure class="frame">
      <h3>{props.title}</h3>
      <p>{props.note}</p>
      <Mat>{props.children}</Mat>
      <pre>
        <code>{props.code}</code>
      </pre>
    </figure>
  );
}

const NAME = "Alexandra Richardson-Featherstonehaugh";
const PATH = "~/Projects/atlas/packages/renderer/src/text/layout/line-breaker.test.ts";
const STORY =
  "A weekend cabin on the north shore, twenty minutes from the ferry. Sleeps six, with a wood stove, no reception to speak of, and a rowing boat you're welcome to borrow. Bring boots: the path down to the water is steep, and the nearest shop is back across on the mainland.";
const LOG =
  "12:01 build started\n12:01 resolving 412 packages\n12:02 compiling 1,284 modules\n12:03 warning: unused export in src/text/layout.ts\n12:04 bundle written to dist/ in 2.8 s";
const CODE = `const p = prepare(name, '16px "Inter Variable"');\nconst c = cut(p, width, { at: "middle" });\n\nif (truncated(c)) {\n\tlabel.title = p.text;\n}\nlabel.textContent = toText(p, c);`;

// A list of tags that ends in a chip counting the ones that didn't fit: an element
// stands in for the ellipsis, measured by its width.
function Tags() {
  const tags = "design, frontend, typescript, solid, canvas, layout, typography, kerning";
  const handle = createCut({ text: tags, ellipsis: 30 });
  const shown = createMemo(() => {
    const p = handle.prepared();
    const c = handle.cut();
    if (p === undefined || c === undefined || !truncated(c)) return { text: tags, hidden: 0 };
    const rest = p.text.slice(head(c)).split(",");
    let hidden = 0;
    for (const tag of rest) if (tag.trim()) hidden++;
    return { text: p.text.slice(0, head(c)), hidden };
  });
  return (
    <div ref={handle.ref} class="strip" style={{ "white-space": "nowrap", overflow: "hidden" }}>
      {shown().text}
      <Show when={shown().hidden}>
        <span class="chip">+{shown().hidden}</span>
      </Show>
    </div>
  );
}

function Expandable(props: {
  readonly text: string;
  readonly lines: number;
  readonly at?: "start" | "middle" | "end";
}) {
  const [open, setOpen] = createSignal(false);
  return (
    <div class="strip">
      <Clamp
        text={props.text}
        lines={props.lines}
        at={props.at ?? "end"}
        expanded={open()}
        after={
          <button type="button" class="more" onClick={() => setOpen((o) => !o)}>
            {open() ? "less" : "more"}
          </button>
        }
      />
    </div>
  );
}

// Labels drawn on a canvas, cut with the core alone: no DOM text at all.
function CanvasLabels() {
  const labels = [
    NAME,
    PATH,
    "Quarterly revenue by region, before adjustments",
    "日本語のテキストも切れます",
    "😀 emoji are graphemes, never split 👍🏽",
  ];
  const [width, setWidth] = createSignal(0);
  const [fonts, setFonts] = createSignal(0);
  let canvas: HTMLCanvasElement | undefined;
  onSettled(() => {
    const stops = [onFonts(() => setFonts((n) => n + 1))];
    if (canvas) stops.push(observe(canvas, setWidth));
    return () => {
      for (const stop of stops) stop();
    };
  });
  createEffect(
    () => [width(), fonts()] as const,
    ([w]) => {
      if (!canvas || !w) return;
      const font = `15px ${FAMILY}`;
      const ratio = devicePixelRatio;
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(labels.length * 24 * ratio);
      const context = canvas.getContext("2d")!;
      context.scale(ratio, ratio);
      context.font = font;
      context.fillStyle = "#15201d";
      context.textBaseline = "middle";
      for (let i = 0; i < labels.length; i++) {
        const p = prepare(labels[i]!, font);
        context.fillText(
          toText(p, cut(p, w - 16, { at: i % 2 ? "end" : "middle" })),
          8,
          12 + i * 24,
        );
      }
    },
  );
  return <canvas ref={(e) => (canvas = e)} style={{ height: `${labels.length * 24}px` }} />;
}

// The same cut made with canvas and with the metrics table, as a server makes it.
function NoCanvas() {
  const [width, setWidth] = createSignal(0);
  let element: HTMLDivElement | undefined;
  onSettled(() => (element ? observe(element, setWidth) : undefined));
  const table = prepare(STORY, tableFace(inter, 16));
  return (
    <div
      ref={(e) => (element = e)}
      class="strip"
      style={{ "white-space": "nowrap", overflow: "hidden" }}
    >
      {width() ? toText(table, cut(table, width())) : ""}
    </div>
  );
}

function Gallery() {
  return (
    <section>
      <h2>Examples</h2>
      <p>
        Drag a frame's bottom-right corner to resize it, or set every frame at once from the top of
        the page. The grid lines are 10 px apart, with a bolder one every 50 px.
      </p>
      <div class="gallery">
        <Frame
          title="End, backing off to a word"
          note="The default. A cut near a space backs off to it, within a quarter of what that side keeps."
          code={`<Truncate text={name} />`}
        >
          <div class="strip">
            <Truncate text={NAME} />
          </div>
        </Frame>
        <Frame
          title="End, any grapheme"
          note="Without word preference the cut keeps as much as fits."
          code={`<Truncate text={name} words={false} />`}
        >
          <div class="strip">
            <Truncate text={NAME} words={false} />
          </div>
        </Frame>
        <Frame
          title="Middle"
          note="Keeps both ends; the head takes half the room."
          code={`<Truncate text={name} at="middle" />`}
        >
          <div class="strip">
            <Truncate text={NAME} at="middle" />
          </div>
        </Frame>
        <Frame
          title="Middle, a third for the head"
          note="ratio sets the head's share of the room."
          code={`<Truncate text={path} at="middle" ratio={0.33} />`}
        >
          <div class="strip">
            <Truncate text={PATH} at="middle" ratio={0.33} />
          </div>
        </Frame>
        <Frame
          title="Start"
          note="Keeps the end, for breadcrumbs and paths read from the right."
          code={`<Truncate text={path} at="start" />`}
        >
          <div class="strip">
            <Truncate text={PATH} at="start" />
          </div>
        </Frame>
        <Frame
          title="Keeping the file name"
          note="The tail starts at a protected match, which stays whole or goes whole."
          code={`<Truncate\n  text={path}\n  at="middle"\n  protect={/[^/]+$/g}\n  keep={0}\n/>`}
        >
          <div class="strip">
            <Truncate text={PATH} at="middle" protect={/[^/]+$/g} keep={0} />
          </div>
        </Frame>
        <Frame
          title="The last six characters of an ID"
          note="tail keeps a number of graphemes at the end."
          code={`<Truncate text={sha} at="middle" tail={6} words={false} />`}
        >
          <div class="strip">
            <Truncate
              text="sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
              at="middle"
              tail={6}
              words={false}
            />
          </div>
        </Frame>
        <Frame
          title="Mentions kept whole"
          note="A cut never splits a protected match: a mention shows whole or not at all."
          code={`<Truncate text={message} protect={/@[\\w.]+/g} />`}
        >
          <div class="strip">
            <Truncate
              text="Thanks @alexandra.richardson and @wolfgang.mozart for the review"
              protect={/@[\w.]+/g}
            />
          </div>
        </Frame>
        <Frame
          title="Your own ellipsis"
          note="Any string, measured in the text's font, kerning beside it included."
          code={`<Truncate text={story} at="middle" ellipsis=" [...] " />`}
        >
          <div class="strip">
            <Truncate text={STORY} at="middle" ellipsis=" [...] " />
          </div>
        </Frame>
        <Frame
          title="An element instead of an ellipsis"
          note="Give createCut the element's width as the ellipsis and render it yourself."
          code={`const handle = createCut({ text: tags, ellipsis: 30 });\n// the kept text, then <span class="chip">+3</span>`}
        >
          <Tags />
        </Frame>
        <Frame
          title="Whole text in the page"
          note="Select the line and copy it: you get every character. The cut part is there at no width."
          code={`<Truncate text={path} at="middle" render="full" />`}
        >
          <div class="strip">
            <Truncate text={PATH} at="middle" render="full" />
          </div>
        </Frame>
        <Frame
          title="Letter spacing"
          note="Read from the element's style, or given as letterSpacing."
          code={`<div style="letter-spacing: 2px">\n  <Truncate text={name} at="middle" />\n</div>`}
        >
          <div class="strip" style={{ "letter-spacing": "2px" }}>
            <Truncate text={NAME} at="middle" />
          </div>
        </Frame>
        <Frame
          title="Any script"
          note="Emoji, flags and combining marks are never split; Arabic and Devanagari are measured as they join."
          code={`<Truncate text={text} at="middle" />`}
        >
          <div class="strip">
            <Truncate text="👩🏽‍💻 Café naïve 🇬🇧 日本語 مرحبا بالعالم नमस्ते दुनिया" at="middle" />
          </div>
        </Frame>
        <Frame
          title="Three lines, with more and less"
          note="The button's width is kept free on the last line. Opened, it follows the text."
          code={`<Clamp\n  text={story}\n  lines={3}\n  expanded={open()}\n  after={<button>{open() ? "less" : "more"}</button>}\n/>`}
        >
          <Expandable text={STORY} lines={3} />
        </Frame>
        <Frame
          title="The last two lines"
          note="A clamp at the start keeps the end, as a log tail does."
          code={`<Clamp text={story} lines={2} at="start" />`}
        >
          <div class="strip">
            <Clamp text={STORY} lines={2} at="start" />
          </div>
        </Frame>
        <Frame
          title="Middle of a paragraph"
          note="The ellipsis sits halfway through, inside a line."
          code={`<Clamp text={story} lines={3} at="middle" />`}
        >
          <div class="strip">
            <Clamp text={STORY} lines={3} at="middle" />
          </div>
        </Frame>
        <Frame
          title="Preformatted"
          note="pre-wrap keeps spaces, tabs and line breaks."
          code={`<Clamp text={log} lines={3} whiteSpace="pre-wrap" />`}
        >
          <div class="strip" style={{ "font-family": "var(--code)", "font-size": "13px" }}>
            <Clamp text={LOG} lines={3} whiteSpace="pre-wrap" />
          </div>
        </Frame>
        <Frame
          title="Code, cut in the middle"
          note="Tabs count as wide as a tab stop can take."
          code={`<Clamp text={code} lines={4} at="middle" whiteSpace="pre-wrap" />`}
        >
          <div class="strip" style={{ "font-family": "var(--code)", "font-size": "13px" }}>
            <Clamp text={CODE} lines={4} at="middle" whiteSpace="pre-wrap" />
          </div>
        </Frame>
        <Frame
          title="On a canvas"
          note="The core needs no DOM: these labels are drawn with fillText."
          code={`const p = prepare(label, font);\nctx.fillText(toText(p, cut(p, width)), 8, y);`}
        >
          <CanvasLabels />
        </Frame>
        <Frame
          title="Without a canvas"
          note="Cut from Inter's metrics table, as a server or a worker cuts it."
          code={`import inter from "./inter.ts"; // vp run metrics:pretrunc\nconst p = prepare(story, tableFace(inter, 16));`}
        >
          <NoCanvas />
        </Frame>
      </div>
    </section>
  );
}

const PRESETS = [
  { label: "A long name", text: NAME },
  { label: "A file path", text: PATH },
  { label: "A paragraph", text: STORY },
  { label: "A build log", text: LOG },
  { label: "Several scripts", text: "👩🏽‍💻 Café naïve 🇬🇧 日本語 مرحبا بالعالم नमस्ते दुनिया" },
] as const;

function Playground() {
  const [text, setText] = createSignal<string>(PRESETS[1].text);
  const [lined, setLined] = createSignal(false);
  const [at, setAt] = createSignal<"start" | "middle" | "end">("middle");
  const [split, setSplit] = createSignal<"ratio" | "tail" | "keep">("ratio");
  const [ratio, setRatio] = createSignal(0.5);
  const [tailCount, setTailCount] = createSignal(8);
  const [keep, setKeep] = createSignal(0);
  const [protect, setProtect] = createSignal("[^/]+$");
  const [words, setWords] = createSignal<"on" | "off" | "px">("on");
  const [wordsPx, setWordsPx] = createSignal(24);
  const [trim, setTrim] = createSignal(true);
  const [ellipsis, setEllipsis] = createSignal("…");
  const [lines, setLines] = createSignal(3);
  const [whiteSpace, setWhiteSpace] = createSignal<"normal" | "pre-wrap">("normal");
  const [spacing, setSpacing] = createSignal(0);
  const [size, setSize] = createSignal(16);
  const [weight, setWeight] = createSignal(400);
  const [more, setMore] = createSignal(false);
  const [moreWidth, setMoreWidth] = createSignal(0);

  const font = () => `${weight()} ${size()}px ${FAMILY}`;
  const box = createBox({
    get font() {
      return font();
    },
    get letterSpacing() {
      return spacing();
    },
  });
  // undefined with no pattern, null for one that doesn't compile.
  const pattern = createMemo(() => {
    if (!protect()) return undefined;
    try {
      return new RegExp(protect(), "g");
    } catch {
      return null;
    }
  });
  const options = createMemo((): CutOptions => ({
    at: at(),
    words: words() === "on" ? true : words() === "off" ? false : wordsPx(),
    trim: trim(),
    ellipsis: ellipsis(),
    ...(at() === "middle" && split() === "ratio" ? { ratio: ratio() } : {}),
    ...(at() === "middle" && split() === "tail" ? { tail: tailCount() } : {}),
    ...(at() === "middle" && split() === "keep" ? { keep: keep() } : {}),
  }));
  const protectOption = () => (pattern() ? { protect: pattern()! } : {});
  // The cut, how long it took, and the text it refers to.
  const result = createMemo(() => {
    box.fonts();
    const width = box.width();
    if (width === undefined) return undefined;
    const start = performance.now();
    if (lined()) {
      const p = prepareLines(text(), font(), {
        whiteSpace: whiteSpace(),
        letterSpacing: spacing(),
        ...protectOption(),
      });
      const c = clamp(p, width, lines(), { ...options(), after: more() ? moreWidth() : 0 });
      return { text: p.text, c, ms: performance.now() - start, width };
    }
    const p = prepare(text(), font(), { letterSpacing: spacing(), ...protectOption() });
    const c = cut(p, width, options());
    return { text: p.text, c, ms: performance.now() - start, width };
  });
  const shown = () => {
    const r = result();
    if (!r) return text();
    return truncated(r.c)
      ? r.text.slice(0, head(r.c)) + ellipsis() + r.text.slice(tail(r.c))
      : r.text;
  };
  let stopMore: (() => void) | undefined;
  onSettled(() => () => stopMore?.());

  return (
    <section>
      <h2>Playground</h2>
      <p>Every option, on one text. Drag the mat's corner, or the page, to resize it.</p>
      <div class="play">
        <div class="controls">
          <label>
            Text
            <select
              onChange={(e) => {
                const preset = PRESETS[Number(e.currentTarget.value)];
                if (preset) setText(preset.text);
              }}
            >
              <For each={PRESETS}>
                {(preset, i) => (
                  <option value={i()} selected={i() === 1}>
                    {preset.label}
                  </option>
                )}
              </For>
            </select>
          </label>
          <textarea
            aria-label="Text to cut"
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
          />
          <fieldset>
            <legend>Shape</legend>
            <label class="inline">
              <input
                type="radio"
                name="shape"
                checked={!lined()}
                onChange={() => setLined(false)}
              />
              One line
            </label>
            <label class="inline">
              <input type="radio" name="shape" checked={lined()} onChange={() => setLined(true)} />
              Lines
            </label>
          </fieldset>
          <Show when={lined()}>
            <label>
              Lines: {lines()}
              <input
                type="range"
                min="1"
                max="8"
                value={lines()}
                onInput={(e) => setLines(Number(e.currentTarget.value))}
              />
            </label>
            <label>
              White space
              <select
                value={whiteSpace()}
                onChange={(e) => setWhiteSpace(e.currentTarget.value as "normal" | "pre-wrap")}
              >
                <option value="normal">normal</option>
                <option value="pre-wrap">pre-wrap</option>
              </select>
            </label>
            <label class="inline">
              <input
                type="checkbox"
                checked={more()}
                onChange={(e) => setMore(e.currentTarget.checked)}
              />
              A "more" button after the text
            </label>
          </Show>
          <fieldset>
            <legend>Ellipsis at</legend>
            <For each={["start", "middle", "end"] as const}>
              {(where) => (
                <label class="inline">
                  <input
                    type="radio"
                    name="at"
                    checked={at() === where}
                    onChange={() => setAt(where)}
                  />
                  {where}
                </label>
              )}
            </For>
          </fieldset>
          <Show when={at() === "middle"}>
            <fieldset>
              <legend>Middle split</legend>
              <For each={["ratio", "tail", "keep"] as const}>
                {(kind) => (
                  <label class="inline">
                    <input
                      type="radio"
                      name="split"
                      checked={split() === kind}
                      onChange={() => setSplit(kind)}
                    />
                    {kind}
                  </label>
                )}
              </For>
            </fieldset>
            <Show when={split() === "ratio"}>
              <label>
                Head's share: {ratio().toFixed(2)}
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={ratio()}
                  onInput={(e) => setRatio(Number(e.currentTarget.value))}
                />
              </label>
            </Show>
            <Show when={split() === "tail"}>
              <label>
                Graphemes kept at the end
                <input
                  type="number"
                  min="0"
                  value={tailCount()}
                  onInput={(e) => setTailCount(Number(e.currentTarget.value))}
                />
              </label>
            </Show>
            <Show when={split() === "keep"}>
              <label>
                Protected match the tail starts at (from 0)
                <input
                  type="number"
                  min="0"
                  value={keep()}
                  onInput={(e) => setKeep(Number(e.currentTarget.value))}
                />
              </label>
            </Show>
          </Show>
          <label>
            Protect matches of
            <input
              type="text"
              value={protect()}
              onInput={(e) => setProtect(e.currentTarget.value)}
            />
            <Show when={pattern() === null}>
              <span class="error">That pattern doesn't compile, so nothing is protected.</span>
            </Show>
          </label>
          <fieldset>
            <legend>Word boundaries</legend>
            <label class="inline">
              <input
                type="radio"
                name="words"
                checked={words() === "on"}
                onChange={() => setWords("on")}
              />
              prefer
            </label>
            <label class="inline">
              <input
                type="radio"
                name="words"
                checked={words() === "px"}
                onChange={() => setWords("px")}
              />
              within px
            </label>
            <label class="inline">
              <input
                type="radio"
                name="words"
                checked={words() === "off"}
                onChange={() => setWords("off")}
              />
              ignore
            </label>
          </fieldset>
          <Show when={words() === "px"}>
            <label>
              Back off at most {wordsPx()} px
              <input
                type="range"
                min="0"
                max="120"
                value={wordsPx()}
                onInput={(e) => setWordsPx(Number(e.currentTarget.value))}
              />
            </label>
          </Show>
          <label class="inline">
            <input
              type="checkbox"
              checked={trim()}
              onChange={(e) => setTrim(e.currentTarget.checked)}
            />
            Trim spaces and ,;: beside the ellipsis
          </label>
          <label>
            Ellipsis
            <input
              type="text"
              value={ellipsis()}
              onInput={(e) => setEllipsis(e.currentTarget.value)}
            />
          </label>
          <label>
            Font size: {size()} px
            <input
              type="range"
              min="10"
              max="40"
              value={size()}
              onInput={(e) => setSize(Number(e.currentTarget.value))}
            />
          </label>
          <label>
            Weight: {weight()}
            <input
              type="range"
              min="100"
              max="900"
              step="100"
              value={weight()}
              onInput={(e) => setWeight(Number(e.currentTarget.value))}
            />
          </label>
          <label>
            Letter spacing: {spacing()} px
            <input
              type="range"
              min="0"
              max="6"
              step="0.5"
              value={spacing()}
              onInput={(e) => setSpacing(Number(e.currentTarget.value))}
            />
          </label>
        </div>
        <div>
          <Mat wide>
            <div
              ref={box.ref}
              class="strip"
              style={{
                font: font(),
                "letter-spacing": `${spacing()}px`,
                "white-space": lined() ? whiteSpace() : "nowrap",
                "overflow-wrap": "break-word",
                overflow: "hidden",
              }}
            >
              {shown()}
              <Show when={lined() && more() && result() && truncated(result()!.c)}>
                <span
                  ref={(e) => {
                    stopMore?.();
                    stopMore = observe(e, setMoreWidth);
                  }}
                  style={{ display: "inline-block" }}
                >
                  <button type="button" class="more">
                    more
                  </button>
                </span>
              </Show>
            </div>
          </Mat>
          <div class="readout">
            <pre class="whole" aria-label="The whole text, with the cut part struck through">
              <Show when={result()} fallback={text()}>
                {(r) => (
                  <>
                    {r().text.slice(0, head(r().c))}
                    <del>{r().text.slice(head(r().c), tail(r().c))}</del>
                    {r().text.slice(tail(r().c))}
                  </>
                )}
              </Show>
            </pre>
            <Show when={result()}>
              {(r) => (
                <dl class="facts">
                  <div>
                    <dt>Width</dt>
                    <dd>{r().width.toFixed(2)} px</dd>
                  </div>
                  <div>
                    <dt>Head</dt>
                    <dd>{head(r().c)}</dd>
                  </div>
                  <div>
                    <dt>Tail</dt>
                    <dd>{tail(r().c)}</dd>
                  </div>
                  <div>
                    <dt>Removed</dt>
                    <dd>
                      {tail(r().c) - head(r().c)} of {r().text.length} units
                    </dd>
                  </div>
                  <div>
                    <dt>Took</dt>
                    <dd>{(r().ms * 1000).toFixed(0)} µs</dd>
                  </div>
                </dl>
              )}
            </Show>
          </div>
        </div>
      </div>
    </section>
  );
}

// 2,000 names and paths, re-cut whenever a column's width changes: the resize path.
function Stress() {
  const firsts = [
    "Ada",
    "Alexandra",
    "Bartholomew",
    "Chen",
    "Dmitri",
    "Eleanor",
    "Fatima",
    "Giovanni",
    "Hiroshi",
    "Ingrid",
  ];
  const lasts = [
    "Lovelace",
    "Richardson-Featherstonehaugh",
    "Wójcik",
    "Okonkwo",
    "Van der Berg",
    "Nakamura",
    "Castellanos",
  ];
  const folders = ["Projects", "atlas", "packages", "renderer", "src", "text", "layout"];
  const rows: Array<{ readonly name: string; readonly path: string }> = [];
  for (let i = 0; i < 2000; i++) {
    let path = "~";
    for (let d = 0; d < 2 + (i % 5); d++) path += `/${folders[(i + d * 3) % folders.length]}`;
    rows.push({
      name: `${firsts[i % firsts.length]} ${lasts[(i * 3) % lasts.length]} ${i}`,
      path: `${path}/file-${i}.test.ts`,
    });
  }
  const font = `14px ${FAMILY}`;
  const [nameWidth, setNameWidth] = createSignal(160);
  const [pathWidth, setPathWidth] = createSignal(220);
  const [fonts, setFonts] = createSignal(0);
  onSettled(() => onFonts(() => setFonts((n) => n + 1)));
  const prepared = createMemo(() => {
    fonts();
    const names: Array<ReturnType<typeof prepare>> = [];
    const paths: Array<ReturnType<typeof prepare>> = [];
    for (const row of rows) {
      names.push(prepare(row.name, font));
      paths.push(prepare(row.path, font, { protect: /[^/]+$/g }));
    }
    return { names, paths };
  });
  // A store keyed by cell, so a resize re-renders only the cells whose text changed.
  const cuts = createProjection(
    (draft) => {
      const { names, paths } = prepared();
      const start = performance.now();
      for (let i = 0; i < names.length; i++) {
        const n = names[i]!;
        const p = paths[i]!;
        draft.shown[i * 2] = toText(n, cut(n, nameWidth(), { at: "middle" }));
        draft.shown[i * 2 + 1] = toText(p, cut(p, pathWidth(), { at: "middle", keep: 0 }));
      }
      draft.ms = performance.now() - start;
    },
    { shown: [] as string[], ms: 0 },
  );
  return (
    <section>
      <h2>Two thousand rows</h2>
      <p>
        Drag a slider: every row's name and path is cut again at the new width, 4,000 cuts. The last
        pass took {cuts.ms.toFixed(1)} ms.
      </p>
      <div class="controls" style={{ "max-width": "420px", "margin-top": "12px" }}>
        <label>
          Name column: {nameWidth()} px
          <input
            type="range"
            min="30"
            max="360"
            value={nameWidth()}
            onInput={(e) => setNameWidth(Number(e.currentTarget.value))}
          />
        </label>
        <label>
          Path column: {pathWidth()} px
          <input
            type="range"
            min="30"
            max="480"
            value={pathWidth()}
            onInput={(e) => setPathWidth(Number(e.currentTarget.value))}
          />
        </label>
      </div>
      <div class="table">
        <table style={{ font }}>
          <colgroup>
            <col style={{ width: "64px" }} />
            <col style={{ width: `${nameWidth() + 20}px` }} />
            <col style={{ width: `${pathWidth() + 20}px` }} />
          </colgroup>
          <thead>
            <tr>
              <th>Row</th>
              <th>Name</th>
              <th>Path</th>
            </tr>
          </thead>
          <tbody>
            <For each={rows}>
              {(_, i) => (
                <tr>
                  <td>{i() + 1}</td>
                  <td>{cuts.shown[i() * 2]}</td>
                  <td>{cuts.shown[i() * 2 + 1]}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function App() {
  return (
    <main>
      <header class="top">
        <div>
          <h1>pretrunc</h1>
          <p>Cut text at its start, middle or end to fit a width, measured before it paints.</p>
        </div>
        <div class="every">
          <label>
            Every frame: {every() === undefined ? "as dragged" : `${every()} px`}
            <input
              type="range"
              min="40"
              max="560"
              value={every() ?? 240}
              onInput={(e) => setEvery(Number(e.currentTarget.value))}
            />
          </label>
        </div>
      </header>
      <Playground />
      <Gallery />
      <Stress />
    </main>
  );
}

render(() => <App />, document.getElementById("root")!);
