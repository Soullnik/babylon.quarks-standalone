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
