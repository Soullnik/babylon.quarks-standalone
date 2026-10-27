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
- `starters/vite` — a standalone Vite project with one effect, opened on StackBlitz from the READMEs;
  `npm run typecheck` compiles it against the workspace build, as long as the folder has no
  `node_modules` of its own: delete it after trying the starter with `npm install`.
- `scripts` — repo tooling (preview capture, tarball checks, Unity package build).
- `ROADMAP.md` — planned work; a good place to find something to pick up.

## Getting started

Requirements: Node.js 22.20 or later, or 24.12 or later; npm >= 10. CI runs the version in `.nvmrc`.

`package.json` overrides two dependencies of the test toolchain whose own ranges still pull in
deprecated packages: `test-exclude` (through Jest's coverage) gets a current `glob`, and
`jest-environment-jsdom` gets a jsdom that no longer needs `whatwg-encoding`. Jest supports both.
Drop an override once Jest's own range moves past it.

```bash
npm install
npm run build        # build the package (ESM + CJS + UMD + types)
npm run build:editor  # build the babylon.quarks-editor package
npm run dev          # start the examples app at http://localhost:3010 (open editor.html for the effect editor)
```

Building the Unity exporter's `.unitypackage` is separate and only needed when touching
`tools/unity-quarks-exporter`: `npm run build:unitypackage`.

The exporter's tests need no Unity: `npm run test:exporter` compiles its scripts under the
[.NET SDK](https://dotnet.microsoft.com/download) (8 or later) against stand-ins for the Unity API
in `tools/unity-quarks-exporter/Tests~/Stubs`, exports the effects in `Tests~/Fixtures.cs` and
compares them with the golden files in `Tests~/golden`. After a change to what the exporter writes,
`npm run test:exporter -- --update` rewrites the golden files; review their diff, since the
`babylon.quarks` suite loads them with a strict `QuarksLoader` and checks what they carry. A Unity
API the exporter starts using needs a stand-in with Unity's exact signature (C# 8, as Unity 2020.3
compiles); the scripts are also compiled against .NET Standard 2.0, the library Unity gives them.
`npm run check` does not run these tests, since it needs no .NET SDK; run `npm run test:exporter`
yourself after touching `tools/unity-quarks-exporter` (CI runs it on every pull request).

The examples app aliases `babylon.quarks` to the package **source** (`src/index.ts`), so
changes to the library show up in demos without rebuilding.

## Quality checks

Run the full suite before opening a PR:

```bash
npm run check        # format, lint, build, API reports, API docs, typecheck, tests with coverage gate, smoothness sweep, examples build, tarball check
```

Individual pieces:

```bash
npm run test                                   # jest suites: quarks.core, babylon.quarks, babylon.quarks-editor
npm run typecheck                              # tsc over sources, tests, the examples and the starter (jest only transpiles them; needs `npm run build`)
npm run test:coverage                          # the same suites with the coverage gate (what CI runs)
npm run docs                                   # TypeDoc API docs
npm run docs:check                             # renders the API docs of quarks.core and babylon.quarks; fails on a missing TSDoc or broken {@link} (CI runs it)
npm run check:demos                            # every demo in headless Chromium, fails on page/console errors or a missing gallery preview
npm run validate:shaders                       # every shader variant, GLSL and WGSL, through a real compiler (CI runs it)
npm run check:allocations                      # what a steady frame allocates, per render mode and behavior; nothing per particle (CI runs it)
npm run check:pack                             # tarball contents, a consumer project importing them, and each bundle's gzipped size budget (scripts/size-budget.json)
```

CI also runs the build, typecheck, tests and shader compile against the lowest Babylon.js release
the `@babylonjs/core` peer range admits and against the latest one. To do the same locally, run
`node scripts/use-babylon.mjs lowest` (or `latest`, or a version) and the checks; the script
rewrites the package files and the lockfile, so restore them with `git checkout` afterwards. When a
change needs a newer Babylon.js, raise the peer ranges of babylon.quarks and the editor with it.

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
package's sources counts, whether a test loads it or not, so a new untested module lowers the
number. The editor has two floors: `src/core` (the headless edit model) and `src/react` (the
components, driven through jsdom in `test/react`), whose floor is lower and rises as components gain
tests. The gate needs the full suite: run on a subset of tests it fails
for the packages that subset does not reach. New runtime code needs tests.

Formatting is Prettier: `npm run format` writes it and `npm run format:check`, part of
`npm run check` and CI, fails on a file it would change. Code has a 4-space indent and single
quotes; Markdown lists indent 2 spaces, and code blocks in Markdown are left as written.

`npm run lint` runs ESLint (`eslint.config.mjs`, typescript-eslint's recommended rules and React's
hook rules for the editor) and is part of `npm run check` and CI. It allows no warnings, and an
explicit `any` is an error: JSON from a file is `unknown` and narrowed as it is read, and a test
reaches a private member with `obj['member']` (or the helpers in `test/internals.ts`) instead of a
cast where it can. An `eslint-disable` comment names its rule and says why. The three packages and the examples
compile with `strict: true`.

Everything `babylon.quarks` exports carries TSDoc, the simulation core it re-exports from
`quarks.core` included: `npm run docs:check`, part of `npm run check` and CI, runs TypeDoc over both
packages and fails on an exported class, function, type, member or accessor without a comment, and on
a `{@link}` that does not resolve. A member that is public in TypeScript only so other files of the
package can reach it is tagged `@internal`, which keeps it out of the docs and out of the contract;
users should not rely on it.

The public API of every published entry point is recorded in `packages/<package>/api/*.api.md`,
written by API Extractor from the built declarations. `npm run api:check`, part of `npm run check`
and CI, fails when the build's API differs from the committed report, so every change to the
public surface shows in review as a diff of the report. After an intended change, run
`npm run build && npm run build:editor && npm run api` and commit the reports with it. A type the
API reaches but no entry point exports is listed in the report as `ae-forgotten-export`; export
it, or keep it out of the public signature. The reports list `@internal` members too, marked as
such, so a change to one also needs `npm run api`; they are still no promise to users.

One exception is accepted on purpose: quarks.core's own math (`Vector2`, `Vector3`, `Vector4`,
`Quaternion`, `Matrix3`, `Matrix4`) is internal, and shows as `ae-forgotten-export` where the
extension contract reaches it (particle state, the `gen*` methods of generators, scratch members of
behaviors). Public inputs take the structural types in `quarks.core/src/Like.ts` (`Vector3Like`,
`Color4Like` and the rest), never the math classes, and `test/coreReexports.test.ts` keeps the math
out of `babylon.quarks`' exports.

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
   `npm run capture:previews -- --only=YourDemo` captures just the new one.
4. Add it to the demo table in the root `README.md` and bump the demo count in
   `packages/babylon.quarks/README.md`.

## Landing page

The site's front page is `examples/index.html`, styled by `examples/src/landing/landing.css` and
driven by `examples/src/landing/main.ts`. Its live stage (`landing/heroStage.ts`) runs on the
library itself: WebGPU when the browser has a hardware adapter, WebGL otherwise (`?engine=webgl`
or `?engine=webgpu` force one), and it renders only while on screen. The stage's tabs load the
landing-only vortex (`landing/vortex.ts`) or a demo module from `examples/src/demos/`.

Its still images, the stage poster shown before the stage starts (and to visitors who prefer
reduced motion) and the editor screenshot, are captured with `npm run capture:previews -- --landing`
into `examples/public/landing/`. Recapture them when the vortex or the editor changes visibly.
`npm run check:demos` also opens the landing page and fails if the stage does not start or the
gallery misses a demo.

## Authoring guide screenshots

The screenshots in `docs/AUTHORING.md` are captured from the editor with `npm run capture:guide`
into `docs/images/authoring/`, with the examples served (`npm run dev`, or set
`EXAMPLES_BASE_URL` to a preview of the built site; `CHROMIUM_PATH` as above). The script makes a
new project and opens the modules the guide shows. Recapture them when those modules change
visibly.

## Releases (maintainers)

1. `npm run check` from the repo root.
2. Update `packages/babylon.quarks/CHANGELOG.md` and bump the version in
   `packages/babylon.quarks/package.json` (`quarks.core` takes the same version). If the
   editor changed too, do the same for `packages/babylon.quarks-editor/CHANGELOG.md` and
   `package.json`.
   - **A new minor moves the editor with it.** The editor imports the library's newest API, so
     its peer dependency on `babylon.quarks` is the library's own minor line, `~X.Y.0`, or the
     prerelease itself (`~1.0.0-rc.1`); bump it with the library's minor and publish the editor in
     the same release. The editor stays on 0.x from babylon.quarks 1.0 on, so it bumps its own
     minor (0.31 with 1.0) rather than taking the library's version. Any change to its peer
     range is a new editor version (0.31.1 with 1.0.0), since npm cannot republish one.
     `npm run check:pack` fails when the peer is out of step.
   - **The Unity exporter takes every version.** Set the library's version in
     `tools/unity-quarks-exporter/package.json` and `ExporterInfo.Version`
     (`tools/unity-quarks-exporter/Editor/ExporterInfo.cs`), and add a
     `tools/unity-quarks-exporter/CHANGELOG.md` entry. `npm run check:pack` fails when they differ.
   - **The starter follows the release:** `starters/vite/package.json` depends on
     `babylon.quarks@next` while the release is a prerelease and on `^<major>.0.0` once it is
     not.
3. Check WebGPU on real hardware: `npm run check:demos -- --webgpu` on a machine with a GPU
   (headless software adapters cannot run it), as STABILITY.md promises.
4. Verify the tarballs: `npm run check:pack` (validates both `babylon.quarks` and
   `babylon.quarks-editor`).
5. Publish a GitHub release — the `publish.yml` workflow publishes both `babylon.quarks` and
   `babylon.quarks-editor` to npm via trusted publishing (OIDC). It can also be run manually
   from the Actions tab. When babylon.quarks is a prerelease (`1.0.0-rc.1`), both go out on the
   `next` dist-tag, so `latest` stays on the last release; mark the GitHub release as a
   pre-release too.

## Questions

Open an [issue](https://github.com/Soullnik/babylon.quarks-standalone/issues) or start a
thread on the [Babylon.js forum](https://forum.babylonjs.com/).
