# pretrunc

Cuts text at its start, middle or end to fit a width, never overflowing. A framework-agnostic TypeScript core, a Solid 2 adapter, and pretext for multi-line cuts only. Read `DESIGN.md` before changing anything: it holds the algorithm, the engine quirks, the size budgets and the reason behind each decision, and moves with the code.

## Layout

- `src/`: the entries are `index.ts` (core: `cut.ts`, `face.ts`), `dom.ts`, `lines.ts` (imports pretext), `metrics.ts`, `solid.tsx` and `solid-lines.tsx`. `package.json` `exports` maps each, with a `solid` condition at the source and the built `dist/` for other bundlers.
- `bench/`: timings against the prior art, vendored in `bench/prior-art.ts`. `demo/`: the demo page. `scripts/`: the metrics CLI and a build step. `fixtures/`: an Inter metrics table for tests and the demo.

## Conventions

- Run everything through `vp` (Vite+): `vp check`, `vp run test`, `vp run bench`, `vp run demo`, `vp run build`. The repo pins Node and pnpm in `package.json` `devEngines`; npm refuses to run in it.
- Correctness comes first: a cut never lays out wider than its box in Chromium, Firefox or WebKit. Speed and size work never trades that away, and every optimisation is measured, in all three engines, before and after.
- Size budgets live in `size.test.ts`. Raise one when a change truly needs the bytes, and say why there and in `DESIGN.md`.
- Name test files `*.test.ts`, or `*.browser.test.ts(x)` for the three engines. A test earns its place by going red on a defect; check that with a mutant. Lint rejects `.only`, `.skip` and a test with no assertion. A known bug with an open issue is pinned with `it.fails("… (#N)")`, and a regression test's title ends with its issue number.
- When three or more examples check one rule, write a property with `it.prop` from `@effect/vitest`.
- The demo moves with the API: a new or changed option gets its playground control and, if people see the difference, an example, in the same commit.
- An example's code is `demo/snippets/<name>.solid.tsx` and `<name>.react.tsx`, or one `<name>.ts` when it uses no framework. `demo/snippets.test.ts` type-checks every snippet against `src/` with Twoslash, so an API change fixes the snippets it breaks in the same commit.
- An inline lint suppression carries its reason after `--`.
- Commits follow Conventional Commits.
- Commit subjects are the changelog: a release lists every commit since the last one, word for word, grouped by type (`feat` under Enhancements, then `perf`, `fix`, `refactor`, `docs`, `build`, `chore`, `test`, `ci`; only `chore(deps)` is left out), and a `feat` or a breaking change (`!`) sets how far the version moves. So write each subject for someone reading the release notes, and pick the type by what changed for them.

## Solid 2

Solid 2 isn't Solid 1 or React: props are read, not destructured; `createEffect` takes a compute and an apply function; stores are written through a draft. `node_modules/solid-js/CHEATSHEET.md` is the reference, and https://v2.solidjs.com/llms.txt the docs.
