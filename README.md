# babylon.quarks standalone

[![npm version](https://img.shields.io/npm/v/babylon.quarks)](https://www.npmjs.com/package/babylon.quarks)
[![npm downloads](https://img.shields.io/npm/dm/babylon.quarks)](https://www.npmjs.com/package/babylon.quarks)
[![CI](https://github.com/Soullnik/babylon.quarks-standalone/actions/workflows/ci.yml/badge.svg)](https://github.com/Soullnik/babylon.quarks-standalone/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/types-TypeScript-3178c6.svg)](https://www.typescriptlang.org/)

**A high-performance, GPU-batched particle system and VFX library for [Babylon.js](https://www.babylonjs.com/)** — trails, mesh particles, sub-emitters and 20+ behaviors, a Shuriken-style visual effect editor, WebGL & WebGPU rendering, and a Unity → Quarks exporter.

**[Live demos](https://soullnik.github.io/babylon.quarks-standalone/)** · **[Effect editor](https://soullnik.github.io/babylon.quarks-standalone/editor.html)** · **[API docs](https://soullnik.github.io/babylon.quarks-standalone/docs/)** · **[npm](https://www.npmjs.com/package/babylon.quarks)**

This monorepo holds the `babylon.quarks` npm package, an in-house visual effect editor, a Unity exporter, and Babylon.js examples. The engine (`quarks.core`) is historically derived from [quarks.art](https://quarks.art/) / three.quarks.

## Features

- **GPU-batched rendering** — one draw call across many systems for high particle counts, with adaptive performance scaling
- **Full behavior stack** — color / size / rotation over life, noise, turbulence, forces, collision, velocity, by-speed modifiers, and sub-emitters
- **Trails, stretched billboards & mesh particles** — plus emission from mesh surfaces
- **Shuriken-style visual editor** — module inspector, curves, gradients and a timeline; export / import Quarks JSON
- **WebGL & WebGPU** · **TypeScript-first** · **Unity → Quarks exporter**

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

For the Babylon.js Playground or plain `<script>` usage there is a UMD bundle exposed as the `BabylonQuarks` global — see the [package README](packages/babylon.quarks/README.md#use-in-the-babylonjs-playground) for a paste-ready Playground snippet:

```js
await BABYLON.Tools.LoadScriptAsync("https://cdn.jsdelivr.net/npm/babylon.quarks/dist/babylon.quarks.umd.min.js");
const {BatchedRenderer, ParticleSystem} = BabylonQuarks;
```

## Author effects

- **[Effect editor](https://soullnik.github.io/babylon.quarks-standalone/editor.html)** — our own Shuriken-style visual editor (hierarchy panel + module inspector). Try it live, or run it locally with `npm run examples` and open `editor.html`. See the [`babylon.quarks-editor` README](packages/babylon.quarks-editor/README.md) to embed it in your own app.
- **[Unity exporter](tools/unity-quarks-exporter/README.md)** — author in Unity's Shuriken Particle System and export straight to Quarks JSON via a Unity Editor tool (`.unitypackage`, UPM, or copy-in).
- Effects exported from the [quarks.art](https://quarks.art/) editor still load fine — it's the same JSON format, read by `QuarksLoader` regardless of which tool produced it.

## Live examples

[GitHub Pages demo](https://soullnik.github.io/babylon.quarks-standalone/) · [API docs](https://soullnik.github.io/babylon.quarks-standalone/docs/) · [Particle benchmark](https://soullnik.github.io/babylon.quarks-standalone/benchmark.html) (babylon.quarks vs Babylon's built-in CPU/GPU particle systems)

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
- `packages/babylon.quarks-editor` - in-house Shuriken-style effect editor (headless core + React UI)
- `packages/quarks.core` - underlying particle simulation engine
- `tools/unity-quarks-exporter` - Unity Editor tool that exports Shuriken effects to Quarks JSON
- `examples` - Vite app used for local demos, the effect editor page and GitHub Pages

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup, quality checks, demo guide and PR conventions. Package changes are tracked in the [`babylon.quarks` changelog](packages/babylon.quarks/CHANGELOG.md) and the [`babylon.quarks-editor` changelog](packages/babylon.quarks-editor/CHANGELOG.md).

## Release checklist

1. Run `npm run check` from repository root.
2. Update the changed package(s)' `CHANGELOG.md` and bump their `package.json` version (`packages/babylon.quarks` and/or `packages/babylon.quarks-editor`).
3. Verify tarball content with `npm run check:pack` (covers both publishable packages).
4. Publish a GitHub release — CI publishes both `babylon.quarks` and `babylon.quarks-editor` to npm via trusted publishing (or run the `Publish npm package` workflow manually).
