# babylon.quarks

[![npm version](https://img.shields.io/npm/v/babylon.quarks)](https://www.npmjs.com/package/babylon.quarks)
[![CI](https://github.com/Soullnik/babylon.quarks-standalone/actions/workflows/ci.yml/badge.svg)](https://github.com/Soullnik/babylon.quarks-standalone/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/Soullnik/babylon.quarks-standalone/blob/main/LICENSE)

High-performance particle system for [Babylon.js](https://www.babylonjs.com/). Built on `quarks.core` (historically derived from [quarks.art](https://quarks.art/) / three.quarks).

[**Live demos**](https://soullnik.github.io/babylon.quarks-standalone/)

|                                                                                                                                                                                                                                  |                                                                                                                                                                                                                         |                                                                                                                                                                                                                                   |                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [![Muzzle Flash](https://raw.githubusercontent.com/Soullnik/babylon.quarks-standalone/main/examples/public/previews/muzzle-flash.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#MuzzleFlashDemo)    | [![Explosion](https://raw.githubusercontent.com/Soullnik/babylon.quarks-standalone/main/examples/public/previews/explosion.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#ExplosionDemo)   | [![Trail](https://raw.githubusercontent.com/Soullnik/babylon.quarks-standalone/main/examples/public/previews/trail.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#TrailDemo)                         | [![Sub Emitter](https://raw.githubusercontent.com/Soullnik/babylon.quarks-standalone/main/examples/public/previews/sub-emitter.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#SubEmitterDemo) |
| [![Electric Ball](https://raw.githubusercontent.com/Soullnik/babylon.quarks-standalone/main/examples/public/previews/electric-ball.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#ElectricBallDemo) | [![Black Hole](https://raw.githubusercontent.com/Soullnik/babylon.quarks-standalone/main/examples/public/previews/black-hole.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#BlackHoleDemo) | [![Soft Particles](https://raw.githubusercontent.com/Soullnik/babylon.quarks-standalone/main/examples/public/previews/soft-particle.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#SoftParticleDemo) | [![Level-Up](https://raw.githubusercontent.com/Soullnik/babylon.quarks-standalone/main/examples/public/previews/level-up.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#LevelUpDemo)          |

## Features

- **Batched rendering** — heterogeneous particle systems share draw calls via `BatchedRenderer`.
- **Render modes** — billboard, vertical/horizontal billboard, stretched billboard, mesh particles, **trails** and **beams** (not available in Babylon's built-in particle systems).
- **Sub-emitters** and a rich set of composable behaviors (color/size/speed over life, noise turbulence, forces, attractors, collision, and more from `quarks.core`).
- **Texture effects** — per-texture UV layout (UV channel, tiling, offset, scroll), gradient maps, alpha erosion, UV distortion, flip, texture tile animation with blending, soft particles, custom blend functions, rim lighting on mesh particles, smoothed trails with curve tension.
- **Trails** — texture modes (stretch, tile, per segment) with a texture scale, a minimum vertex distance and a lifetime (Unity's TrailRenderer settings), swept weapon trails along an emitter axis, world-space recording behind a moving emitter, and `clearTrails()` for teleports.
- **Scene integration** — render order and rendering groups, layer masks, fog, bounds and frustum culling with Unity's culling modes, sort modes, screen-size limits, and an `EffectPool` that plays one-shot effects without allocating.
- **Visual authoring** — design effects in our own [effect editor](https://soullnik.github.io/babylon.quarks-standalone/editor.html) or export them from Unity, then load with `QuarksLoader` (quarks.art-exported JSON also works — same format).
- **Open effect format** — documented JSON with a [JSON Schema](https://github.com/Soullnik/babylon.quarks-standalone/blob/main/docs/FORMAT.md#schema); files from three.quarks and older releases load, upgraded as they are read.
- **Adaptive performance** — optional frame-budget quality scaling built into `BatchedRenderer`.
- **Garbage-free frames** — a steady frame allocates nothing per particle, in every render mode and with every behavior, checked in CI. The bundle is about 100 kB gzipped, with a size budget in CI.
- **WebGL and WebGPU** — runs on both Babylon engines with native GLSL and WGSL shaders; nothing is transpiled or downloaded at run time.

## Install

```bash
npm install babylon.quarks @babylonjs/core
```

Peer dependency: `@babylonjs/core` 9.24 or later in 9.x. CI builds, tests and compiles every
shader against 9.24.0 and against the latest release. The package ships ES module and CommonJS builds;
`@babylonjs/core` is ES modules only, so `require('babylon.quarks')` needs a Node that can
`require` ES modules (20.19 or 22.12 and later). Bundlers and `import` work everywhere.

### Browsers

quarks draws with WebGL2, or with WebGPU where the browser has it (see [WebGPU](#webgpu)): current
Chrome, Edge, Firefox and Safari (15 and later) all have WebGL2. WebGL1, which Babylon.js falls back
to where WebGL2 is missing, is not supported or tested. CI compiles
every shader variant in Chromium, in GLSL on WebGL2 and in WGSL on WebGPU, and opens every demo in
Chromium on WebGL2.

## Quick start

```ts
import {Constants} from '@babylonjs/core/Engines/constants';
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

// One renderer per scene; it batches all systems added to it.
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
    blendMode: Constants.ALPHA_COMBINE,
});
batchRenderer.addSystem(system);

// Advance the simulation every frame:
scene.onBeforeRenderObservable.add(() => {
    batchRenderer.update(scene.getEngine().getDeltaTime() / 1000);
});
```

## Start from a template

[`starters/vite`](https://github.com/Soullnik/babylon.quarks-standalone/tree/main/starters/vite) is
a Vite + TypeScript project with one effect in a Babylon.js scene.
[Open it in StackBlitz](https://stackblitz.com/github/Soullnik/babylon.quarks-standalone/tree/main/starters/vite?file=src%2Fmain.ts)
to edit it in the browser, or copy the folder and run `npm install && npm run dev`.

## Use in the Babylon.js Playground

The package ships a UMD bundle (`dist/babylon.quarks.umd.min.js`, exposed as the `BabylonQuarks` global) that can be loaded straight from a CDN — no build step needed. Paste this into the [Playground](https://playground.babylonjs.com/):

```js
var createScene = async function () {
    var scene = new BABYLON.Scene(engine);
    var camera = new BABYLON.ArcRotateCamera('cam', -Math.PI / 2, 1.2, 10, BABYLON.Vector3.Zero(), scene);
    camera.attachControl(canvas, true);

    await BABYLON.Tools.LoadScriptAsync('https://cdn.jsdelivr.net/npm/babylon.quarks/dist/babylon.quarks.umd.min.js');
    const Q = BabylonQuarks;

    const batchRenderer = new Q.BatchedRenderer('particles', scene);
    const system = new Q.ParticleSystem({
        scene,
        duration: 5,
        looping: true,
        startLife: new Q.IntervalValue(2, 3),
        startSpeed: new Q.ConstantValue(2),
        startSize: new Q.IntervalValue(0.5, 1),
        startColor: new Q.ConstantColor(new BABYLON.Color4(1, 0.6, 0.2, 1)),
        emissionOverTime: new Q.ConstantValue(60),
        shape: new Q.ConeEmitter({radius: 0.3, angle: 0.4}),
        renderMode: Q.RenderMode.BillBoard,
        texture: new BABYLON.Texture('textures/flare.png', scene),
        transparent: true,
        blendMode: BABYLON.Constants.ALPHA_ADD,
    });
    batchRenderer.addSystem(system);

    scene.onBeforeRenderObservable.add(() => {
        batchRenderer.update(engine.getDeltaTime() / 1000);
    });

    return scene;
};
```

The same bundle works in any plain `<script>` setup alongside the global `babylon.js` build:

```html
<script src="https://cdn.babylonjs.com/babylon.js"></script>
<script src="https://cdn.jsdelivr.net/npm/babylon.quarks/dist/babylon.quarks.umd.min.js"></script>
```

## WebGPU

The library runs on Babylon's `WebGPUEngine` with its own WGSL shaders: every GLSL shader has a WGSL twin that is picked when the engine is WebGPU, so Babylon never fetches a GLSL-to-WGSL transpiler (glslang/twgsl) for it, and a Content-Security-Policy that blocks `cdn.babylonjs.com` is no obstacle. Everything except engine creation stays the same:

```ts
import {WebGPUEngine} from '@babylonjs/core/Engines/webgpuEngine';
import '@babylonjs/core/Engines/WebGPU/Extensions/index';

const engine = new WebGPUEngine(canvas, {antialias: true});
await engine.initAsync();
// Scene + BatchedRenderer setup is identical to WebGL.
```

Every render mode (billboard, stretched billboard, mesh, trail, beam) and every shader variant (`shaderVariants()`) compiles under a real GLSL and a real WGSL compiler with zero errors (`npm run validate:shaders` in the monorepo, run in CI). The [live demos](https://soullnik.github.io/babylon.quarks-standalone/) and the [benchmark page](https://soullnik.github.io/babylon.quarks-standalone/benchmark.html) accept `?engine=webgpu` in the URL to switch engines.

## Unity-style emitter options

A few optional settings mirror Shuriken so Unity exports look the same; all are off by default and
only written to the effect JSON when set.

```ts
import {Quaternion, Vector2, Vector3} from '@babylonjs/core/Maths/math.vector';
import {ConeEmitter, ShapeTransform} from 'babylon.quarks';

const system = new ParticleSystem({
    // Shape module Position / Rotation / Scale: spawn points and start directions go through it.
    shape: new ConeEmitter({
        radius: 0.5,
        transform: new ShapeTransform(new Vector3(0, 1, 0), Quaternion.Identity(), new Vector3(2, 1, 1)),
    }),
    // Renderer Pivot, in particle-size units (billboards and stretched billboards).
    pivot: new Vector3(0, 0.5, 0),
    // Renderer Flip: mirror the texture of 50% of particles along U.
    flip: new Vector2(0.5, 0),
    // ...
});
```

## Author & load effects

Design an effect with one of these tools, then load the exported JSON with `QuarksLoader`:

- **[Effect editor](https://soullnik.github.io/babylon.quarks-standalone/editor.html)** — our in-house Shuriken-style editor ([`babylon.quarks-editor`](https://www.npmjs.com/package/babylon.quarks-editor), embeddable in your own app).
- **[Unity exporter](https://github.com/Soullnik/babylon.quarks-standalone/tree/main/tools/unity-quarks-exporter)** — a Unity Editor tool that exports Shuriken Particle Systems to the same JSON format.
- **quarks.art** — effects exported from the [quarks.art](https://quarks.art/) editor also load fine, since it's the same JSON envelope.

```ts
import {BatchedRenderer, QuarksLoader, QuarksUtil} from 'babylon.quarks';

const batchRenderer = new BatchedRenderer('particles', scene);
const loader = new QuarksLoader(scene);
const effect = await loader.load('effects/explosion.json');
// Or preload a battle pack — shared textures/geometries fetch once:
// const roots = await loader.loadAll(['fx/hit.json', 'fx/explosion.json'], { concurrency: 6 });
QuarksUtil.addToBatchRenderer(effect, batchRenderer);
QuarksUtil.play(effect);
```

Effect files are described by a JSON Schema, shipped as `babylon.quarks/schema/effect.schema.json` and published at <https://soullnik.github.io/babylon.quarks-standalone/schema/effect-3.schema.json>; point a file's `$schema` at it for completion and checks in your editor. The [format reference](https://github.com/Soullnik/babylon.quarks-standalone/blob/main/docs/FORMAT.md) has the details.

See the [examples app](https://github.com/Soullnik/babylon.quarks-standalone/tree/main/examples) in the monorepo for 24 interactive demos and usage patterns.

## Custom behaviors and shapes

Write your own behaviors and emitter shapes, and register them with `loadPlugin` so effect files
can save and load them: see [Extending babylon.quarks](https://github.com/Soullnik/babylon.quarks-standalone/blob/main/docs/EXTENDING.md).

## Links

- [API documentation](https://soullnik.github.io/babylon.quarks-standalone/docs/)
- [Changelog](https://github.com/Soullnik/babylon.quarks-standalone/blob/main/packages/babylon.quarks/CHANGELOG.md)
- [Stability: what 1.x promises](https://github.com/Soullnik/babylon.quarks-standalone/blob/main/STABILITY.md)
- [Upgrading to 1.0](https://github.com/Soullnik/babylon.quarks-standalone/blob/main/docs/MIGRATING-1.0.md)
- [Contributing](https://github.com/Soullnik/babylon.quarks-standalone/blob/main/CONTRIBUTING.md)
- [npm package](https://www.npmjs.com/package/babylon.quarks)
- [Source (monorepo)](https://github.com/Soullnik/babylon.quarks-standalone/tree/main/packages/babylon.quarks)
- [Roadmap](https://github.com/Soullnik/babylon.quarks-standalone/blob/main/ROADMAP.md)
- [Issues](https://github.com/Soullnik/babylon.quarks-standalone/issues)

## License

MIT
