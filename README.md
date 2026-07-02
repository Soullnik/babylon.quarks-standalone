# babylon.quarks standalone

[![npm version](https://img.shields.io/npm/v/babylon.quarks)](https://www.npmjs.com/package/babylon.quarks)
[![CI](https://github.com/Soullnik/babylon.quarks-standalone/actions/workflows/ci.yml/badge.svg)](https://github.com/Soullnik/babylon.quarks-standalone/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Monorepo for the `babylon.quarks` npm package and Babylon.js examples — a high-performance batched particle system for [Babylon.js](https://www.babylonjs.com/), built on the [quarks.art](https://quarks.art/) engine (`quarks.core`).

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

| | | | |
|---|---|---|---|
| [![Muzzle Flash](examples/public/previews/muzzle-flash.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#MuzzleFlashDemo)<br>[Muzzle Flash](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#MuzzleFlashDemo) | [![Explosion](examples/public/previews/explosion.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#ExplosionDemo)<br>[Explosion (Unity export)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#ExplosionDemo) | [![Emitter Shapes](examples/public/previews/emitter-shape.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#EmitterShapeDemo)<br>[Emitter Shapes](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#EmitterShapeDemo) | [![Trail](examples/public/previews/trail.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#TrailDemo)<br>[Trail Renderer](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#TrailDemo) |
| [![Texture Sequencer](examples/public/previews/sequencer.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#SequencerDemo)<br>[Texture Sequencer](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#SequencerDemo) | [![Mesh Material](examples/public/previews/mesh-material.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#MeshMaterialDemo)<br>[Mesh Material](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#MeshMaterialDemo) | [![Sub Emitter](examples/public/previews/sub-emitter.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#SubEmitterDemo)<br>[Sub Emitter](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#SubEmitterDemo) | [![Noise Turbulence](examples/public/previews/turbulence.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#TurbulenceDemo)<br>[Noise Turbulence](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#TurbulenceDemo) |
| [![Alpha Test](examples/public/previews/alpha-test.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#AlphaTestDemo)<br>[Alpha Test Mesh](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#AlphaTestDemo) | [![Custom Plugin](examples/public/previews/custom-plugin.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#CustomPluginDemo)<br>[Custom Plugin](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#CustomPluginDemo) | [![Billboard Modes](examples/public/previews/billboard.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#BillboardDemo)<br>[Billboard Modes](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#BillboardDemo) | [![Soft Particles](examples/public/previews/soft-particle.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#SoftParticleDemo)<br>[Soft Particles](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#SoftParticleDemo) |
| [![Custom Blending](examples/public/previews/custom-blending.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#CustomBlendingDemo)<br>[Custom Blending](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#CustomBlendingDemo) | [![Follow Object](examples/public/previews/follow-object.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#FollowObjectDemo)<br>[Follow Moving Objects](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#FollowObjectDemo) | [![Pick-Up Burst](examples/public/previews/pick-up.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#PickUpDemo)<br>[Pick-Up Burst](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#PickUpDemo) | [![Level-Up](examples/public/previews/level-up.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#LevelUpDemo)<br>[Level-Up](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#LevelUpDemo) |
| [![Electric Ball](examples/public/previews/electric-ball.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#ElectricBallDemo)<br>[Electric Ball](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#ElectricBallDemo) | [![Black Hole](examples/public/previews/black-hole.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#BlackHoleDemo)<br>[Black Hole](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#BlackHoleDemo) | | |

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned improvements (WebGPU, GPU simulation, benchmarks, Playground build) and promotion plans.

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
