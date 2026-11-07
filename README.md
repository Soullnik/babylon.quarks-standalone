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
- **Trails, beams, stretched billboards & mesh particles** — plus emission from mesh surfaces, and smoothed trails with curve tension
- **Texture effects** — per-texture UV layout (channel, tiling, offset, scroll), gradient maps, alpha erosion, UV distortion, flip, soft particles, rim lighting on meshes
- **Scene integration** — render order, layer masks, fog, culling modes, sort modes, screen-size limits and an `EffectPool` for one-shot effects
- **Shuriken-style visual editor** — module inspector, curves, gradients and a timeline; export / import Quarks JSON
- **WebGL & WebGPU** · **TypeScript-first** · **Unity → Quarks exporter**

## npm package

- Package: [`babylon.quarks`](https://www.npmjs.com/package/babylon.quarks)
- Install:

```bash
npm install babylon.quarks @babylonjs/core
```

## Get started

Requires an existing Babylon.js `Scene`. Peer dependency: `@babylonjs/core` 9.24 or later in 9.x.

```ts
import {
    BatchedRenderer,
    ParticleSystem,
    PointEmitter,
    RenderMode,
    ConstantValue,
    IntervalValue,
    ConstantColor,
} from 'babylon.quarks';
import {Color4} from '@babylonjs/core/Maths/math.color';

// One renderer per scene; it batches every system added to it into shared draw calls.
const batchRenderer = new BatchedRenderer('particles', scene);

const system = new ParticleSystem({
    scene,
    duration: 5,
    looping: true,
    startLife: new IntervalValue(4, 5),
    startSpeed: new ConstantValue(1),
    startSize: new IntervalValue(1, 2),
    startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
    emissionOverTime: new ConstantValue(20),
    shape: new PointEmitter(),
    renderMode: RenderMode.BillBoard,
    texture: myParticleTexture,
    transparent: true,
});
batchRenderer.addSystem(system);

// Advance the simulation every frame:
scene.onBeforeRenderObservable.add(() => {
    batchRenderer.update(scene.getEngine().getDeltaTime() / 1000);
});
```

### Load an authored effect

Effects designed in the [effect editor](https://soullnik.github.io/babylon.quarks-standalone/editor.html) or [Unity exporter](tools/unity-quarks-exporter/README.md) (or exported from [quarks.art](https://quarks.art/) — same JSON format) load with `QuarksLoader` instead of being hand-coded. [Authoring an effect](docs/AUTHORING.md) walks through the editor step by step, from a new project to the file your app loads:

```ts
import {BatchedRenderer, QuarksLoader, QuarksUtil} from 'babylon.quarks';

const batchRenderer = new BatchedRenderer('particles', scene);
const loader = new QuarksLoader(scene);
const effect = await loader.load('effects/explosion.json');
QuarksUtil.addToBatchRenderer(effect, batchRenderer);
QuarksUtil.play(effect);

scene.onBeforeRenderObservable.add(() => {
    batchRenderer.update(scene.getEngine().getDeltaTime() / 1000);
});
```

Disabling an emitter (`system.emitter.visible = false`, or `setEnabled(false)` on the node) freezes that system: it is neither drawn nor simulated, and it picks up where it left off when re-enabled. This matches Unity's behaviour for a disabled Particle System, and makes parked effects in a VFX pool free.

For the Babylon.js Playground or plain `<script>` usage there is a UMD bundle exposed as the `BabylonQuarks` global — see the [package README](packages/babylon.quarks/README.md#use-in-the-babylonjs-playground) for a paste-ready Playground snippet:

```js
await BABYLON.Tools.LoadScriptAsync('https://cdn.jsdelivr.net/npm/babylon.quarks/dist/babylon.quarks.umd.min.js');
const {BatchedRenderer, ParticleSystem} = BabylonQuarks;
```

Full API reference, WebGPU setup and more: [package README](packages/babylon.quarks/README.md) · [API docs](https://soullnik.github.io/babylon.quarks-standalone/docs/).

## Author effects

- **[Effect editor](https://soullnik.github.io/babylon.quarks-standalone/editor.html)** — our own Shuriken-style visual editor (hierarchy panel + module inspector). Try it live, or run it locally with `npm run examples` and open `editor.html`. See the [`babylon.quarks-editor` README](packages/babylon.quarks-editor/README.md) to embed it in your own app.
- **[Unity exporter](tools/unity-quarks-exporter/README.md)** — author in Unity's Shuriken Particle System and export straight to Quarks JSON via a Unity Editor tool (`.unitypackage`, UPM, or copy-in).
- Effects exported from the [quarks.art](https://quarks.art/) editor still load fine — it's the same JSON format, read by `QuarksLoader` regardless of which tool produced it.

## Live examples

[GitHub Pages demo](https://soullnik.github.io/babylon.quarks-standalone/) · [API docs](https://soullnik.github.io/babylon.quarks-standalone/docs/) · [Particle benchmark](https://soullnik.github.io/babylon.quarks-standalone/benchmark.html) (babylon.quarks vs Babylon's built-in CPU/GPU particle systems) · [Starter on StackBlitz](https://stackblitz.com/github/Soullnik/babylon.quarks-standalone/tree/main/starters/vite?file=src%2Fmain.ts)

<!-- demos:table -->

**Showcase**: Magic · Buffs and auras

|                                                                                                                                                                                                                                                    |                                                                                                                                                                                                                                                                   |                                                                                                                                                                                                                                          |     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| [![Black Hole](examples/public/previews/black-hole.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#BlackHoleDemo)<br>[Black Hole](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#BlackHoleDemo) | [![Electric Ball](examples/public/previews/electric-ball.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#ElectricBallDemo)<br>[Electric Ball](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#ElectricBallDemo) | [![Level-Up](examples/public/previews/level-up.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#LevelUpDemo)<br>[Level-Up](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#LevelUpDemo) |     |

**Features**: Emission and shapes · Motion and forces · Rendering · Textures and materials · Trails · Sub-emitters · Playback and pooling · Effect files · Extending · Performance

|                                                                                                                                                                                                                                                                                               |                                                                                                                                                                                                                                                                                                     |                                                                                                                                                                                                                                                                                         |                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [![Emitter Shapes](examples/public/previews/emitter-shape.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#EmitterShapeDemo)<br>[Emitter Shapes](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#EmitterShapeDemo)                           | [![Emission Timing](examples/public/previews/emission-timing.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#EmissionTimingDemo)<br>[Emission Timing](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#EmissionTimingDemo)                         | [![Following Moving Objects](examples/public/previews/follow-object.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#FollowObjectDemo)<br>[Following Moving Objects](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#FollowObjectDemo) | [![Ring Buffer](examples/public/previews/ring-buffer.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#RingBufferDemo)<br>[Ring Buffer](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#RingBufferDemo)                                                 |
| [![Velocity and Speed](examples/public/previews/velocity.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#VelocityDemo)<br>[Velocity and Speed](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#VelocityDemo)                                | [![Noise and Turbulence](examples/public/previews/noise.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#NoiseDemo)<br>[Noise and Turbulence](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#NoiseDemo)                                           | [![Force Space](examples/public/previews/force-space.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#ForceSpaceDemo)<br>[Force Space](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#ForceSpaceDemo)                                 | [![Limit Velocity Axes](examples/public/previews/limit-velocity-axes.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#LimitVelocityAxesDemo)<br>[Limit Velocity Axes](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#LimitVelocityAxesDemo)           |
| [![Render Modes](examples/public/previews/billboard.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#BillboardDemo)<br>[Render Modes](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#BillboardDemo)                                         | [![Renderer Options](examples/public/previews/renderer-options.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#RendererOptionsDemo)<br>[Renderer Options](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#RendererOptionsDemo)                    | [![Blending and Material Colour](examples/public/previews/blending.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#BlendingDemo)<br>[Blending and Material Colour](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#BlendingDemo)      | [![Mesh Particles](examples/public/previews/mesh-particles.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#MeshParticlesDemo)<br>[Mesh Particles](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#MeshParticlesDemo)                                  |
| [![Image Processing](examples/public/previews/image-processing.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#ImageProcessingDemo)<br>[Image Processing](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#ImageProcessingDemo)              | [![Mesh Particles with a Material](examples/public/previews/mesh-material.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#MeshMaterialDemo)<br>[Mesh Particles with a Material](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#MeshMaterialDemo) | [![Texture Effects](examples/public/previews/texture-effects.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#TextureEffectsDemo)<br>[Texture Effects](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#TextureEffectsDemo)             | [![Flipbooks](examples/public/previews/flipbooks.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#FlipbooksDemo)<br>[Flipbooks](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#FlipbooksDemo)                                                         |
| [![Aura and Weapon Trail](examples/public/previews/aura-trail.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#AuraTrailDemo)<br>[Aura and Weapon Trail](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#AuraTrailDemo)                      | [![Texture Sequencer](examples/public/previews/sequencer.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#SequencerDemo)<br>[Texture Sequencer](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#SequencerDemo)                                     | [![Trails and Collision](examples/public/previews/trail.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#TrailDemo)<br>[Trails and Collision](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#TrailDemo)                               | [![Trail Texture Modes and Sampling](examples/public/previews/trail-texture.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#TrailTextureDemo)<br>[Trail Texture Modes and Sampling](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#TrailTextureDemo) |
| [![Surface Trails and Mesh UV2](examples/public/previews/trail-surface.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#TrailSurfaceDemo)<br>[Surface Trails and Mesh UV2](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#TrailSurfaceDemo) | [![Sub Emitter](examples/public/previews/sub-emitter.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#SubEmitterDemo)<br>[Sub Emitter](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#SubEmitterDemo)                                             | [![Pooled One-Shot Hits](examples/public/previews/pooled-hits.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#PooledHitsDemo)<br>[Pooled One-Shot Hits](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#PooledHitsDemo)               | [![Timeline (QuarksPrefab)](examples/public/previews/timeline.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#TimelineDemo)<br>[Timeline (QuarksPrefab)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#TimelineDemo)                                |
| [![Loading Effects](examples/public/previews/loading-effects.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#LoadingEffectsDemo)<br>[Loading Effects](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#LoadingEffectsDemo)                   | [![Custom Plugin](examples/public/previews/custom-plugin.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#CustomPluginDemo)<br>[Custom Plugin](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#CustomPluginDemo)                                   | [![Culling and Layers](examples/public/previews/culling.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#CullingDemo)<br>[Culling and Layers](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#CullingDemo)                             | [![Muzzle Flash Performance](examples/public/previews/muzzle-flash.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#MuzzleFlashDemo)<br>[Muzzle Flash Performance](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#MuzzleFlashDemo)                    |

<!-- /demos:table -->

## Performance

The simulation runs on a column store with compiled behavior passes, and every system of a
scene is drawn through a few batched instanced draws. Measured against Babylon's built-in CPU
`ParticleSystem` on the same scenario (cone emitters, additive billboards, colour over life;
`renderer.update` + `scene.render` per frame on a `NullEngine`, so CPU time only, on a
GitHub-Actions-class VM):

| Particles | Emitters | babylon.quarks | Babylon `ParticleSystem` | Ratio |
| --------: | -------: | -------------: | -----------------------: | ----: |
|    10 000 |        1 |         0.9 ms |                   3.7 ms |  3.9× |
|    10 000 |       16 |         0.9 ms |                   5.0 ms |  5.5× |
|    50 000 |        1 |         4.1 ms |                  25.1 ms |  6.1× |
|    50 000 |       16 |         4.2 ms |                  25.3 ms |  6.1× |
|   100 000 |        1 |         9.0 ms |                  47.6 ms |  5.3× |
|   100 000 |       16 |         9.0 ms |                  58.3 ms |  6.5× |

The [benchmark page](https://soullnik.github.io/babylon.quarks-standalone/benchmark.html) runs
the same scenario in your browser, GPU included, against both the CPU and the GPU built-in
systems. Systems no camera sees can pause themselves (`cullingMode`), and `EffectPool` keeps
copies of a one-shot effect ready so playing one allocates nothing.

## Stability

From 1.0 on, the API, the effect files and the look of an effect follow semver: see
[STABILITY.md](STABILITY.md) for what a minor may and may not change, and
[docs/MIGRATING-1.0.md](docs/MIGRATING-1.0.md) to upgrade from 0.28 or later.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for what is next (WebGPU on real hardware, the editor's remaining
items, GPU simulation) and how the library is positioned.

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

Open local examples at `http://localhost:3010` (the effect editor is at `/editor.html`).

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
