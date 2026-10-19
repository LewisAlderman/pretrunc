#!/usr/bin/env node
// `pretrunc-metrics <font file> <out.ts> [family]`: writes a font's metrics table as a
// module, for `tableFace` from pretrunc/metrics. It ships built in dist/ as the package's
// command, and fontkit, which reads the font, is an optional peer: only this needs it.
// oxlint-disable-next-line effecttsgo/node-builtin-import -- a CLI writing one file; no Effect platform package for that
import { writeFileSync } from "node:fs";

const [file, out, family] = process.argv.slice(2);
// metrics.ts imports fontkit, which a project installs only to make tables.
const loaded = file && out ? await import("./metrics.ts").catch(() => undefined) : undefined;
if (!file || !out) {
  process.stderr.write("Usage: pretrunc-metrics <font file> <out.ts> [family]\n");
  process.exitCode = 1;
} else if (!loaded) {
  process.stderr.write(
    "pretrunc-metrics reads fonts with fontkit: install it, as `pnpm add -D fontkit`.\n",
  );
  process.exitCode = 1;
} else {
  const metrics = loaded.readMetrics(file, family);
  writeFileSync(
    out,
    `// Written by pretrunc-metrics from ${file.split("/").pop()}; don't edit.\n` +
      `import type { Metrics } from "pretrunc/metrics";\n\n` +
      `export default ${JSON.stringify(metrics)} satisfies Metrics;\n`,
  );
  process.stdout.write(
    `${metrics.family}: ${Array.from(metrics.chars).length} characters, ${metrics.kerning.length / 3} kerned pairs\n`,
  );
}
