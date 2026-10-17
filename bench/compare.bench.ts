import inter from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { clearCache, prepareWithSegments } from "@chenglou/pretext";
import { assert, beforeAll, describe, it } from "@effect/vitest";
import { Array, Order } from "effect";
import { commands } from "vite-plus/test/browser/context";
import { cut, fontFace, forget, prepare, toText } from "../src/index.ts";
import { clamp, prepareLines } from "../src/lines.ts";
import { clampLines, createLabel, findTruncationPoint, layoutMiddle } from "./prior-art.ts";

// pretrunc against the prior art on the same inputs: how long each takes, cold (every
// cache cleared, prepare included) and warm (cutting text already prepared, as a resize
// frame does), and how often its result overflows in this engine's own layout.
const FONT = '15px "Inter Bench"';
const LINE = 20;
const ELLIPSIS = "…";

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
  "Jamal",
  "Katarzyna",
  "Leopold",
  "Maximilian",
  "Nkechi",
  "Olumide",
  "Priyanka",
  "Quentin",
  "Rosalind",
  "Siobhan",
  "Theodora",
  "Ulrich",
  "Valentina",
  "Wilhelmina",
];
const lasts = [
  "Lovelace",
  "Richardson",
  "Featherstonehaugh",
  "Wójcik",
  "Okonkwo",
  "Van der Berg",
  "Nakamura",
  "Fitzgerald",
  "Abernathy",
  "Castellanos",
  "Oyelaran",
  "MacGillivray",
  "Schwarzenegger",
  "Kowalczyk",
];
const folders = ["Projects", "atlas", "packages", "renderer", "src", "text", "layout", "internal"];
const files = ["line-breaker.test.ts", "index.ts", "measurement-engine.ts", "README.md", "a.ts"];
const sentences = [
  "A weekend cabin on the north shore, twenty minutes from the ferry.",
  "Sleeps six, with a wood stove and no reception to speak of.",
  "There's a rowing boat you're welcome to borrow.",
  "Bring boots: the path down to the water is steep.",
  "The nearest shop is back across on the mainland, so stock up before you cross.",
];

// Every input distinct, as rows in a real table are, so no approach gets to reuse a
// whole result from its caches; words repeat across them, as names and folders do.
// Each set numbers its rows from `base`, so a set with a new base has unique words no
// run has measured.
const makeNames = (base: number) =>
  Array.makeBy(5000, (i) => {
    const initial = String.fromCharCode(65 + (i % 26));
    const name = `${firsts[i % firsts.length]} ${initial}. ${lasts[(i * 7) % lasts.length]}`;
    const n = base + i;
    return i % 3 ? `${name} ${n}` : `${name}-${lasts[(i * 11) % lasts.length]} ${n}`;
  });
const makePaths = (base: number) =>
  Array.makeBy(5000, (i) => {
    const depth = 2 + (i % 5);
    const parts = Array.makeBy(depth, (d) => folders[(i + d * 3) % folders.length]!);
    return `~/${Array.join(parts, "/")}/${base + i}-${files[i % files.length]}`;
  });
const makeParagraphs = (base: number) =>
  Array.makeBy(500, (i) =>
    Array.join(
      Array.makeBy(2 + (i % 4), (k) => sentences[(i + k) % sentences.length]!),
      ` (${base + i}) `,
    ),
  );
const names = makeNames(0);
const paths = makePaths(0);
const paragraphs = makeParagraphs(0);

let span: HTMLSpanElement;
let block: HTMLDivElement;
beforeAll(() => {
  span = document.createElement("span");
  span.style.cssText = `font: ${FONT}; white-space: pre`;
  block = document.createElement("div");
  block.style.cssText = `font: ${FONT}; line-height: ${LINE}px; overflow-wrap: break-word`;
  document.body.append(span, block);
  const font = new FontFace("Inter Bench", `url(${inter})`);
  document.fonts.add(font);
  return font.load();
});

const engine = () =>
  /Firefox\//.test(navigator.userAgent)
    ? "firefox"
    : /Chrome\//.test(navigator.userAgent)
      ? "chromium"
      : "webkit";

// The median of 7 timed runs, in milliseconds.
const time = (run: () => void) => {
  const samples = Array.makeBy(7, () => {
    const start = performance.now();
    run();
    return performance.now() - start;
  });
  return Array.sort(samples, Order.Number)[3]!;
};
const cold = () => {
  forget();
  clearCache();
};
// The median of 7 cold runs, each on a set of inputs no run has seen, built before the
// clock starts. Engines keep their own cache of text widths, below anything `forget`
// or `clearCache` reaches, so a run on text an earlier run measured is partly warm:
// rerunning one set favoured whichever approach leaned on the engine's cache (#66).
let sets = 0;
const timeCold = <T>(make: (base: number) => T, run: (inputs: T) => void) => {
  const inputs = Array.makeBy(7, () => make(++sets * 1_000_000));
  const samples = Array.map(inputs, (set) => {
    cold();
    const start = performance.now();
    run(set);
    return performance.now() - start;
  });
  return Array.sort(samples, Order.Number)[3]!;
};
const overflowsOneLine = (texts: ReadonlyArray<string>, width: number) =>
  Array.filter(texts, (text) => {
    span.textContent = text;
    return span.getBoundingClientRect().width > width;
  }).length;
const overflowsLines = (texts: ReadonlyArray<string>, width: number, lines: number) => {
  block.style.width = `${width}px`;
  return Array.filter(texts, (text) => {
    block.textContent = text;
    return Math.round(block.getBoundingClientRect().height / LINE) > lines;
  }).length;
};

interface Row {
  readonly how: string;
  readonly cold: number;
  readonly warm: number | undefined;
  readonly overflows: number;
}
const rows: Array<readonly [string, ReadonlyArray<Row>]> = [];
const report = () => {
  const ms = (n: number | undefined) => (n === undefined ? "n/a" : n.toFixed(1));
  const body = Array.join(
    Array.map(rows, ([scenario, results]) =>
      Array.join(
        [
          `### ${scenario}`,
          "",
          "| | cold ms | warm ms | overflows |",
          "| --- | ---: | ---: | ---: |",
          ...Array.map(
            results,
            (r) => `| ${r.how} | ${ms(r.cold)} | ${ms(r.warm)} | ${r.overflows} |`,
          ),
          "",
        ],
        "\n",
      ),
    ),
    "\n",
  );
  return commands.writeFile(
    `bench/results.${engine()}.md`,
    `# pretrunc against the prior art: ${engine()}\n\n${navigator.userAgent}\n\n${body}`,
  );
};

describe("pretrunc against the prior art", () => {
  it("cuts 5,000 names at the end of one line", () => {
    const width = 120;
    const ew = fontFace(FONT).m(ELLIPSIS);
    const space = fontFace(FONT).m(" ");
    let ours: string[] = [];
    const oursCold = timeCold(makeNames, (names) => {
      ours = Array.map(names, (name) => {
        const p = prepare(name, FONT);
        return toText(p, cut(p, width));
      });
    });
    const prepared = Array.map(names, (name) => prepare(name, FONT));
    const oursWarm = time(() => {
      for (const p of prepared) cut(p, width);
    });

    let demo: string[] = [];
    const demoCold = timeCold(makeNames, (names) => {
      demo = Array.map(names, (name) => {
        const lines = clampLines(prepareWithSegments(name, FONT), width, 1, ew, space);
        return lines[0] === name ? name : `${lines[0] ?? ""}${ELLIPSIS}`;
      });
    });
    const handles = Array.map(names, (name) => prepareWithSegments(name, FONT));
    const demoWarm = time(() => {
      for (const p of handles) clampLines(p, width, 1, ew, space);
    });

    let theirs: string[] = [];
    const theirsCold = timeCold(makeNames, (names) => {
      theirs = Array.map(names, (name) => {
        const at = findTruncationPoint(name, 1, width, FONT, ew);
        return at < name.length ? name.slice(0, at) + ELLIPSIS : name;
      });
    });

    const results: ReadonlyArray<Row> = [
      {
        how: "pretrunc `cut`",
        cold: oursCold,
        warm: oursWarm,
        overflows: overflowsOneLine(ours, width),
      },
      {
        how: "pretext demo `clampLines`",
        cold: demoCold,
        warm: demoWarm,
        overflows: overflowsOneLine(demo, width),
      },
      {
        how: "pretext-truncate `findTruncationPoint`",
        cold: theirsCold,
        warm: undefined,
        overflows: overflowsOneLine(theirs, width),
      },
    ];
    rows.push(["5,000 names, end of one line, 120 px", results]);
    assert.strictEqual(results[0]!.overflows, 0);
  });

  it("cuts 5,000 paths in the middle of one line, keeping the file name", () => {
    const width = 160;
    const ew = fontFace(FONT).m(ELLIPSIS);
    const space = fontFace(FONT).m(" ");
    const options = { at: "middle", keep: 0 } as const;
    let ours: string[] = [];
    const oursCold = timeCold(makePaths, (paths) => {
      ours = Array.map(paths, (path) => {
        const p = prepare(path, FONT, { protect: /[^/]+$/g });
        return toText(p, cut(p, width, options));
      });
    });
    const prepared = Array.map(paths, (path) => prepare(path, FONT, { protect: /[^/]+$/g }));
    const oursWarm = time(() => {
      for (const p of prepared) cut(p, width, options);
    });

    let demo: string[] = [];
    const demoCold = timeCold(makePaths, (paths) => {
      demo = Array.map(paths, (path) =>
        layoutMiddle(createLabel(path, FONT), width, ELLIPSIS, ew, space),
      );
    });
    const labels = Array.map(paths, (path) => createLabel(path, FONT));
    const demoWarm = time(() => {
      for (const label of labels) layoutMiddle(label, width, ELLIPSIS, ew, space);
    });

    const results: ReadonlyArray<Row> = [
      {
        how: "pretrunc `cut`, middle",
        cold: oursCold,
        warm: oursWarm,
        overflows: overflowsOneLine(ours, width),
      },
      {
        how: "pretext demo `layoutMiddle`",
        cold: demoCold,
        warm: demoWarm,
        overflows: overflowsOneLine(demo, width),
      },
    ];
    rows.push(["5,000 paths, middle of one line keeping the file name, 160 px", results]);
    assert.strictEqual(results[0]!.overflows, 0);
  });

  it("clamps 500 paragraphs to 3 lines", () => {
    const width = 260;
    const ew = fontFace(FONT).m(ELLIPSIS);
    const space = fontFace(FONT).m(" ");
    let ours: string[] = [];
    const oursCold = timeCold(makeParagraphs, (paragraphs) => {
      ours = Array.map(paragraphs, (text) => {
        const p = prepareLines(text, FONT);
        return toText(p, clamp(p, width, 3));
      });
    });
    const prepared = Array.map(paragraphs, (text) => prepareLines(text, FONT));
    const oursWarm = time(() => {
      for (const p of prepared) clamp(p, width, 3);
    });
    // Start and middle clamps search tail starts on the real layout; nothing in the prior
    // art does either, so they're pretrunc's alone.
    const elsewhere = (at: "start" | "middle"): Row => {
      let kept: string[] = [];
      const coldMs = timeCold(makeParagraphs, (paragraphs) => {
        kept = Array.map(paragraphs, (text) => {
          const p = prepareLines(text, FONT);
          return toText(p, clamp(p, width, 3, { at }));
        });
      });
      const ready = Array.map(paragraphs, (text) => prepareLines(text, FONT));
      for (const p of ready) clamp(p, width, 3, { at });
      const warmMs = time(() => {
        for (const p of ready) clamp(p, width, 3, { at });
      });
      return {
        how: `pretrunc \`clamp\`, ${at}`,
        cold: coldMs,
        warm: warmMs,
        overflows: overflowsLines(kept, width, 3),
      };
    };
    const middle = elsewhere("middle");
    const start = elsewhere("start");

    const joined = (lines: ReadonlyArray<string>, text: string) => {
      const kept = Array.join(lines, "");
      return kept.length >= text.length ? text : kept + ELLIPSIS;
    };
    let demo: string[] = [];
    const demoCold = timeCold(makeParagraphs, (paragraphs) => {
      demo = Array.map(paragraphs, (text) =>
        joined(clampLines(prepareWithSegments(text, FONT), width, 3, ew, space), text),
      );
    });
    const handles = Array.map(paragraphs, (text) => prepareWithSegments(text, FONT));
    const demoWarm = time(() => {
      for (const p of handles) clampLines(p, width, 3, ew, space);
    });

    let theirs: string[] = [];
    const theirsCold = timeCold(makeParagraphs, (paragraphs) => {
      theirs = Array.map(paragraphs, (text) => {
        const at = findTruncationPoint(text, 3, width, FONT, ew);
        return at < text.length ? text.slice(0, at) + ELLIPSIS : text;
      });
    });

    const results: ReadonlyArray<Row> = [
      {
        how: "pretrunc `clamp`",
        cold: oursCold,
        warm: oursWarm,
        overflows: overflowsLines(ours, width, 3),
      },
      {
        how: "pretext demo `clampLines`",
        cold: demoCold,
        warm: demoWarm,
        overflows: overflowsLines(demo, width, 3),
      },
      {
        how: "pretext-truncate `findTruncationPoint`",
        cold: theirsCold,
        warm: undefined,
        overflows: overflowsLines(theirs, width, 3),
      },
    ];
    rows.push(["500 paragraphs, end of 3 lines, 260 px", results]);
    rows.push(["500 paragraphs, start or middle of 3 lines, 260 px", [start, middle]]);
    assert.strictEqual(results[0]!.overflows, 0);
    assert.strictEqual(start.overflows + middle.overflows, 0);
    return report();
  });
});
