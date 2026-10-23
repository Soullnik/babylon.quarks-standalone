# Contributing to babylon.quarks

Thanks for your interest in improving `babylon.quarks`! Issues, bug reports, demos and pull
requests are all welcome.

## Repository layout

- `packages/babylon.quarks` — the publishable npm package (source, tests, build config).
- `packages/babylon.quarks-editor` — the in-house Shuriken-style effect editor (headless core +
  React UI); see its own README for install/usage.
- `packages/quarks.core` — the underlying particle simulation engine.
- `tools/unity-quarks-exporter` — a Unity Editor tool that exports Shuriken effects to Quarks
  JSON, built into a `.unitypackage` via `npm run build:unitypackage`.
- `examples` — Vite app with the demo gallery, effect editor page (`editor.html`), benchmark page
  and API docs entry; deployed to GitHub Pages.
- `scripts` — repo tooling (preview capture, tarball checks, Unity package build).
- `ROADMAP.md` — planned work; a good place to find something to pick up.

## Getting started

Requirements: Node.js >= 20.11, npm >= 10.

```bash
npm install
npm run build        # build the package (ESM + CJS + UMD + types)
npm run build:editor  # build the babylon.quarks-editor package
npm run dev          # start the examples app at http://localhost:3010 (open editor.html for the effect editor)
```

Building the Unity exporter's `.unitypackage` is separate and only needed when touching
`tools/unity-quarks-exporter`: `npm run build:unitypackage`.

The examples app aliases `babylon.quarks` to the package **source** (`src/index.ts`), so
changes to the library show up in demos without rebuilding.

## Quality checks

Run the full suite before opening a PR:

```bash
npm run check        # build + test typecheck + tests with coverage gate + examples build + tarball content check
```

Individual pieces:

```bash
npm run test                                   # jest suites: quarks.core, babylon.quarks, babylon.quarks-editor
npm run typecheck                              # tsc over sources and tests (jest only transpiles them)
npm run test:coverage                          # the same suites with the coverage gate (what CI runs)
npm run docs                                   # TypeDoc API docs
npm run docs:check                             # renders the API docs; fails on a missing TSDoc or broken {@link} (CI runs it)
npm run check:demos                            # every demo in headless Chromium, fails on page/console errors or a missing gallery preview
npm run validate:shaders                       # every shader variant, GLSL and WGSL, through a real compiler (CI runs it)
```

The last two need the examples served on port 3010 (`npm run dev -w examples`, or
`npm run build:examples && npm run preview -w examples` for what CI runs) and a Chromium: Playwright's
own (`npx playwright install chromium`) or one named in `CHROMIUM_PATH`. `validate:shaders` needs no GPU:
Chromium's software adapter compiles GLSL and WGSL like any other, which is how CI runs it
(`--lang=glsl` or `--lang=wgsl` compiles one language). `check:demos --webgpu` also
opens every demo under WebGPU and needs a real adapter; software adapters crash on texture uploads.
`check:demos --shard=1/2` opens every other demo, which is how CI splits them over two machines.

Jest transpiles TypeScript without checking types (`isolatedModules` in each package's
`tsconfig.test.json`), which keeps the suites fast; `npm run typecheck` is where type errors in
sources and tests fail. Run it after `npm run build`, since tests import the built packages' types.

Tests live in each package's `test/` folder. `npm run test:coverage` enforces a coverage floor per
package, set in the root `jest.config.json` under `coverageThreshold`. The floors are a ratchet: they
sit one point under what the suites reach today, since random paths move coverage a little. A change
may not lower them, and a PR that raises coverage raises the matching floor. Every file under each
package's sources counts (for the editor, `src/core`), whether a test loads it or not, so a new
untested module lowers the number. The gate needs the full suite: run on a subset of tests it fails
for the packages that subset does not reach. New runtime code needs tests.

Formatting is Prettier: `npm run format` writes it and `npm run format:check`, part of
`npm run check` and CI, fails on a file it would change. Code has a 4-space indent and single
quotes; Markdown lists indent 2 spaces, and code blocks in Markdown are left as written.

`npm run lint` runs ESLint (`eslint.config.mjs`, typescript-eslint's recommended rules and React's
hook rules for the editor) and is part of `npm run check` and CI. Errors fail it. The warnings are
explicit `any`s, kept while the JSON readers are typed; `--max-warnings` in the script is a ratchet
like the coverage floors: a change may not add one, and a PR that removes some lowers the number.
An `eslint-disable` comment names its rule and says why. The three packages compile with
`strict: true`; the examples do not yet.

Everything `babylon.quarks` exports carries TSDoc: `npm run docs:check`, part of `npm run check`
and CI, fails on an exported class, function, type, member or accessor without a comment, and on a
`{@link}` that does not resolve. A member that is public in TypeScript only so other files of the
package can reach it is tagged `@internal`, which keeps it out of the docs and out of the contract;
users should not rely on it.

## Commit and PR conventions

- Commit messages follow the conventional prefix style used in the history:
  `feat:`, `fix:`, `perf:`, `test:`, `docs:`, `chore:`, `ci:`, `refactor:`.
- Keep PRs focused on one topic. Describe what changed and how it was validated.
- If your change affects the package (not just demos), add an entry to
  `packages/babylon.quarks/CHANGELOG.md` under the upcoming version.

## Adding a demo

1. Create a module in `examples/src/demos/` exporting `init` (and optionally `update`) —
   see any existing demo for the `DemoContext` shape.
2. Register it in `examples/src/demoManifest.ts` (key, name, description, tags, preview).
3. Run `npm run dev`, verify it works, then capture the gallery preview:
   `npm run capture:previews` (requires the dev server running; `CHROMIUM_PATH` as above). The
   gallery shows `examples/public/previews/<key>.png`, and `npm run check:demos` fails on a demo
   without one.
4. Add it to the demo table in the root `README.md` and bump the demo count in
   `packages/babylon.quarks/README.md`.

## Releases (maintainers)

1. `npm run check` from the repo root.
2. Update `packages/babylon.quarks/CHANGELOG.md` and bump the version in
   `packages/babylon.quarks/package.json` (keep the `quarks.core` 0.x line alignment). If the
   editor changed too, do the same for `packages/babylon.quarks-editor/CHANGELOG.md` and
   `package.json`.
3. Verify the tarballs: `npm run check:pack` (validates both `babylon.quarks` and
   `babylon.quarks-editor`).
4. Publish a GitHub release — the `publish.yml` workflow publishes both `babylon.quarks` and
   `babylon.quarks-editor` to npm via trusted publishing (OIDC). It can also be run manually
   from the Actions tab.

## Questions

Open an [issue](https://github.com/Soullnik/babylon.quarks-standalone/issues) or start a
thread on the [Babylon.js forum](https://forum.babylonjs.com/).
