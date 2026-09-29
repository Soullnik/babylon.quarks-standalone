# Unity → Quarks Exporter

A Unity Editor utility that exports a Shuriken **Particle System** effect to the
**babylon.quarks** JSON format — the same envelope that [`QuarksLoader`](../../packages/babylon.quarks/src/QuarksLoader.ts)
loads and that the [effect editor](../../packages/babylon.quarks-editor) reads. Author an effect in
Unity, export it, and drop it straight into a Babylon.js scene.

## Install

Pick one:

- **`.unitypackage`** — download `BabylonQuarksUnityExporter.unitypackage` from the
  [latest release](https://github.com/Soullnik/babylon.quarks-standalone/releases/latest), then
  in Unity: **Assets → Import Package → Custom Package…**. Lands under
  `Assets/BabylonQuarksUnityExporter/Editor/`. Built from this folder by
  `npm run build:unitypackage` (wired into the release pipeline, see
  [`build-unitypackage.mjs`](../../scripts/build-unitypackage.mjs)).
- **Copy into a project** — copy the `Editor/` folder anywhere under your project's `Assets/`
  (e.g. `Assets/QuarksExporter/Editor/`). The scripts are editor-only (guarded by the assembly
  definition), so they never ship in a build.
- **As a local UPM package** — in `Packages/manifest.json` add:
    ```json
    "com.babylonquarks.unity-exporter": "file:../path/to/tools/unity-quarks-exporter"
    ```

Requires Unity **2020.3+**.

## Use

### Single effect

1. In the Hierarchy, select the GameObject of your effect. This can be a single Particle System
   or a **parent** GameObject containing several (sub-emitters and grouped systems included).
2. Menu **Tools → Quarks → Export Selected Effect to JSON**.
3. Choose where to save the `.json`. Textures are embedded as data URIs, so the file is
   self-contained.

### Folder of prefabs

1. In the **Project** window, select a folder under `Assets` that contains effect prefabs
   (each prefab root or children must include at least one `ParticleSystem`).
2. Menu **Tools → Quarks → Export Folder of Effects to JSON**.
3. Pick an output folder on disk. Every matching prefab is exported as `{name}.json`; subfolders
   under the selected Assets folder are mirrored in the output.

Load the result in Babylon.js:

```ts
import {QuarksLoader} from 'babylon.quarks';

const loader = new QuarksLoader(scene, {baseUrl: ''});
const root = loader.parse(await (await fetch('Explosion.json')).json());
root.parent = batchedRenderer; // your BatchedRenderer
```

…or open it in the effect editor via **Open from JSON**.

See [`sample-output.json`](./sample-output.json) for a representative export (an emitter with a
death-triggered spark sub-emitter).

## What gets exported

| Unity module                         | Quarks mapping                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Main**                             | duration, loop, prewarm, start delay/lifetime/speed/size (incl. 3D size), start rotation, start color (constant / two colors / gradient / two gradients), simulation space → `worldSpace`, gravity → `ApplyForce`                                                                                                                                                                                  |
| **Emission**                         | rate over time, rate over distance, bursts (time / count / cycles / interval / probability)                                                                                                                                                                                                                                                                                                        |
| **Shape**                            | Cone, Sphere, Hemisphere, Circle, Donut (radius, angle, arc, thickness), **Mesh** → `mesh_surface`, randomize direction → `ChangeEmitDirection`, Position / Rotation / Scale → `shapeTransform`                                                                                                                                                                                                    |
| **Color over Lifetime**              | `ColorOverLife` (gradient)                                                                                                                                                                                                                                                                                                                                                                         |
| **Size over Lifetime**               | `SizeOverLife` (curve → piecewise Bézier)                                                                                                                                                                                                                                                                                                                                                          |
| **Rotation over Lifetime**           | `RotationOverLife` (deg→rad)                                                                                                                                                                                                                                                                                                                                                                       |
| **Velocity over Lifetime**           | `VelocityOverLife` (linear + orbital XYZ, local/world)                                                                                                                                                                                                                                                                                                                                             |
| **Inherit Velocity**                 | `InheritVelocity` (multiplier + initial/current)                                                                                                                                                                                                                                                                                                                                                   |
| **Limit Velocity over Lifetime**     | `LimitSpeedOverLife` (limit + dampen)                                                                                                                                                                                                                                                                                                                                                              |
| **Force over Lifetime**              | `ForceOverLife` (XYZ)                                                                                                                                                                                                                                                                                                                                                                              |
| **Color / Size / Rotation by Speed** | `ColorBySpeed` / `SizeBySpeed` / `RotationBySpeed` (+ speed range)                                                                                                                                                                                                                                                                                                                                 |
| **Noise**                            | `Noise` (frequency + strength)                                                                                                                                                                                                                                                                                                                                                                     |
| **Collision**                        | `ApplyCollision` (bounce; collider is host-provided)                                                                                                                                                                                                                                                                                                                                               |
| **Texture Sheet Animation**          | tiles U/V, start tile, `FrameOverLife` sweep                                                                                                                                                                                                                                                                                                                                                       |
| **Sub Emitters**                     | child systems wired via `EmitSubParticleSystem` (birth/death → quarks modes)                                                                                                                                                                                                                                                                                                                       |
| **Renderer**                         | render mode (billboard ×4 / stretched, incl. freeform / mesh, incl. Render Alignment), sort order, mesh geometry (positions / indices / uvs / **normals**), material blend mode + measured `tint` + main texture (embedded with its imported alpha) + the material's **Shader Graph** (`graph`), optional **reflectionAtlas** (3×2 cubemap bake) + reflectionLevel when the material has a Cubemap |

Curves convert per-segment with a Hermite→Bézier transform so tangents are preserved; Unity
gradients sample both color and alpha keys.

## Caveats (v1)

- **Coordinate space:** node transforms are exported as a straightforward local TRS matrix, in
  Unity's coordinates. Babylon's default handedness is Unity's (left-handed), so a scene with
  `useRightHandedSystem` off shows the effect exactly as authored; a right-handed scene (three.js,
  or Babylon with it on) mirrors it along Z.
- **Colour:** each material is rendered once during export to measure the gain it puts on the
  particle colour (its HDR colour, intensity, …), written as `tint`, and — when the blend cannot be
  read from the shader — how it blends. In a Linear project the materials also say
  `vertexColorSpace: "linear"`. The effects are made to look right in a default Babylon scene,
  with nothing to set up.
- **Shader Graph:** a material whose shader is a Shader Graph in the project exports what the graph
  computes for colour and alpha (`graph`) — masks, noise, UV scrolling, flow distortion, depth
  fade — compiled with the material's values; babylon.quarks draws billboards, stretched billboards
  and mesh particles with it. Supported: arithmetic and the common math nodes, Lerp / Step / Smoothstep /
  Clamp / Remap, Branch, Comparison, Split / Combine, UV (channel 0; other channels read 0), Vertex
  Color, Time, Sample Texture 2D (default type), Tiling And Offset, Split Texture Transform, Screen
  Position, Scene Depth, Camera and the graph's properties. A graph with anything else — a custom
  function, a sub-graph, a normal-map sample — is left out with a console warning naming the node,
  and the material draws as texture × `tint`. Trails always draw as texture × `tint`. Hand-written (ShaderLab / HLSL) shaders are not translated: they export their main
  texture and measured `tint`, and effects that lean on their extra features differ.
- **Mesh shape:** exported as a `mesh_surface` emitter plus a `Mesh` source node holding the
  geometry. That node is a real (visible) mesh in the loaded scene — hide/disable it if you only
  want it as an emission source. Box / Edge shapes still fall back to a point emitter.
- **Collision:** only `bounce` is exported. quarks resolves collisions against a host-provided
  collider (e.g. the editor's ground plane), so Unity's collision planes/world aren't carried over.
- **3D rotation:** 3D _start_ rotation is exported as an Euler generator for **Mesh** render mode
  (billboards can't tilt, so they use the Z angle only). Rotation **over lifetime** still exports
  the Z axis only.
- **Texture Sheet Animation:** the frame animation is exported as a full linear sweep over the
  sheet; Unity's `frameOverTime` curve / cycle semantics aren't mapped 1:1.
- **Blend mode** is read from data only, never from the shader's name: first the shader's ShaderLab
  source when it is a file in the project (its `Blend` / `BlendOp` statements, with `[_Property]`
  references resolved through the material), then the `_SrcBlend` / `_DstBlend` / `_BlendOp`
  properties (or the `_BUILTIN_` spellings Shader Graph generates), then the `Blend` surface
  option. Additive, alpha, premultiplied, multiply and subtract are recognised; for
  `One / OneMinusSrcAlpha` the `_ALPHAPREMULTIPLY_ON` keyword decides whether the shader
  premultiplies itself (→ alpha blend) or the texture is premultiplied (→ premultiplied). The
  exported material records the source in `blendModeSource`. Unity's built-in shaders that
  hard-code their blend (Legacy Shaders/Particles/\*, Mobile/Particles/\*) have neither source
  nor properties to read; for those the blend is measured by rendering the material
  (`blendModeSource: "measured"`), and only if that does not settle it either do they export as
  alpha blend with a console warning naming the material.
- **Mesh env map:** if the material's shader declares a Cube-dimension texture property with a
  cubemap bound (whatever the property is called), it is baked into a 3×2
  `reflectionAtlas` (px py pz / nx ny nz) so babylon.quarks can sample reflections on iOS.
  Materials without a cubemap export lit/diffuse only. Skybox is not used as a fallback.
- **Trails:** a system that draws only trails (Render Mode None) exports as quarks trails with its
  trail material, a length from the trail lifetime, and the Trails module's colour and width
  folded into the particle's colour and size where they are constants; a gradient along the trail
  is not carried. A system drawing both particles and trails exports its particles only.
- Modules with no quarks counterpart (Lights, Custom Data, Collision triggers) are skipped.

## Layout

```
Editor/
  Json.cs                 minimal JSON writer (no dependencies)
  ValueConverter.cs       MinMaxCurve / Gradient / AnimationCurve → quarks value JSON
  ExportContext.cs        meta accumulation, texture embedding, node-uuid maps
  MaterialProbe.cs        renders a material once to measure its gain and blend
  OffscreenRender.cs      renders a camera into a render texture from an editor script
  ShaderGraphCompiler.cs  Shader Graph file + material values → the material's "graph"
  ParticleConverter.cs    Shuriken modules → the per-system "ps" object
  QuarksExporter.cs       menu entry + hierarchy walk + envelope assembly
sample-output.json        example export (also used to validate the output format)
```
