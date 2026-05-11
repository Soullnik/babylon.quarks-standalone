# babylon.quarks

High-performance particle system for [Babylon.js](https://www.babylonjs.com/). Built on [quarks.art](https://quarks.art/) (`quarks.core`).

## Install

```bash
npm install babylon.quarks @babylonjs/core
```

Peer dependency: `@babylonjs/core` >= 9.

## Quick start

```ts
import { BatchedRenderer, ParticleSystem } from "babylon.quarks";

const batchRenderer = new BatchedRenderer("particles", scene);
// Create ParticleSystem instances, add them to your scene logic, then each frame:
// batchRenderer.update(deltaTimeInSeconds);
```

See the [examples app](https://github.com/Soullnik/babylon.quarks-standalone/tree/main/examples) in the monorepo for interactive demos and usage patterns.

## Links

- [npm package](https://www.npmjs.com/package/babylon.quarks)
- [Source (monorepo)](https://github.com/Soullnik/babylon.quarks-standalone/tree/main/packages/babylon.quarks)
- [Issues](https://github.com/Soullnik/babylon.quarks-standalone/issues)

## License

MIT
