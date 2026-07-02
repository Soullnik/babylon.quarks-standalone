# babylon.quarks

[![npm version](https://img.shields.io/npm/v/babylon.quarks)](https://www.npmjs.com/package/babylon.quarks)
[![CI](https://github.com/Soullnik/babylon.quarks-standalone/actions/workflows/ci.yml/badge.svg)](https://github.com/Soullnik/babylon.quarks-standalone/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/Soullnik/babylon.quarks-standalone/blob/main/LICENSE)

High-performance particle system for [Babylon.js](https://www.babylonjs.com/). Built on [quarks.art](https://quarks.art/) (`quarks.core`).

[**Live demos**](https://soullnik.github.io/babylon.quarks-standalone/)

| | | | |
|---|---|---|---|
| [![Muzzle Flash](https://raw.githubusercontent.com/Soullnik/babylon.quarks-standalone/main/examples/public/previews/muzzle-flash.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#MuzzleFlashDemo) | [![Explosion](https://raw.githubusercontent.com/Soullnik/babylon.quarks-standalone/main/examples/public/previews/explosion.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#ExplosionDemo) | [![Trail](https://raw.githubusercontent.com/Soullnik/babylon.quarks-standalone/main/examples/public/previews/trail.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#TrailDemo) | [![Sub Emitter](https://raw.githubusercontent.com/Soullnik/babylon.quarks-standalone/main/examples/public/previews/sub-emitter.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#SubEmitterDemo) |
| [![Electric Ball](https://raw.githubusercontent.com/Soullnik/babylon.quarks-standalone/main/examples/public/previews/electric-ball.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#ElectricBallDemo) | [![Black Hole](https://raw.githubusercontent.com/Soullnik/babylon.quarks-standalone/main/examples/public/previews/black-hole.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#BlackHoleDemo) | [![Soft Particles](https://raw.githubusercontent.com/Soullnik/babylon.quarks-standalone/main/examples/public/previews/soft-particle.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#SoftParticleDemo) | [![Level-Up](https://raw.githubusercontent.com/Soullnik/babylon.quarks-standalone/main/examples/public/previews/level-up.png)](https://soullnik.github.io/babylon.quarks-standalone/babylonDemo.html#LevelUpDemo) |

## Features

- **Batched rendering** — heterogeneous particle systems share draw calls via `BatchedRenderer`.
- **Render modes** — billboard, vertical/horizontal billboard, stretched billboard, mesh particles, and **trails** (not available in Babylon's built-in particle systems).
- **Sub-emitters** and a rich set of composable behaviors (color/size/speed over life, noise turbulence, forces, and more from `quarks.core`).
- **Soft particles**, texture tile animation with blending, custom blend functions.
- **Visual authoring** — create effects in the [quarks.art](https://quarks.art/) editor (or export from Unity) and load them with `QuarksLoader`.
- **Cross-engine format** — the same effect JSON runs in three.js (three.quarks) and Babylon.js.
- **Adaptive performance** — optional frame-budget quality scaling built into `BatchedRenderer`.

## Install

```bash
npm install babylon.quarks @babylonjs/core
```

Peer dependency: `@babylonjs/core` >= 9.

## Quick start

```ts
import {Constants} from "@babylonjs/core/Engines/constants";
import {
    BatchedRenderer,
    ParticleSystem,
    PointEmitter,
    RenderMode,
    ConstantValue,
    IntervalValue,
    ConstantColor,
    Vector4,
} from "babylon.quarks";

// One renderer per scene; it batches all systems added to it.
const batchRenderer = new BatchedRenderer("particles", scene);

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
    var camera = new BABYLON.ArcRotateCamera("cam", -Math.PI / 2, 1.2, 10, BABYLON.Vector3.Zero(), scene);
    camera.attachControl(canvas, true);

    await BABYLON.Tools.LoadScriptAsync("https://cdn.jsdelivr.net/npm/babylon.quarks/dist/babylon.quarks.umd.min.js");
    const Q = BabylonQuarks;

    const batchRenderer = new Q.BatchedRenderer("particles", scene);
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
        texture: new BABYLON.Texture("textures/flare.png", scene),
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

## Load effects from quarks.art / Unity

Author an effect in the [quarks.art editor](https://quarks.art/) (or export from Unity), then load the JSON:

```ts
import {BatchedRenderer, QuarksLoader, QuarksUtil} from "babylon.quarks";

const batchRenderer = new BatchedRenderer("particles", scene);
const loader = new QuarksLoader(scene);
const effect = await loader.load("effects/explosion.json");
QuarksUtil.addToBatchRenderer(effect, batchRenderer);
QuarksUtil.play(effect);
```

See the [examples app](https://github.com/Soullnik/babylon.quarks-standalone/tree/main/examples) in the monorepo for 18 interactive demos and usage patterns.

## Links

- [npm package](https://www.npmjs.com/package/babylon.quarks)
- [Source (monorepo)](https://github.com/Soullnik/babylon.quarks-standalone/tree/main/packages/babylon.quarks)
- [Roadmap](https://github.com/Soullnik/babylon.quarks-standalone/blob/main/ROADMAP.md)
- [Issues](https://github.com/Soullnik/babylon.quarks-standalone/issues)

## License

MIT
