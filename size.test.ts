import { assert, describe, it } from "@effect/vitest";
import { Array, Effect, Record } from "effect";
import solid from "@solidjs/vite-plugin";
import { brotliCompressSync } from "node:zlib";
import { build } from "vite-plus";

// Minified and brotli-compressed bytes per entry, as a bundler ships them. Every entry
// but the core counts only its own bytes: pretrunc's other modules, Solid and pretext
// are left out.
const budgets = {
  // 1,024 was the first aim; every option the design picked cost 1.4 KB, the speed work
  // against the benchmark (bench/) 1.8 KB, and letter spacing, tabs and cutting from a
  // range of a longer text 2.1 KB.
  "src/index.ts": 2464,
  "src/dom.ts": 400,
  // 600 was a guess before it was built; both renderings, width tracking and letter
  // spacing cost 980.
  "src/solid.tsx": 1120,
  // 1,024 held until pre-wrap, letter spacing and boxes for a width-only ellipsis and
  // the room after the text: 1.5 KB; tables of tail starts, kept per text, 1.7 KB.
  "src/lines.ts": 1728,
  "src/solid-lines.tsx": 1024,
  "src/metrics.ts": 600,
};
const packages = /^(solid-js|@solidjs\/|@chenglou\/)/;
const siblings = /^\.\/(cut|face|dom|lines|metrics|solid)\.tsx?$/;

const bundle = (entry: string) =>
  Effect.promise(() =>
    build({
      configFile: false,
      logLevel: "silent",
      root: import.meta.dirname,
      plugins: [solid()],
      build: {
        write: false,
        minify: true,
        lib: { entry, formats: ["es"], fileName: "entry" },
        // Library mode keeps ES output formatted; a consumer's bundler would not.
        rolldownOptions: {
          external: (id) => packages.test(id) || (entry !== "src/index.ts" && siblings.test(id)),
          output: { minify: true },
        },
      },
    }),
  ).pipe(
    Effect.map((result) => {
      const outputs = Array.isArray(result) ? result : [result];
      const output = outputs[0];
      if (!output || !("output" in output)) throw new Error("no bundle");
      const chunk = output.output[0];
      return brotliCompressSync(chunk.code).length;
    }),
  );

describe("size", () => {
  for (const [entry, budget] of Record.toEntries(budgets)) {
    it.effect(`${entry} ships in ${budget} bytes or less`, () =>
      Effect.gen(function* () {
        const bytes = yield* bundle(entry);
        assert.isAtMost(bytes, budget, `${entry} is ${bytes} bytes`);
      }),
    );
  }
});
