# babylon.quarks standalone

Monorepo for the `babylon.quarks` npm package and Babylon.js examples.

## npm package

- Package: [`babylon.quarks`](https://www.npmjs.com/package/babylon.quarks)
- Install:

```bash
npm install babylon.quarks @babylonjs/core
```

## Get started

Use the package in your Babylon.js app:

```ts
import {BatchedRenderer, ParticleSystem} from "babylon.quarks";
```

Then initialize `BatchedRenderer` with your Babylon scene and add one or more `ParticleSystem` instances.

## Live examples

[GitHub Pages demo](https://soullnik.github.io/babylon.quarks-standalone/)

## Workspace structure

- `packages/babylon.quarks` - publishable package
- `examples` - Vite app used for local demos and GitHub Pages

## Quick start

```bash
npm install
npm run build
npm run examples
```

Open local examples at `http://localhost:8001` (Vite picks the next free port if `8000` is busy).

## Quality checks

```bash
npm run test
npm run build:examples
npm run check:pack
npm run check
```

## Refresh demo previews

Run the local examples server first, then generate screenshots:

```bash
npm run dev
npm run capture:previews
```

## Customize Texture Sequencer demo

`Texture Sequencer` reads two images:

- text shape: `examples/public/textures/text_texture.png`
- logo shape: `examples/public/textures/logo_texture.png`

Replace these files with your own PNG images to customize the demo output.

## Release checklist

1. Run `npm run check` from repository root.
2. Bump package version in `packages/babylon.quarks/package.json`.
3. Verify tarball content with `npm pack --dry-run --workspace=babylon.quarks`.
4. Publish package from CI (recommended) or manually:

```bash
npm publish --workspace=babylon.quarks --access public
```
