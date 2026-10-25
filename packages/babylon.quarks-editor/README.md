# babylon.quarks-editor

Shuriken-style effect editor for [babylon.quarks](https://www.npmjs.com/package/babylon.quarks): a Unity-like hierarchy of particle systems with a stacked module inspector. Headless edit-model core plus embeddable React UI.

[Live editor](https://soullnik.github.io/babylon.quarks-standalone/editor.html) · [Source](https://github.com/Soullnik/babylon.quarks-standalone/tree/main/packages/babylon.quarks-editor)

## Install

```bash
npm install babylon.quarks-editor babylon.quarks @babylonjs/core @babylonjs/materials react react-dom @heroicons/react @tanstack/react-virtual
```

The editor is an ES module package (`import`, not `require`). Its version follows babylon.quarks:
editor 0.29.x needs babylon.quarks 0.29.x.

## Usage

The supported embed is the host: it owns the scene, the timeline, undo/redo, playback and the
module inspector, and mounts into any element.

```ts
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {QuarksEffectEditor} from 'babylon.quarks-editor/react';

const editor = QuarksEffectEditor.Show({
    hostElement: document.getElementById('editor')!,
    effectJson, // optional: a Quarks JSON export to open; a default effect otherwise
    textureOptions: [{label: 'Glow', url: '/textures/glow.png'}],
    resolveTexture: (url, scene) => new Texture(url, scene),
    onSave: (json) => save(json), // the effect as Quarks JSON, round-trips through QuarksLoader
});
editor.dispose();
```

The module inspector on its own, for a host that already has a scene and a selection:

```tsx
import {EffectBinding, EffectHistory} from 'babylon.quarks-editor';
import {EffectEditor} from 'babylon.quarks-editor/react';

const binding = new EffectBinding(particleSystem); // your babylon.quarks ParticleSystem
const history = new EffectHistory();
history.attach(binding);

<EffectEditor
    binding={binding}
    selectedSystem={binding.system}
    gizmoTargetNode={binding.system.emitter}
    gizmoTargetLabel={binding.system.emitter.name}
/>;

// Serialize to Quarks JSON (round-trips through QuarksLoader):
const json = binding.exportJSON('MyEffect');
```

Modules, in Unity's order: Main, Emission (rate over time and distance, bursts), Shape (cone,
sphere, hemisphere, circle, donut, rectangle, grid, box, edge, mesh surface, point), Randomize
Direction, Velocity / Speed / Limit Speed / Force over Lifetime, Inherit Velocity, Gravity,
Attractor, Orbit over Lifetime, Color over Lifetime and by Speed, Size over Lifetime and by Speed,
Rotation over Lifetime (2D and 3D) and by Speed, Noise, Turbulence, Collision, Width over Trail,
Sub Emitters, Texture Sheet Animation, Sequences, Renderer (render modes incl. trail, mesh and
beam; material, texture layout, flip, gradient map, erosion, UV distortion, soft particles, sorting).
Multi-system hierarchy with add/remove/rename, undo/redo via `EffectHistory`.

The `.` export is UI-free (edit model, serialization, value/shape/gradient helpers) — usable headless. The `./react` export ships the components; React is a peer dependency, so the same UI can mount in a standalone page or inside a [BabylonJS Editor](https://github.com/BabylonJS/Editor) plugin.

## Textures & meshes (`resolveTexture` / `resolveGeometry`)

The editor never loads assets itself — it defers to host-supplied callbacks so it doesn't need
an opinion on your CDN, asset pipeline, or loader (`@babylonjs/loaders`, your own backend, etc.):

- `resolveTexture(url) => Texture | null | undefined` — turns a picked URL or `data:` URI (from
  "Custom URL…" / "Load from file…" in the Renderer module) into the Babylon `Texture` assigned as
  `system.texture`. Return `null` or `undefined` to leave the texture unset.
- `resolveGeometry(file) => Promise<GeometryData>` — turns a picked file (from "Load from file…"
  in the Mesh render mode's geometry dropdown) into vertex buffers: `{positions, indices?, uvs?,
uvs2?, normals?}` (typed arrays or plain number arrays; `uvs2` is the second UV set textures on
  UV channel 1 read).
- `textureOptions?: {label, url}[]` / `geometryOptions?: {label, positions, indices?, uvs?,
uvs2?, normals?}[]` — preset lists shown alongside "Custom URL…" / "Load from file…". The texture
  presets also serve the gradient map's ramp, the erosion mask and the distortion noise.

**Signature differs by entry point** — a common source of "works in the demo, throws in my
host" bugs:

- `QuarksEffectEditor.Show(...)` / `<EffectEditorHost>` call your callbacks with the live
  `Scene` as a second argument: `resolveTexture: (url, scene) => Texture | null | undefined`,
  `resolveGeometry: (file, scene) => Promise<GeometryData>`.
- The lower-level `<EffectEditor>` (no Host wrapper) does **not** pass a scene:
  `resolveTexture: (url) => Texture | null | undefined`, `resolveGeometry: (file) => Promise<GeometryData>`. If you
  copy a `Show()`-style resolver that reads its `scene` parameter into a raw `<EffectEditor>`,
  `scene` is `undefined` and your resolver throws.

Both callbacks are optional, and omitting them doesn't crash the editor — it just hides the
affected UI: no `resolveTexture` means the Renderer module's Texture row isn't rendered at all,
and no `resolveGeometry` means "Load from file…" isn't offered for Mesh geometry. The catch: a
freshly created effect (i.e. `EffectEditorHost`/`Show()` called without `effectJson`) is built
with `texture: undefined` unless you also pass `textureOptions` + `resolveTexture`, so it's easy
to end up with an effect that has no visible particles simply because texture loading was never
wired up. Always pass `resolveTexture` (and `textureOptions` with at least one entry) unless you
intend every new effect to start textureless.

Reference implementation (from the standalone [`editor.html`](https://github.com/Soullnik/babylon.quarks-standalone/blob/main/examples/src/editorApp.tsx)):

```ts
resolveTexture: (url, scene) => {
    const texture = new Texture(url, scene);
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
},
resolveGeometry: async (file, scene) => {
    const result = await SceneLoader.ImportMeshAsync("", "", file, scene, null, ".glb");
    const mesh = result.meshes.find((m) => m.getVerticesData(VertexBuffer.PositionKind));
    // ...extract positions/indices/uvs/normals from `mesh`, dispose the imported nodes, return them
},
```

## Custom engines and headless use

`<EffectEditorHost>` creates a WebGL `Engine` on its canvas. Pass `createEngine` to build another
engine on that canvas instead, or a `NullEngine` in tests. It may return a promise:

```ts
createEngine: async (canvas) => {
    const engine = new WebGPUEngine(canvas);
    await engine.initAsync();
    return engine;
},
```

Build a new engine on every call: the host disposes it when it unmounts, and React StrictMode
mounts the host twice.

Everything the host does besides drawing its panels lives in an `EditorSession`, from the
`babylon.quarks-editor/session` entry: `createEditorSession({engine, playback, view, ...})`. The
session owns the scene, camera, gizmos, history, scene entries, assets, prefab mode and project
save/load, and reports changes through the `view` callbacks you pass. Use it to drive the editor
from your own UI, or to script and test editing without React. It builds the viewport (grid,
gizmos, markers), which is why it is not part of the lighter UI-free `.` entry.

## License

MIT
