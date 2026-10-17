import { assert, describe, it } from "@effect/vitest";
import { Arbitrary, Array, Schema } from "effect";
import { face } from "./face.ts";
import { cut, head, prepare, type Prepared, tail, toText, truncated } from "./cut.ts";

// A font with known metrics. Pair kerning, including pairs with the ellipsis on both
// sides, is what canvas does for most Latin text. `shaped` adds two effects no pair
// model reproduces: an `ffi` ligature that narrows and an `AVA` run that widens.
const advances: Record<string, number> = { " ": 4, i: 3, l: 3, f: 4, "…": 12, "́": 0 };
const kerning: Record<string, number> = {
  AV: -2,
  VA: -2,
  To: -1.5,
  "o…": -0.75,
  "…T": 1,
  "f…": 0.5,
};
const advance = (c: string) => advances[c] ?? (c >= "A" && c <= "Z" ? 10 : c >= "̀" ? 9 : 7);
// Which kerning a layout applies: all of it, none (WebKit under letter spacing), or
// only the kerning that widens, the envelope of the two.
type Kerned = "all" | "none" | "widening";
const metrics =
  (shaped: boolean, kerned: Kerned = "all") =>
  (s: string) => {
    let w = 0;
    for (let i = 0; i < s.length; i++) {
      const k = i ? (kerning[s.slice(i - 1, i + 1)] ?? 0) : 0;
      w += advance(s[i]!) + (kerned === "all" ? k : kerned === "widening" ? Math.max(0, k) : 0);
    }
    if (shaped) w += -3 * s.split("ffi").length + 3 + 2.5 * s.split("AVA").length - 2.5;
    return w;
  };
const plain = face(metrics(false));
const shaped = face(metrics(true));

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const boundaries = (s: string) => [
  ...Array.map(Array.fromIterable(segmenter.segment(s)), (g) => g.index),
  s.length,
];

// Pieces that reach every path in the cut: pair kerning, ellipsis kerning, the shaped
// runs, collapsing white space, breaks, trimmed punctuation, multi-unit graphemes, and
// words long enough that a cut inside one is far from a boundary.
const piece = Arbitrary.schema(
  Schema.Literals([
    "a",
    "o",
    "f",
    "i",
    "l",
    "A",
    "V",
    "T",
    "W",
    " ",
    "  ",
    "\t",
    "-",
    "/",
    ",",
    ".",
    "ffi",
    "Wolfgangamadeus",
    "Featherstonehaugh",
    "AVA",
    "To",
    "é",
    "é", // e and a combining acute: two units, one grapheme
    "😀",
    "👍🏽",
    "中",
  ]),
);
const text = Arbitrary.map(Arbitrary.array(piece, { maxLength: 30 }), Array.join(""));
// A width as a share of the text's own, so most cases cut somewhere inside it.
const share = Arbitrary.map(
  Arbitrary.schema(Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 120 })))),
  (q) => q / 100,
);
const widthFor = (p: Prepared, q: number) => Math.round(metrics(false)(p.text) * q * 4) / 4;
const runs = { arbitrary: { runs: 500 } };
const at = Arbitrary.schema(Schema.Literals(["start", "middle", "end"]));
const ratio = Arbitrary.schema(Schema.Literals([0, 0.3, 0.5, 1]));
const flag = Arbitrary.schema(Schema.Boolean);
// CSS letter spacing after every UTF-16 unit, the last included: never less than any
// engine paints. Under it Chrome still kerns and WebKit doesn't, so a cut paints as
// the wider of the two, and is as tight as it can be against the widening envelope.
const spacing = Arbitrary.schema(Schema.Literals([0, 0.5, 2]));
const spaced = (text: string, shapedFont: boolean, by: number) =>
  by
    ? Math.max(metrics(shapedFont)(text), metrics(shapedFont, "none")(text)) + by * text.length
    : metrics(shapedFont)(text);
const envelope = (text: string, by: number) =>
  metrics(false, by ? "widening" : "all")(text) + by * text.length;

const painted = (p: Prepared, c: ReturnType<typeof cut>, shapedFont: boolean, by = 0) =>
  spaced(toText(p, c), shapedFont, by);
const nothingKept = (p: Prepared, c: ReturnType<typeof cut>) =>
  head(c) === 0 && tail(c) === p.text.length;

describe("cut", () => {
  it.prop(
    "never paints wider than the width, whatever the options and font",
    [text, share, at, ratio, flag, flag, flag, spacing],
    ([s, q, where, split, words, trim, isShaped, by]) => {
      const p = prepare(s, isShaped ? shaped : plain, { letterSpacing: by });
      const width = widthFor(p, q);
      const c = cut(p, width, { at: where, ratio: split, words, trim });
      assert.isTrue(painted(p, c, isShaped, by) <= width || nothingKept(p, c));
    },
    runs,
  );

  it.prop(
    "gives back text that fits whole, untouched",
    [text, share, at],
    ([s, q, where]) => {
      const p = prepare(s, plain);
      const width = widthFor(p, q);
      const c = cut(p, width, { at: where });
      assert.strictEqual(!truncated(c), p.text === "" || metrics(false)(p.text) <= width - 1 / 64);
    },
    runs,
  );

  // Only where widths add up: a ligature can make a longer cut paint narrower, and
  // no search over a width that isn't monotone can promise the tightest cut.
  it.prop(
    "keeps as much as fits: one more grapheme on a cut side overflows",
    [text, share, at, ratio, spacing],
    ([s, q, where, split, by]) => {
      const p = prepare(s, plain, { letterSpacing: by });
      const width = widthFor(p, q);
      const c = cut(p, width, { at: where, ratio: split, words: false, trim: false });
      if (!truncated(c)) return;
      const b = boundaries(p.text);
      const h = b.indexOf(head(c));
      const t = b.indexOf(tail(c));
      const input = JSON.stringify([p.text, width, where, split, toText(p, c)]);
      if (where !== "middle") {
        const fits = (hh: number, tt: number) =>
          hh <= tt &&
          envelope(p.text.slice(0, b[hh]) + "…" + p.text.slice(b[tt]), by) <= width - 1 / 64;
        if (where === "end") assert.isFalse(fits(h + 1, t), input);
        else assert.isFalse(t > 0 && fits(h, t - 1), input);
        return;
      }
      // In the middle each side fills its own share of the room, the kerning across to
      // the ellipsis included.
      const e = envelope("…", by);
      const room = width - 1 / 64 - e;
      const headSide = (hh: number) => envelope(p.text.slice(0, b[hh]) + "…", by) - e;
      const tailSide = (tt: number) => envelope("…" + p.text.slice(b[tt]), by) - e;
      if (h + 1 <= t) assert.isAbove(headSide(h + 1), split * room, input);
      if (t - 1 >= h && t > 0) assert.isAbove(tailSide(t - 1), (1 - split) * room, input);
    },
    runs,
  );

  // A drag moves the width a fraction of a pixel at a time, so this walks 20 px in
  // quarter-pixel steps: a rule that scales with the width can flip while the cut point
  // stays on one grapheme. Such a flip needs word backoff and a break in a window a
  // quarter of a grapheme wide, so this property always backs off and runs more cases
  // than the rest.
  it.prop(
    "moves each side one way as the width grows: the head never gives up, nor the tail",
    [text, share, at, ratio, flag, spacing],
    ([s, q, where, split, trim, by]) => {
      const p = prepare(s, plain, { letterSpacing: by });
      const options = { at: where, ratio: split, trim };
      let last = cut(p, widthFor(p, q), options);
      for (let i = 1; i <= 80; i++) {
        const width = widthFor(p, q) + i / 4;
        const next = cut(p, width, options);
        if (!truncated(next)) break;
        if (head(next) < head(last) || tail(next) > tail(last)) {
          assert.fail(JSON.stringify([p.text, width, where, split, trim, by]));
        }
        last = next;
      }
    },
    { arbitrary: { runs: 3000 } },
  );

  // Each search starts where the last one on the text ended, which must never show.
  it.prop(
    "cuts the same whatever the text was cut at before",
    [text, Arbitrary.array(share, { minLength: 2, maxLength: 8 }), at, ratio, flag, flag, spacing],
    ([s, shares, where, split, words, trim, by]) => {
      const options = { at: where, ratio: split, words, trim };
      const p = prepare(s, plain, { letterSpacing: by });
      for (const q of shares) {
        const width = widthFor(p, q);
        const fresh = prepare(s, plain, { letterSpacing: by });
        assert.strictEqual(
          cut(p, width, options),
          cut(fresh, width, options),
          JSON.stringify([s, shares, width]),
        );
      }
    },
    runs,
  );

  it.prop(
    "keeps something in a shaped font whenever one grapheme and the ellipsis fit",
    [text, share, Arbitrary.schema(Schema.Literals(["start", "end"]))],
    ([s, q, where]) => {
      const p = prepare(s, shaped);
      const width = widthFor(p, q);
      const c = cut(p, width, { at: where, words: false, trim: false });
      const b = boundaries(p.text);
      const one =
        where === "end" ? p.text.slice(0, b[1]) + "…" : "…" + p.text.slice(b[b.length - 2]);
      if (truncated(c) && p.text && metrics(true)(one) <= width - 1 / 64) {
        assert.isFalse(nothingKept(p, c), JSON.stringify([p.text, width, where]));
      }
    },
    runs,
  );

  it.prop(
    "keeps no less at a wider width",
    [text, share, share, Arbitrary.schema(Schema.Literals(["start", "end"]))],
    ([s, q1, q2, where]) => {
      const p = prepare(s, plain);
      const kept = (q: number) => {
        const c = cut(p, widthFor(p, q), { at: where, words: false });
        return head(c) + p.text.length - tail(c);
      };
      assert.isTrue(kept(Math.min(q1, q2)) <= kept(Math.max(q1, q2)));
    },
    runs,
  );

  it.prop(
    "cuts only between graphemes",
    [text, share, at, flag],
    ([s, q, where, isShaped]) => {
      const p = prepare(s, isShaped ? shaped : plain);
      const c = cut(p, widthFor(p, q), { at: where });
      const b = boundaries(p.text);
      assert.isTrue(b.includes(head(c)) && b.includes(tail(c)));
    },
    runs,
  );

  it.prop(
    "keeps a protected match whole or drops it whole",
    [text, share, at],
    ([s, q, where]) => {
      const p = prepare(s, plain, { protect: /[A-Z]+|中+/g });
      const c = cut(p, widthFor(p, q), { at: where });
      for (const m of p.text.matchAll(/[A-Z]+|中+/g)) {
        const end = m.index + m[0].length;
        assert.isFalse(m.index < head(c) && head(c) < end);
        assert.isFalse(m.index < tail(c) && tail(c) < end);
      }
    },
    runs,
  );
});

describe("cut examples", () => {
  const p = (s: string, protect?: RegExp) => prepare(s, plain, protect ? { protect } : {});

  it("collapses white space the way the page paints it", () => {
    assert.strictEqual(p("  Ada \n\t Lovelace ").text, "Ada Lovelace");
  });

  it("backs off to the last word at the end", () => {
    const name = p("Alexandra Richardson");
    // "Alexandra Ri…" is 91 px. Backing off over "Ri" drops 13 px, inside a quarter of the head.
    assert.strictEqual(toText(name, cut(name, 92)), "Alexandra…");
    assert.strictEqual(toText(name, cut(name, 92, { words: false })), "Alexandra Ri…");
  });

  it("drops a comma beside the ellipsis", () => {
    const list = p("ooo, ooo");
    // "ooo,…" is 40 px.
    assert.strictEqual(toText(list, cut(list, 41, { words: false })), "ooo…");
    assert.strictEqual(toText(list, cut(list, 41, { words: false, trim: false })), "ooo,…");
    // "…, ooo" is 44 px, so the tail starts at the space, which goes.
    assert.strictEqual(toText(list, cut(list, 41, { at: "start", words: false })), "…ooo");
  });

  it("keeps a path's file name in the middle", () => {
    const path = p("~/Projects/atlas/src/layout.ts", /[^/]+$/g);
    const c = cut(path, 140, { at: "middle", keep: 0 });
    assert.isTrue(toText(path, c).endsWith("…layout.ts"));
  });

  it("keeps a protected file name wider than the tail's share while it fits, then gives its room to the head", () => {
    const path = p("~/Projects/atlas/src/line-breaker.test.ts", /[^/]+$/g);
    // "line-breaker.test.ts" is 132 px, past half of the 188 px beside the ellipsis.
    const c = cut(path, 200, { at: "middle" });
    assert.isTrue(toText(path, c).endsWith("…line-breaker.test.ts"));
    assert.isTrue(toText(path, c).startsWith("~/"));
    // At 120 px it doesn't fit, so it goes whole and the head takes all the room.
    assert.strictEqual(
      toText(path, cut(path, 120, { at: "middle" })),
      toText(path, cut(path, 120, { at: "end" })),
    );
  });

  it("keeps the last graphemes asked for", () => {
    const id = p("aaaaaaaaaaaaaaaaaaaa1234");
    assert.isTrue(toText(id, cut(id, 80, { at: "middle", tail: 4 })).endsWith("…1234"));
  });

  it("counts the kerning beside the ellipsis", () => {
    // "ooo…" is 32.25 px with "o…" kerned 0.75 px tighter, so it fits 32.5 px, though
    // three o's and an unkerned ellipsis wouldn't.
    const os = p("oooooo");
    assert.strictEqual(toText(os, cut(os, 32.5, { words: false })), "ooo…");
  });

  it("leaves room for an element by its width", () => {
    const words = p("aaaaaaaaaa");
    assert.strictEqual(toText(words, cut(words, 50, { ellipsis: 20 }), ""), "aaaa");
  });
});
