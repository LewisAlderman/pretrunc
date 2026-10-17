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
    ],
  },
});
