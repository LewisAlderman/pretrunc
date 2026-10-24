import { assert, describe, it } from "@effect/vitest";
import { Effect, Record } from "effect";
import { renderSnippets } from "./snippets.ts";

// Twoslash type-checks each snippet against src/, so an API change that breaks the
// demo's code fails here, not only when someone opens the demo.
describe("demo snippets", () => {
  it.effect(
    "type-check against the API, each with types to hover",
    () =>
      Effect.gen(function* () {
        const html = yield* Effect.promise(() => renderSnippets(`${import.meta.dirname}/..`));
        const names = Record.keys(html);
        assert.isAtLeast(names.length, 54);
        for (const name of names) assert.include(html[name], "twoslash-hover", name);
      }),
    60_000,
  );
});
