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
- **Render modes** — billboard, vertical/horizontal billboard, stretched billboard, mesh particles, and **trails** (not available in Babylon's built-in particle systems).
- **Sub-emitters** and a rich set of composable behaviors (color/size/speed over life, noise turbulence, forces, and more from `quarks.core`).
- **Soft particles**, texture tile animation with blending, custom blend functions.
- **Visual authoring** — design effects in our own [effect editor](https://soullnik.github.io/babylon.quarks-standalone/editor.html) or export them from Unity, then load with `QuarksLoader` (quarks.art-exported JSON also works — same format).
- **Cross-engine format** — the same effect JSON runs in three.js (three.quarks) and Babylon.js.
- **Adaptive performance** — optional frame-budget quality scaling built into `BatchedRenderer`.
- **WebGL and WebGPU** — runs on both Babylon engines; shaders are transpiled to WGSL automatically.

## Install

```bash
npm install babylon.quarks @babylonjs/core
```

Peer dependency: `@babylonjs/core` >= 9.

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
    Vector4,
} from 'babylon.quarks';

// One renderer per scene; it batches all systems added to it.
const batchRenderer = new BatchedRenderer('particles', scene);

const system = new ParticleSystem({
    scene,
    duration: 5,
    looping: true,
    startLife: new IntervalValue(4, 5),
    startSpeed: new ConstantValue(1),
    startSize: new IntervalValue(1, 2),
    startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
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
        startColor: new Q.ConstantColor(new Q.Vector4(1, 0.6, 0.2, 1)),
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

The library runs on Babylon's `WebGPUEngine` — its GLSL shaders are transpiled to WGSL automatically by Babylon (glslang/twgsl are fetched by Babylon on engine init). Everything except engine creation stays the same:

```ts
import {WebGPUEngine} from '@babylonjs/core/Engines/webgpuEngine';
import '@babylonjs/core/Engines/WebGPU/Extensions/index';

const engine = new WebGPUEngine(canvas, {antialias: true});
await engine.initAsync();
// Scene + BatchedRenderer setup is identical to WebGL.
```

All render modes (billboard, stretched billboard, mesh, trail) are validated to create WebGPU pipelines with zero validation errors. The [live demos](https://soullnik.github.io/babylon.quarks-standalone/) and the [benchmark page](https://soullnik.github.io/babylon.quarks-standalone/benchmark.html) accept `?engine=webgpu` in the URL to switch engines.

## Soft particles

Billboards intersecting geometry are cut along a hard line by the depth test — most
visible against thin walls and floors. Soft particles fade a particle out as it
approaches whatever is behind it, which needs a depth buffer to compare against:

```ts
import '@babylonjs/core/Rendering/depthRendererSceneComponent';

batchRenderer.setDepthTexture(scene.enableDepthRenderer().getDepthMap());
system.softParticles = true;
system.softNearFade = 0; // where the fade starts, in world units
system.softFarFade = 0.3; // where the particle is back to full opacity
```

`setDepthTexture` takes an optional `DepthTextureMode` for depth maps written some other
way — `LinearDepthMetric` (the default, and what `enableDepthRenderer()` writes),
`CameraSpaceZ` (`storeCameraSpaceZ: true`; also set `depthRenderer.clearColor` to your far
plane, since that map clears to 0) or `NonLinearDepth` (`storeNonLinearDepth: true`).

Fade distances are in world units, so scale them to the effect: a 0.3 fade swallows an
effect that is only half a unit across.

### When the sprite sits flush with the surface

Soft particles fade by distance to what is behind, so they have nothing to work with when
a sprite lies in the same plane as the object. Two things help, and they compose:

```ts
system.cameraOffset = 0.15; // slide sprites along the eye ray, towards the camera
system.depthTest = false; // or let the effect draw over the object entirely
```

`cameraOffset` is Cascade's / Niagara's Camera Offset: the sprite does not move on screen,
only in depth, so unlike moving the emitter it holds from every camera angle. It separates
along the view direction, so it does nothing for a surface seen edge-on.

For an effect that should wrap an object rather than sit next to it, emit from the object:
`MeshSurfaceEmitter` puts particles on a mesh's surface with their velocity along the face
normal. It samples the mesh's vertices when assigned, so it follows a moving object but not
a skinned pose.

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
QuarksUtil.addToBatchRenderer(effect, batchRenderer);
QuarksUtil.play(effect);
```

See the [examples app](https://github.com/Soullnik/babylon.quarks-standalone/tree/main/examples) in the monorepo for 18 interactive demos and usage patterns.

## Links

- [API documentation](https://soullnik.github.io/babylon.quarks-standalone/docs/)
- [Changelog](https://github.com/Soullnik/babylon.quarks-standalone/blob/main/packages/babylon.quarks/CHANGELOG.md)
- [Contributing](https://github.com/Soullnik/babylon.quarks-standalone/blob/main/CONTRIBUTING.md)
- [npm package](https://www.npmjs.com/package/babylon.quarks)
- [Source (monorepo)](https://github.com/Soullnik/babylon.quarks-standalone/tree/main/packages/babylon.quarks)
- [Roadmap](https://github.com/Soullnik/babylon.quarks-standalone/blob/main/ROADMAP.md)
- [Issues](https://github.com/Soullnik/babylon.quarks-standalone/issues)

## License

MIT
