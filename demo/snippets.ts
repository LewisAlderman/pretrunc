// `virtual:snippets`: each file in demo/snippets, highlighted with types and JSDoc on
// hover. Twoslash type-checks every snippet against src/, so an API change that breaks
// one fails the demo. It needs TypeScript's JavaScript API, which TypeScript 7 doesn't
// have yet, so it runs 5.9 under an alias, for the demo only.
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Record } from "effect";
import type { Plugin } from "vite-plus";

const id = "virtual:snippets";
const resolved = `\0${id}`;

// The paths `pretrunc/…` imports take inside this repo, at the source.
const entries = {
  pretrunc: "src/index.ts",
  "pretrunc/dom": "src/dom.ts",
  "pretrunc/lines": "src/lines.ts",
  "pretrunc/metrics": "src/metrics.ts",
  "pretrunc/solid": "src/solid.tsx",
  "pretrunc/solid/lines": "src/solid-lines.tsx",
  "pretrunc/react": "src/react.ts",
  "pretrunc/react/lines": "src/react-lines.ts",
};

const highlighter = async (root: string) => {
  const [{ codeToHtml }, { createTransformerFactory, rendererRich }, { createTwoslasher }, ts] =
    await Promise.all([
      import("shiki"),
      import("@shikijs/twoslash"),
      import("twoslash"),
      import("typescript-twoslash").then((m) => m.default),
    ]);
  const tsLibDirectory = dirname(
    createRequire(import.meta.url).resolve("typescript-twoslash/lib/lib.d.ts"),
  );
  const transformer = createTransformerFactory(
    // Typed against the repo's `typescript`, 7, whose package holds only its version.
    createTwoslasher({ tsModule: ts as never, tsLibDirectory }),
    rendererRich(),
  )({
    twoslashOptions: {
      compilerOptions: {
        jsx: ts.JsxEmit.Preserve,
        jsxImportSource: "@solidjs/web",
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        customConditions: ["solid"],
        allowImportingTsExtensions: true,
        noEmit: true,
        strict: true,
        exactOptionalPropertyTypes: true,
        skipLibCheck: true,
        lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
        baseUrl: root,
        paths: Record.map(entries, (file) => [`./${file}`]),
      },
    },
  });
  return (code: string) =>
    codeToHtml(code, { lang: "tsx", theme: "github-dark", transformers: [transformer] });
};

// The formatter ends a snippet's top-level JSX with a semicolon, which an example reads
// better without and the JSX doesn't need.
const unended = (code: string) => code.replace(/^(<.*>|\/>|<\/[\w.]*>);$/gm, "$1");

/**
 * Each file in demo/snippets, by name less its extension, as highlighted HTML. Twoslash
 * throws on a snippet that doesn't type-check, naming it and its errors.
 */
export const renderSnippets = async (
  root: string,
  read: (path: string) => void = () => {},
): Promise<Record<string, string>> => {
  const dir = join(root, "demo/snippets");
  const html = await (highlighters.get(root) ??
    highlighters.set(root, highlighter(root)).get(root)!);
  const out: Record<string, string> = {};
  for (const file of readdirSync(dir).sort()) {
    const path = join(dir, file);
    read(path);
    try {
      out[file.replace(/\.tsx?$/, "")] = await html(unended(readFileSync(path, "utf8")));
    } catch (error) {
      throw new Error(`demo/snippets/${file}: ${String(error)}`, { cause: error });
    }
  }
  return out;
};

const highlighters = new Map<string, ReturnType<typeof highlighter>>();

/** Serves demo/snippets as `virtual:snippets`. */
export const snippets = (root: string): Plugin => ({
  name: "pretrunc-snippets",
  resolveId: (source) => (source === id ? resolved : undefined),
  async load(module) {
    if (module !== resolved) return undefined;
    const out = await renderSnippets(root, (path) => this.addWatchFile(path));
    return `export default ${JSON.stringify(out)};`;
  },
  handleHotUpdate({ file, server }) {
    if (!file.startsWith(join(root, "demo/snippets")) && !file.startsWith(join(root, "src"))) {
      return undefined;
    }
    const module = server.moduleGraph.getModuleById(resolved);
    if (module) server.moduleGraph.invalidateModule(module);
    return undefined;
  },
});
