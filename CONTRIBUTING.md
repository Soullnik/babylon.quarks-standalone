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
npm run dev          # start the examples app at http://localhost:8000 (open editor.html for the effect editor)
```

Building the Unity exporter's `.unitypackage` is separate and only needed when touching
`tools/unity-quarks-exporter`: `npm run build:unitypackage`.

The examples app aliases `babylon.quarks` to the package **source** (`src/index.ts`), so
changes to the library show up in demos without rebuilding.

## Quality checks

Run the full suite before opening a PR:

```bash
npm run check        # build + tests + examples build + tarball content check
```

Individual pieces:

```bash
npm run test                                   # jest test suite
npm run test:coverage --workspace=babylon.quarks   # with coverage report
npm run docs                                   # TypeDoc API docs
```

Tests live in `packages/babylon.quarks/test` and coverage thresholds are enforced
(see `jest.config.json` — 97% statements). New runtime code needs tests.

Formatting is Prettier (`npm run prettier --workspace=babylon.quarks`); match the existing
style — 4-space indent, single quotes in package sources.

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
   `npm run capture:previews` (requires the dev server running).

## Releases (maintainers)

1. `npm run check` from the repo root.
2. Update `packages/babylon.quarks/CHANGELOG.md` and bump the version in
   `packages/babylon.quarks/package.json` (keep the `quarks.core` 0.x line alignment).
3. Verify the tarball: `npm pack --dry-run --workspace=babylon.quarks`.
4. Publish a GitHub release — the `publish.yml` workflow publishes to npm via trusted
   publishing (OIDC). It can also be run manually from the Actions tab.

## Questions

Open an [issue](https://github.com/Soullnik/babylon.quarks-standalone/issues) or start a
thread on the [Babylon.js forum](https://forum.babylonjs.com/).
