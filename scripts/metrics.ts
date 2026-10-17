// Reads a font file and writes the widths pretrunc measures with where there is no
// canvas: `vp run metrics:pretrunc <font file> <out.ts> [family]`. Every character the
// font maps, and every pair of them the font kerns, laid out with fontkit, which applies
// the font's GPOS kerning. A variable font is read at its default instance. Plain loops,
// not effect, since pretrunc carries no dependencies.
// oxlint-disable-next-line effecttsgo/node-builtin-import -- a build-time CLI writing one file; no Effect platform package for that
import { writeFileSync } from "node:fs";
import * as fontkit from "fontkit";
import type { Metrics } from "../src/metrics.ts";

/** The metrics of the font at `file`, for the characters it maps (or only those in `only`). */
export const readMetrics = (file: string, family?: string, only?: string): Metrics => {
  const font = fontkit.openSync(file) as fontkit.Font;
  const width = (text: string) => {
    let sum = 0;
    for (const position of font.layout(text).positions) sum += position.xAdvance;
    return sum;
  };
  const codes: number[] = [];
  for (const code of only ? Array.from(only, (c) => c.codePointAt(0)!) : font.characterSet) {
    if (code >= 32 && font.hasGlyphForCodePoint(code)) codes.push(code);
  }
  codes.sort((a, b) => a - b);
  const chars = String.fromCodePoint(...codes);
  const glyphs = Array.from(chars);
  const alone = Array.from(glyphs, width);
  const kerns = new Map<string, number>();
  const kerning: number[] = [];
  for (let i = 0; i < glyphs.length; i++) {
    for (let j = 0; j < glyphs.length; j++) {
      // Against each glyph alone, so kerning never takes back a widened advance.
      const kern = width(glyphs[i]! + glyphs[j]!) - alone[i]! - alone[j]!;
      if (kern) {
        kerning.push(i, j, kern);
        kerns.set(glyphs[i]! + glyphs[j]!, kern);
      }
    }
  }
  // Contextual rules reach past a pair, as Inter spaces a colon out between digits, and
  // can make text wider than its pairs say. So each character is laid out between each
  // two of these neighbours, and whatever the three take beyond their pairs goes on its
  // advance: the table is then never narrower than an engine lays the text out, which is
  // what a cut made with it needs.
  const neighbours: string[] = [];
  for (const c of "0 9A Za z(-:.,") if (glyphs.includes(c)) neighbours.push(c);
  const own = (c: string) => alone[glyphs.indexOf(c)]!;
  const pairs = (l: string, c: string, r: string) =>
    own(l) + own(c) + own(r) + (kerns.get(l + c) ?? 0) + (kerns.get(c + r) ?? 0);
  const advances = Array.from(glyphs, (glyph, i) => {
    let widest = alone[i]!;
    for (const before of neighbours) {
      for (const after of neighbours) {
        const extra = width(before + glyph + after) - pairs(before, glyph, after);
        widest = Math.max(widest, alone[i]! + extra);
      }
    }
    return widest;
  });
  return {
    family: family ?? font.familyName,
    unitsPerEm: font.unitsPerEm,
    chars,
    advances,
    kerning,
  };
};

const [file, out, family] = process.argv.slice(2);
if (import.meta.main && file && out) {
  const metrics = readMetrics(file, family);
  writeFileSync(
    out,
    `// Written by packages/pretrunc/scripts/metrics.ts from ${file.split("/").pop()}; don't edit.\n` +
      `import type { Metrics } from "pretrunc/metrics";\n\n` +
      `export default ${JSON.stringify(metrics)} satisfies Metrics;\n`,
  );
  process.stdout.write(
    `${metrics.family}: ${Array.from(metrics.chars).length} characters, ${metrics.kerning.length / 3} kerned pairs\n`,
  );
}
