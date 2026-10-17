import { assert, describe, it } from "@effect/vitest";
import { Array, Effect, Record } from "effect";
import solid from "@solidjs/vite-plugin";
import { brotliCompressSync } from "node:zlib";
import { build } from "vite-plus";

// Minified and brotli-compressed bytes per entry, as a bundler ships them. Every entry
// but the core counts only its own bytes: pretrunc's other modules, Solid and pretext
// are left out.
const budgets = {
  // 1,024 was the first aim; every option the design picked costs 1.4 KB.
  "src/index.ts": 1536,
  "src/dom.ts": 400,
  // 600 was a guess before it was built; both renderings and width tracking cost 880.
  "src/solid.tsx": 1024,
  "src/lines.ts": 1024,
  "src/solid-lines.tsx": 1024,
};
const packages = /^(solid-js|@solidjs\/|@chenglou\/)/;
const siblings = /^\.\/(cut|face|dom|lines|solid)\.tsx?$/;

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
