import solid from "@solidjs/vite-plugin";
import { defaultExclude, defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

// pretrunc tests apart from the app: `vp run test:pretrunc` from the repo root, or
// `vp test` here.
export default defineConfig({
  plugins: [solid()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "pretrunc:node",
          include: ["**/*.test.ts"],
          exclude: [...defaultExclude, "**/*.browser.test.ts"],
        },
      },
      {
        extends: true,
        // Cuts are checked against each engine's own text layout.
        test: {
          name: "pretrunc:browser",
          include: ["**/*.browser.test.{ts,tsx}"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }],
          },
        },
      },
      {
        extends: true,
        // Timings against the prior art, written to bench/results.<engine>.md. Run on
        // purpose only (`vp run bench:pretrunc`): `test:pretrunc` names the other two.
        test: {
          name: "pretrunc:bench",
          include: ["bench/**/*.bench.ts"],
          testTimeout: 300_000,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }],
          },
        },
      },
    ],
  },
});
