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

The Console logs a **validity tier** (`full` / `good` / `partial` / `poor`) and any coverage
warnings for that hierarchy.

### Folder of prefabs

1. In the **Project** window, select a folder under `Assets` that contains effect prefabs
   (each prefab root or children must include at least one `ParticleSystem`).
2. Menu **Tools → Quarks → Export Folder of Effects to JSON** (everything) or
   **Export Folder (Good+ Validity Only)** (skips `partial` / `poor`).
3. Pick an output folder on disk. Every matching prefab is exported as `{name}.json`; subfolders
   under the selected Assets folder are mirrored in the output.

The Good+ export also writes `export-validity-report.json` next to the batch so you can see
what was kept vs skipped and why.

### Analyze a VFX pack (metadata)

For a large pack (hundreds/thousands of prefabs, many duplicates):

1. Select the pack root folder under `Assets`.
2. Menu **Tools → Quarks → Analyze Effect Pack Metadata**.
3. Save the report JSON.

The report includes:

| Field | Meaning |
| ----- | ------- |
| `summary.prefabCount` / `uniqueFingerprints` | Total prefabs vs deduped feature fingerprints |
| `summary.tiers` | `full` / `good` / `partial` / `poor` counts |
| `summary.estimatedExportablePct` | Weighted estimate toward a ~90% validity target |
| `featureHistogram` | How often each shape / module / curve mode appears |
| `gapImpact` | Which **missing** exporter mappings hit the most unique effects |
| `suspicionImpact` | Which **lossy/wrong conversion** heuristics fire most often |
| `effects[]` | Per-prefab score, tier, coverage issues; when suspicious, full `conversion` dump |

**Two layers of diagnosis:**

1. **Coverage gaps** — module/mode not implemented (Trails, Edge shape, …).
2. **Conversion dump** — feature *is* mapped, but Unity source values vs exported values look wrong
   (e.g. child with no material → default alpha while siblings are additive).

For a single hierarchy: **Tools → Quarks → Dump Conversion for Selected Effect** writes
`{name}.conversion.json` with per-system `unity` / `exported` side-by-side plus `suspicions[]`.

**Workflow toward ~90% validity:** analyze pack → sort `gapImpact` + `suspicionImpact` → close
mappings / fix value translation → re-analyze → batch-export with Good+ filter.

Load an exported effect in Babylon.js:

```ts
import {QuarksLoader} from 'babylon.quarks';

const loader = new QuarksLoader(scene, {baseUrl: ''});
const root = loader.parse(await (await fetch('Explosion.json')).json());
root.parent = batchedRenderer; // your BatchedRenderer
```

…or open it in the effect editor via **Open from JSON**.

Example Unity exports live under [`examples/public/`](../../examples/public/)
(e.g. `SimplePortalRed.json`, `magicZoneUnityExample.json`).

## What gets exported

| Unity module                         | Quarks mapping                                                                                                                                                                                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Main**                             | duration, loop, prewarm, start delay/lifetime/speed/size (incl. 3D size), start rotation, start color (constant / two colors / gradient / two gradients), simulation space → `worldSpace`, gravity → `ForceOverLife`                                                  |
| **Emission**                         | rate over time, rate over distance, bursts (time / count / cycles / interval / probability)                                                                                                                                                                          |
| **Shape**                            | Cone, Sphere, Hemisphere, Circle, Donut (radius, angle, arc, thickness), **Box / BoxShell / BoxEdge** → `rectangle` (XY; Z flattened), **Mesh** → `mesh_surface`, randomize direction → `ChangeEmitDirection`                                                      |
| **Color over Lifetime**              | `ColorOverLife` (gradient)                                                                                                                                                                                                                                           |
| **Size over Lifetime**               | `SizeOverLife` (curve → piecewise Bézier; **separate axes** → `Vector3Function`)                                                                                                                                                                                     |
| **Rotation over Lifetime**           | `RotationOverLife` (deg→rad)                                                                                                                                                                                                                                         |
| **Velocity over Lifetime**           | `VelocityOverLife` (linear + orbital XYZ, local/world)                                                                                                                                                                                                               |
| **Inherit Velocity**                 | `InheritVelocity` (multiplier + initial/current)                                                                                                                                                                                                                     |
| **Limit Velocity over Lifetime**     | `LimitSpeedOverLife` (limit + dampen)                                                                                                                                                                                                                                |
| **Force over Lifetime**              | `ForceOverLife` (XYZ)                                                                                                                                                                                                                                                |
| **Color / Size / Rotation by Speed** | `ColorBySpeed` / `SizeBySpeed` (incl. 3D size) / `RotationBySpeed` (+ speed range)                                                                                                                                                                                   |
| **Noise**                            | `Noise` (frequency + strength + position/rotation amount)                                                                                                                                                                                                            |
| **Collision**                        | `ApplyCollision` (bounce; collider is host-provided)                                                                                                                                                                                                                 |
| **Texture Sheet Animation**          | tiles U/V, start tile, `FrameOverLife` from Unity `frameOverTime` (scaled to frame indices)                                                                                                                                                                          |
| **Sub Emitters**                     | child systems wired via `EmitSubParticleSystem` (birth/death → quarks modes)                                                                                                                                                                                         |
| **Renderer**                         | render mode (billboard ×4 / stretched / mesh), sort order, mesh geometry (positions / indices / uvs / **normals**), material blend mode + main texture (embedded), optional **reflectionAtlas** (3×2 cubemap bake) + reflectionLevel when the material has a Cubemap |

Curves convert per-segment with a Hermite→Bézier transform so tangents are preserved; Unity
gradients sample both color and alpha keys. **TwoCurves** → `RandomBetweenCurves`; **TwoGradients**
(color over life) → `RandomColorBetweenGradient`.

## Caveats (v1)

- **Coordinate space:** node transforms are exported as a straightforward local TRS matrix. Unity
  is left-handed and three.js/Babylon right-handed, so off-origin child offsets may need a manual
  tweak; effects authored at the origin are unaffected.
- **Mesh shape:** exported as a `mesh_surface` emitter plus a `Mesh` source node holding the
  geometry. That node is a real (visible) mesh in the loaded scene — hide/disable it if you only
  want it as an emission source. Edge shapes still fall back to a point emitter.
- **Box shape:** mapped to quarks `rectangle` on the XY plane; box depth (Z) is not preserved.
- **Collision:** only `bounce` is exported. quarks resolves collisions against a host-provided
  collider (e.g. the editor's ground plane), so Unity's collision planes/world aren't carried over.
- **3D rotation:** 3D _start_ rotation is exported as an Euler generator for **Mesh** render mode
  (billboards can't tilt, so they use the Z angle only). Rotation **over lifetime** still exports
  the Z axis only.
- **Texture Sheet Animation:** the frame animation is exported as a full linear sweep over the
  sheet; Unity's `frameOverTime` curve / cycle semantics aren't mapped 1:1.
- **Blend mode** is inferred from the material's shader name / `_SrcBlend`/`_DstBlend`.
  Alpha Blended / Premultiply map to alpha blend; Additive → additive; Multiply/Modulate →
  multiply. Unusual custom shaders default to alpha blend.
- **Mesh env map:** if the particle material exposes a Cubemap (`_Cube`, `_Cubemap`,
  `_ReflectionCubemap`, …, or any Cubemap-typed texture property), it is baked into a 3×2
  `reflectionAtlas` (px py pz / nx ny nz) so babylon.quarks can sample reflections on iOS.
  Materials without a cubemap export lit/diffuse only. Skybox is not used as a fallback.
- Modules with no quarks counterpart (Lights, Trails ribbon, Custom Data, Collision triggers) are
  skipped — the pack analyzer flags them so you can see how often they block validity.

## Layout

```
Editor/
  Json.cs                 minimal JSON writer (no dependencies)
  ValueConverter.cs       MinMaxCurve / Gradient / AnimationCurve → quarks value JSON
  ExportContext.cs        meta accumulation, texture embedding, node-uuid maps
  ExportCoverage.cs       feature sniff + validity scoring (shared by analyze / export)
  ConversionDump.cs       Unity source ↔ exported values + conversion suspicions
  EffectPackAnalyzer.cs   pack metadata scan → histogram / gapImpact / per-effect report
  ParticleConverter.cs    Shuriken modules → the per-system "ps" object
  QuarksExporter.cs       menu entry + hierarchy walk + envelope assembly
```
