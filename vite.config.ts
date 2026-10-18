import { effectNative, strict as effectStrict } from "@effect/tsgo/oxlint-presets";
import solid from "@solidjs/vite-plugin";
import solidV2 from "eslint-plugin-solid/configs/v2";
import { defaultExclude, defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

// Files we don't author: the build's output, and the bench results `vp run bench`
// writes on every run.
const notOurs = ["dist/**", "bench/results.*.md"];

const engines = playwright();
// Fresh per project: Vitest writes each project's name onto its instances.
const browsers = (webkit = true) => [
  { browser: "chromium" as const },
  { browser: "firefox" as const },
  ...(webkit ? [{ browser: "webkit" as const }] : []),
];

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  run: {
    tasks: {
      // Node and all three engines; the bench stays out.
      test: { command: "vp test run --project node --project browser", cache: false },
      // Timings against the prior art, written to bench/results.<engine>.md. One engine
      // at a time: run side by side, they take each other's CPU.
      bench: {
        command: [
          "BENCH=1 vp test run --project 'bench (chromium)'",
          "BENCH=1 vp test run --project 'bench (firefox)'",
          "BENCH=1 vp test run --project 'bench (webkit)'",
        ],
        cache: false,
      },
      // The demo page, with hot reload, on localhost:3100.
      demo: { command: "vp dev demo --config vite.config.ts --port 3100", cache: false },
      // A font's widths where there is no canvas: `vp run metrics <font file> <out.ts> [family]`.
      metrics: { command: "node scripts/metrics.ts", cache: false },
      // dist/: the JavaScript from `vp build`, then the declarations from tsc, pointed at
      // the built files.
      build: {
        command: ["vp build", "tsc -p tsconfig.build.json", "node scripts/declarations.ts"],
        cache: false,
      },
    },
  },
  fmt: {
    ignorePatterns: notOurs,
  },
  lint: {
    // Effect rules come from `effect-tsgo patch --oxlint` (`vp run setup`). Without the
    // patch, oxlint fails on the unknown `effecttsgo` plugin.
    extends: [effectStrict, effectNative],
    plugins: ["unicorn", "typescript", "oxc", "vitest"],
    ignorePatterns: notOurs,
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }, "eslint-plugin-solid"],
    settings: solidV2.settings,
    rules: {
      ...solidV2.rules,
      "vite-plus/prefer-vite-plus-imports": "error",
      "vitest/no-focused-tests": "error",
      "vitest/no-disabled-tests": "error",
      "vitest/expect-expect": "error",
    },
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        // Browser-mode locators and user events are Promise APIs, so these tests are
        // async functions by necessity.
        files: ["**/*.browser.test.tsx"],
        rules: { "effecttsgo/async-function": "off" },
      },
      {
        // The bench project loads only when `vp run bench` asks for it.
        files: ["vite.config.ts"],
        rules: { "effecttsgo/process-env": "off" },
      },
    ],
  },
  plugins: [solid()],
  build: {
    target: "esnext",
    minify: false,
    sourcemap: true,
    lib: {
      entry: {
        index: "src/index.ts",
        dom: "src/dom.ts",
        lines: "src/lines.ts",
        metrics: "src/metrics.ts",
        solid: "src/solid.tsx",
        "solid-lines": "src/solid-lines.tsx",
      },
      formats: ["es"],
      fileName: (_format, name) => `${name}.js`,
    },
    rolldownOptions: {
      external: [/^solid-js/, /^@solidjs\//, /^@chenglou\/pretext/],
    },
  },
  test: {
    exclude: [...defaultExclude, "dist/**"],
    projects: [
      {
        extends: true,
        // Plain Node: the Solid plugin would default it to jsdom, and these tests stand a
        // fake canvas up themselves.
        test: {
          name: "node",
          environment: "node",
          include: ["**/*.test.ts"],
          exclude: ["**/*.browser.test.ts"],
        },
      },
      {
        extends: true,
        // Cuts are checked against each engine's own text layout. WebKit on Linux is its
        // own port, shaping with HarfBuzz over FreeType where Safari uses CoreText, and the
        // WebKit layout pretrunc works around is the same in both, so it runs on macOS only.
        test: {
          name: "browser",
          include: ["**/*.browser.test.{ts,tsx}"],
          browser: {
            enabled: true,
            headless: true,
            provider: engines,
            instances: browsers(process.platform !== "linux"),
          },
        },
      },
      ...(process.env.BENCH
        ? [
            {
              extends: true as const,
              test: {
                name: "bench",
                include: ["bench/**/*.bench.ts"],
                testTimeout: 300_000,
                browser: {
                  enabled: true,
                  headless: true,
                  provider: engines,
                  instances: browsers(),
                },
              },
            },
          ]
        : []),
    ],
  },
});
