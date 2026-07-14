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
import { QuarksLoader } from "babylon.quarks";

const loader = new QuarksLoader(scene, { baseUrl: "" });
const root = loader.parse(await (await fetch("Explosion.json")).json());
root.parent = batchedRenderer; // your BatchedRenderer
```

…or open it in the effect editor via **Open from JSON**.

See [`sample-output.json`](./sample-output.json) for a representative export (an emitter with a
death-triggered spark sub-emitter).

## What gets exported

| Unity module | Quarks mapping |
| --- | --- |
| **Main** | duration, loop, prewarm, start delay/lifetime/speed/size (incl. 3D size), start rotation, start color (constant / two colors / gradient / two gradients), simulation space → `worldSpace`, gravity → `ApplyForce` |
| **Emission** | rate over time, rate over distance, bursts (time / count / cycles / interval / probability) |
| **Shape** | Cone, Sphere, Hemisphere, Circle, Donut (radius, angle, arc, thickness), **Mesh** → `mesh_surface`, randomize direction → `ChangeEmitDirection` |
| **Color over Lifetime** | `ColorOverLife` (gradient) |
| **Size over Lifetime** | `SizeOverLife` (curve → piecewise Bézier) |
| **Rotation over Lifetime** | `RotationOverLife` (deg→rad) |
| **Velocity over Lifetime** | `VelocityOverLife` (linear + orbital XYZ, local/world) |
| **Inherit Velocity** | `InheritVelocity` (multiplier + initial/current) |
| **Limit Velocity over Lifetime** | `LimitSpeedOverLife` (limit + dampen) |
| **Force over Lifetime** | `ForceOverLife` (XYZ) |
| **Color / Size / Rotation by Speed** | `ColorBySpeed` / `SizeBySpeed` / `RotationBySpeed` (+ speed range) |
| **Noise** | `Noise` (frequency + strength) |
| **Collision** | `ApplyCollision` (bounce; collider is host-provided) |
| **Texture Sheet Animation** | tiles U/V, start tile, `FrameOverLife` sweep |
| **Sub Emitters** | child systems wired via `EmitSubParticleSystem` (birth/death → quarks modes) |
| **Renderer** | render mode (billboard ×4 / stretched / mesh), sort order, mesh geometry, material blend mode + main texture (embedded) |

Curves convert per-segment with a Hermite→Bézier transform so tangents are preserved; Unity
gradients sample both color and alpha keys.

## Caveats (v1)

- **Coordinate space:** node transforms are exported as a straightforward local TRS matrix. Unity
  is left-handed and three.js/Babylon right-handed, so off-origin child offsets may need a manual
  tweak; effects authored at the origin are unaffected.
- **Mesh shape:** exported as a `mesh_surface` emitter plus a `Mesh` source node holding the
  geometry. That node is a real (visible) mesh in the loaded scene — hide/disable it if you only
  want it as an emission source. Box / Edge shapes still fall back to a point emitter.
- **Collision:** only `bounce` is exported. quarks resolves collisions against a host-provided
  collider (e.g. the editor's ground plane), so Unity's collision planes/world aren't carried over.
- **3D rotation:** 3D *start* rotation is exported as an Euler generator for **Mesh** render mode
  (billboards can't tilt, so they use the Z angle only). Rotation **over lifetime** still exports
  the Z axis only.
- **Texture Sheet Animation:** the frame animation is exported as a full linear sweep over the
  sheet; Unity's `frameOverTime` curve / cycle semantics aren't mapped 1:1.
- **Blend mode** is inferred from the material's shader name / `_DstBlend`; unusual custom shaders
  default to alpha blend.
- Modules with no quarks counterpart (Lights, Trails ribbon, Custom Data, Collision triggers) are
  skipped.

## Layout

```
Editor/
  Json.cs                 minimal JSON writer (no dependencies)
  ValueConverter.cs       MinMaxCurve / Gradient / AnimationCurve → quarks value JSON
  ExportContext.cs        meta accumulation, texture embedding, node-uuid maps
  ParticleConverter.cs    Shuriken modules → the per-system "ps" object
  QuarksExporter.cs       menu entry + hierarchy walk + envelope assembly
sample-output.json        example export (also used to validate the output format)
```
