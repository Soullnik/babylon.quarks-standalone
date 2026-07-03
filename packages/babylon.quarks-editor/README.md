# babylon.quarks-editor

Shuriken-style effect editor for [babylon.quarks](https://www.npmjs.com/package/babylon.quarks): a Unity-like hierarchy of particle systems with a stacked module inspector. Headless edit-model core plus embeddable React UI.

[Live editor](https://soullnik.github.io/babylon.quarks-standalone/editor.html) · [Source](https://github.com/Soullnik/babylon.quarks-standalone/tree/main/packages/babylon.quarks-editor)

## Install

```bash
npm install babylon.quarks-editor babylon.quarks @babylonjs/core react
```

## Usage

```tsx
import {EffectBinding, EffectHistory} from "babylon.quarks-editor";
import {EffectEditor} from "babylon.quarks-editor/react";

const binding = new EffectBinding(particleSystem);   // your babylon.quarks ParticleSystem
const history = new EffectHistory();
history.attach(binding);

<EffectEditor binding={binding} />;

// Serialize to Quarks JSON (round-trips through QuarksLoader):
const json = binding.exportJSON("MyEffect");
```

Modules: Main, Emission (bursts), Shape (7 emitter types), Speed/Limit Speed/Force/Rotation over Lifetime, Gravity, Color over Lifetime (gradient), Size over Lifetime (curve), Noise, Sub Emitters, Texture Sheet Animation, Renderer. Multi-system hierarchy with add/remove/rename, undo/redo via `EffectHistory`.

The `.` export is UI-free (edit model, serialization, value/shape/gradient helpers) — usable headless. The `./react` export ships the components; React is a peer dependency, so the same UI can mount in a standalone page or inside a [BabylonJS Editor](https://github.com/BabylonJS/Editor) plugin.

## License

MIT
