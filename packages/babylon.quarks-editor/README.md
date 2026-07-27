# babylon.quarks-editor

Shuriken-style effect editor for [babylon.quarks](https://www.npmjs.com/package/babylon.quarks): a Unity-like hierarchy of particle systems with a stacked module inspector. Headless edit-model core plus embeddable React UI.

[Live editor](https://soullnik.github.io/babylon.quarks-standalone/editor.html) · [Source](https://github.com/Soullnik/babylon.quarks-standalone/tree/main/packages/babylon.quarks-editor)

## Install

```bash
npm install babylon.quarks-editor babylon.quarks @babylonjs/core react @heroicons/react @tanstack/react-virtual
```

## Usage

```tsx
import {EffectBinding, EffectHistory} from 'babylon.quarks-editor';
import {EffectEditor} from 'babylon.quarks-editor/react';

const binding = new EffectBinding(particleSystem); // your babylon.quarks ParticleSystem
const history = new EffectHistory();
history.attach(binding);

<EffectEditor binding={binding} />;

// Serialize to Quarks JSON (round-trips through QuarksLoader):
const json = binding.exportJSON('MyEffect');
```

Modules: Main, Emission (bursts), Shape (7 emitter types), Speed/Limit Speed/Force/Rotation over Lifetime, Gravity, Color over Lifetime (gradient), Size over Lifetime (curve), Noise, Sub Emitters, Texture Sheet Animation, Renderer. Multi-system hierarchy with add/remove/rename, undo/redo via `EffectHistory`.

The `.` export is UI-free (edit model, serialization, value/shape/gradient helpers) — usable headless. The `./react` export ships the components; React is a peer dependency, so the same UI can mount in a standalone page or inside a [BabylonJS Editor](https://github.com/BabylonJS/Editor) plugin.

## Textures & meshes (`resolveTexture` / `resolveGeometry`)

The editor never loads assets itself — it defers to host-supplied callbacks so it doesn't need
an opinion on your CDN, asset pipeline, or loader (`@babylonjs/loaders`, your own backend, etc.):

- `resolveTexture(url) => Texture-like` — turns a picked URL or `data:` URI (from "Custom URL…" /
  "Load from file…" in the Renderer module) into whatever object you assign as `system.texture`.
- `resolveGeometry(file) => Promise<GeometryData>` — turns a picked file (from "Load from file…"
  in the Mesh render mode's geometry dropdown) into vertex buffers: `{positions, indices?, uvs?,
normals?}` (typed arrays or plain number arrays).
- `textureOptions?: {label, url}[]` / `geometryOptions?: {label, positions, indices?, uvs?,
normals?}[]` — preset lists shown alongside "Custom URL…" / "Load from file…".

**Signature differs by entry point** — a common source of "works in the demo, throws in my
host" bugs:

- `QuarksEffectEditor.Show(...)` / `<EffectEditorHost>` call your callbacks with the live
  `Scene` as a second argument: `resolveTexture: (url, scene) => unknown`,
  `resolveGeometry: (file, scene) => Promise<GeometryData>`.
- The lower-level `<EffectEditor>` (no Host wrapper) does **not** pass a scene:
  `resolveTexture: (url) => unknown`, `resolveGeometry: (file) => Promise<GeometryData>`. If you
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

## License

MIT
