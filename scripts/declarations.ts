// Points dist/'s declarations at the built files: tsc rewrites relative `.ts` and
// `.tsx` imports in the JavaScript it emits, but not in declarations, so dist/cut.d.ts
// would import "./face.ts", which dist/ doesn't have. The last step of `vp run build`.
// oxlint-disable-next-line effecttsgo/node-builtin-import -- a build step rewriting a few files; no Effect platform package for that
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../dist/", import.meta.url);
for (const name of readdirSync(dir)) {
  if (!name.endsWith(".d.ts")) continue;
  const file = new URL(name, dir);
  const text = readFileSync(file, "utf8");
  const fixed = text.replace(/(from\s+["']\.{1,2}\/[^"']+)\.tsx?(["'])/g, "$1.js$2");
  if (fixed !== text) writeFileSync(file, fixed);
}
