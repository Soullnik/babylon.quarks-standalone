# Unity → Quarks Exporter

A Unity Editor utility that exports a Shuriken **Particle System** effect to the
**babylon.quarks** JSON format — the same envelope that [`QuarksLoader`](../../packages/babylon.quarks/src/QuarksLoader.ts)
loads and that the [effect editor](../../packages/babylon.quarks-editor) reads. Author an effect in
Unity, export it, and drop it straight into a Babylon.js scene.

The exporter is released with babylon.quarks and versioned with it: every file it writes names
the release in `metadata.generator` and the JSON format in `metadata.quarksFormat`. Its tests
export effects built in code and load the result with the runtime on every change (see
[Tests](#tests)). What Shuriken has and babylon.quarks does not is listed under
[Approximated or skipped](#approximated-or-skipped); the exporter logs a warning naming the system
whenever it meets one.

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

const loader = new QuarksLoader(scene);
const root = await loader.load('effects/Explosion.json');
root.parent = batchedRenderer; // your BatchedRenderer
```

…or open it in the effect editor via **Open from JSON**.

## What gets exported

| Unity module                         | Quarks mapping                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Main**                             | duration, loop, prewarm, start delay/lifetime/speed/size (incl. 3D size), start rotation (3D on meshes), start color (constant / two colors / gradient / two gradients) × material tint, max particles → `maxParticles`, simulation space → `worldSpace`, simulation speed → `playbackSpeed`, Scaling Mode → `scalingMode` (Local, the default, Hierarchy and Shape), culling mode, random seed, gravity → world-space `ForceOverLife`   |
| **Emission**                         | rate over time, rate over distance, bursts (time / count / cycles / interval / probability)                                                                                                                                                                                                                                                                                                                                              |
| **Shape**                            | Cone and Cone Volume (with its Length), Sphere, Hemisphere, Circle, Donut (radius, angle, radius thickness, arc with its **Mode** / **Spread** / **Speed**), **Mesh** → `mesh_surface` with a hidden source mesh, Box / Box Shell / Box Edge (size, box thickness) and Rectangle → `box`, Edge → `edge` (radius, mode), Position / Rotation / Scale → shape `transform`, Align to Direction, Randomize Direction → `ChangeEmitDirection` |
| **Color over Lifetime**              | `ColorOverLife` (gradient)                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Size over Lifetime**               | `SizeOverLife` (curve → piecewise Bézier; separate axes → per-axis `Vector3Function`)                                                                                                                                                                                                                                                                                                                                                    |
| **Rotation over Lifetime**           | `RotationOverLife` about Z (radians, sign flipped for billboards — Unity spins them clockwise); Separate Axes on a mesh → `Rotation3DOverLife` (see below)                                                                                                                                                                                                                                                                               |
| **Velocity over Lifetime**           | `VelocityOverLife` (linear + orbital XYZ, local/world)                                                                                                                                                                                                                                                                                                                                                                                   |
| **Inherit Velocity**                 | `InheritVelocity` (multiplier + initial/current)                                                                                                                                                                                                                                                                                                                                                                                         |
| **Limit Velocity over Lifetime**     | `LimitSpeedOverLife` (limit + dampen; separate axes → per-axis `Vector3Function` with its space)                                                                                                                                                                                                                                                                                                                                         |
| **Force over Lifetime**              | `ForceOverLife` (XYZ)                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Color / Size / Rotation by Speed** | `ColorBySpeed` / `SizeBySpeed` (separate axes → per-axis `Vector3Function`) / `RotationBySpeed` (+ speed range)                                                                                                                                                                                                                                                                                                                          |
| **Noise**                            | `Noise` (frequency + strength)                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Collision**                        | `ApplyCollision` (bounce; collider is host-provided)                                                                                                                                                                                                                                                                                                                                                                                     |
| **Texture Sheet Animation**          | tiles U/V, start tile, `FrameOverLife` (frame curve, constant or random range over every tile; Cycles repeat the curve)                                                                                                                                                                                                                                                                                                                  |
| **Trails**                           | per-particle trails of a system whose Render Mode is **None** → quarks trail render mode: trail material + texture, Width over Trail (× particle size), Lifetime → trail length, Color over Lifetime / Color over Trail folded into `ColorOverLife`, Die with Particles, World Space; texture runs from the particle like Unity's Stretch mode                                                                                           |
| **Sub Emitters**                     | child systems wired via `EmitSubParticleSystem` (Birth / Death; Collision, Trigger and Manual are skipped with a warning)                                                                                                                                                                                                                                                                                                                |
| **Renderer**                         | render mode (billboard ×4 / stretched / mesh), sort mode and order, min/max particle size, **Pivot** → `pivot` and **Flip** → `flip` (billboards and stretched billboards), mesh geometry (positions / indices / **both UV sets** / normals), the material (see below), optional **reflectionAtlas** (3×2 cubemap bake) + reflectionLevel when the material has a Cubemap                                                                |

Curves convert per-segment with a Hermite→Bézier transform so tangents are preserved; Unity
gradients sample both color and alpha keys.

### Materials

The URP, HDRP and built-in **Particles/Standard** shaders keep their surface in material properties,
which the exporter reads:

| Unity                                                     | babylon.quarks                                                                                                                                                                                                                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surface Type / Rendering Mode, blend factors              | `blending` from `_SrcBlend` / `_DstBlend` / `_BlendOp`: Alpha → `ALPHA_COMBINE`, Premultiply → `ALPHA_PREMULTIPLIED`, Additive → `ALPHA_ADD`, Multiply and Modulate → `ALPHA_MULTIPLY`, Subtractive → `ALPHA_SUBTRACT` (see below); Opaque → `transparent: false` |
| Alpha Clipping / Cutout, `_Cutoff`                        | `alphaTest`                                                                                                                                                                                                                                                       |
| `_ZWrite`                                                 | `depthWrite` (opaque surfaces write depth)                                                                                                                                                                                                                        |
| Render Face (`_Cull`)                                     | `renderFace` on mesh particles: Front → `'front'`, Back → `'back'`, Both → `'both'`                                                                                                                                                                               |
| Soft Particles, near / far fade                           | `softParticles`, `softNearFade`, `softFarFade` (the renderer needs a depth texture, see `BatchedRenderer.setDepthTexture`)                                                                                                                                        |
| Base Map / Main Texture with its Tiling / Offset and wrap | the texture (embedded, or a file), `mapUV.tiling` / `mapUV.offset` on UV channel 0 (after the flipbook, as in Unity), `wrap` (Repeat, Clamp, Mirror; Mirror Once as Mirror)                                                                                       |
| `_BaseColor`, `_Color`, legacy `_TintColor` (doubled)     | multiplied into the start color                                                                                                                                                                                                                                   |

The legacy particle shaders have no such properties and are read by name: Additive → `ALPHA_ADD`,
Additive (Soft) → `ALPHA_SCREENMODE`, Alpha Blended Premultiply → `ALPHA_PREMULTIPLIED`,
Alpha Blended → `ALPHA_COMBINE`, Multiply → `ALPHA_MULTIPLY`. Blend factors with no Babylon
counterpart, and custom shaders with neither, export as alpha blending.

## Approximated or skipped

Each of these logs a warning naming the system.

- **Rotation over Lifetime** with Separate Axes on mesh particles turns about the particle's own
  axes in babylon.quarks; Unity adds the rates to its Euler angles. Z matches; X and Y warn.
- **Subtractive** blending (`_BlendOp` Reverse Subtract) becomes `ALPHA_SUBTRACT`, which darkens
  the frame by the particle's color, frame × (1 − color), and ignores its alpha; Unity subtracts
  color × alpha. **Modulate** becomes `ALPHA_MULTIPLY`, without Unity's fade by alpha.
- **Mirror Once** wrap is exported as Mirror.
- **Sub Emitters** of type Collision, Trigger and Manual are skipped; Birth and Death are exported.
- **Trails** of a system that also draws particles, and Ribbon trails, are skipped (a babylon.quarks
  system has one render mode).

## Notes

- **Coordinate space:** node transforms are exported as a straightforward local TRS matrix. Unity
  is left-handed and three.js/Babylon right-handed, so off-origin child offsets may need a manual
  tweak; effects authored at the origin are unaffected.
- **Mesh shape:** exported as a `mesh_surface` emitter plus a hidden `Mesh` source node holding
  the geometry. Mesh Renderer, Skinned Mesh Renderer and Sprite shapes fall back to a point
  emitter, with a warning.
- **Meshes** keep their own normals; one without normals gets the runtime's. The export never
  changes a mesh asset.
- **Box shapes:** Box Shell and Box Edge pick a face or edge direction evenly per axis and sink
  half their particles into the box by up to twice the Box Thickness, as measured in Unity 6;
  Unity doesn't document either.
- **Material tint:** the material's `_BaseColor`, `_Color` or (doubled, as the legacy particle
  shaders do) `_TintColor` is multiplied into the start color, so HDR tints above 1 brighten the
  particles the same way. Other shader properties (emission, color mode) aren't read.
- **Collision:** only `bounce` is exported. quarks resolves collisions against a host-provided
  collider (e.g. the editor's ground plane), so Unity's collision planes/world aren't carried over.
- **3D rotation:** 3D start rotation and Separate Axes rotation over lifetime are exported for
  **Mesh** render mode, in Unity's rotation order; billboards can't tilt, so they use the Z angle
  only.
- **Texture Sheet Animation:** Grid mode only (Sprites mode isn't mapped), and Single Row,
  Time Mode other than Lifetime and a random start frame aren't mapped either.
- **Rotation direction:** Unity turns billboards clockwise for a positive angle and quarks
  counter-clockwise, so billboard and vertical-billboard angles and spins are negated on export.
  Horizontal billboards keep Unity's sign, which matches Unity's baked geometry; meshes keep it
  too, unchecked.
- **Shape transform:** Position / Rotation / Scale apply to every exported shape the way Unity
  applies them (spawn point through scale, rotation, then offset; start direction through the same
  scale and rotation, keeping its speed). Shapes that fall back to a point keep the offset and
  rotation.
- **Pivot / Flip** are checked vertex by vertex against Unity's baked geometry for billboards,
  vertical, horizontal and stretched billboards. Two Unity quirks are not reproduced: on a
  _rotating_ horizontal or vertical billboard Unity moves the pivot by something other than the
  rotated offset, and on a stretched billboard it ignores pivot Z. Mesh particles skip Pivot and
  Flip with a warning.
- **Horizontal and stretched billboards** draw their texture the other way up along V in quarks,
  so every exported one carries `flip` with V set to `1 − Unity's Flip V` (usually `1`), which
  turns it back the right way.
- **Max Particles** caps live particles per system like Unity's; emission past it is dropped
  rather than queued.
- **Mesh env map:** if the particle material exposes a Cubemap (`_Cube`, `_Cubemap`,
  `_ReflectionCubemap`, …, or any Cubemap-typed texture property), it is baked into a 3×2
  `reflectionAtlas` (px py pz / nx ny nz) so babylon.quarks can sample reflections on iOS.
  Materials without a cubemap export lit/diffuse only. Skybox is not used as a fallback.
- **Trails:** a quarks system has a single render mode, so a system that draws both particles
  and trails exports only the particles, and ribbon trails are skipped (both log a warning).
  Trail-only systems export with Stretch texturing, every particle trailed (Ratio 1) and
  Color over Trail taken at the head; Minimum Vertex Distance does not apply (quarks records one
  sample per 1/60s step).
- Modules with no quarks counterpart (Lights, Custom Data, External Forces, Triggers) are skipped.

## Tests

The tests need no Unity. From the repository root, with the [.NET SDK](https://dotnet.microsoft.com/download) 8 or later:

```bash
npm run test:exporter              # export every fixture and compare with the golden files
npm run test:exporter -- --update  # rewrite the golden files after a change to the output
```

`Tests~/` (which Unity skips) compiles the `Editor/` scripts as C# 8, the language Unity 2020.3
compiles, against stand-ins for the Unity API in `Tests~/Stubs/`, builds the effects in
`Tests~/Fixtures.cs` and compares the JSON and the warnings with `Tests~/golden/`. The
babylon.quarks suite loads the same golden files with a strict `QuarksLoader` and checks that they
carry what the fixtures set up, so a change on either side that breaks the other fails CI.

## Layout

```
Editor/
  Json.cs                 minimal JSON writer (no dependencies)
  ValueConverter.cs       MinMaxCurve / Gradient / AnimationCurve → quarks value JSON
  MaterialReader.cs       particle material → blending, depth, clipping, render face, soft particles
  ExportContext.cs        meta accumulation, texture embedding, node-uuid maps
  ParticleConverter.cs    Shuriken modules → the per-system "ps" object
  QuarksExporter.cs       menu entry + hierarchy walk + envelope assembly
  ExporterInfo.cs         version, generator and format written into every file
Tests~/                   .NET test project: Unity API stand-ins, fixtures, golden files
```
