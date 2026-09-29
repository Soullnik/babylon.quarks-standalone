# Changelog

All notable changes to the `babylon.quarks` package are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows the `quarks.core` 0.x version line.

## Unreleased

Measured against Unity itself: the Unity exporter's parity capture renders a folder of effects in
Unity, and `tools/unity-parity-compare` renders the same exports here through the same camera and
compares the two. On the 15 effects of the first capture, image energy went from 3–40 % of Unity's
to within 5 % on nine and 15 % on twelve, with matching particle counts, positions, sizes and
colours; the rest are made of a few large particles whose random draw moves them, or not yet
explained (see `docs/UNITY_PARITY_AUDIT_HOVL.md`).

### Added

- **Shape transform.** `ParticleSystem.shapeTransform` (JSON `shapeTransform: {position, rotation,
scale}`, rotation a quaternion) offsets, turns and stretches the emitter shape inside its system,
  as Unity's Shape module Position / Rotation / Scale do — a cone turned to point up, a sphere
  stretched into a column. It applies to each particle's spawn position and direction; the
  system's own transform and simulation space are untouched.
- **Freeform stretching.** `rendererEmitterSettings.freeform` on a stretched billboard draws it as
  Unity's Freeform Stretching does: a billboard turned to the direction of travel and scaled about
  its centre along it, so it stays centred on the particle and keeps its width when the direction
  faces the camera.
- **Material tint.** A material's `tint` (RGBA) is a linear-space gain on the particle colour — what
  a Unity HDR colour or intensity does. RGB may go past 1.
- **Linear vertex colour.** A material with `vertexColorSpace: 'linear'` takes the particle colour
  as a linear value and decodes only the texture — what a Unity project in Linear colour space
  hands its particle shaders.
- **Linear output.** When the scene's image processing runs as a post-process (a
  `DefaultRenderingPipeline` with image processing on, say), particle colour leaves the shaders in
  linear space, as Babylon's own particles do, instead of being converted to gamma twice. This is
  followed on its own — nothing to set up — and a default scene is what exported effects are made
  to look right in. Materials rebuild when that setting changes.
- **Material graphs.** A material may carry `graph`: what its shader computes for colour and alpha,
  as a list of operations over its textures, the particle colour, UVs, time, the camera, the
  screen position and the scene depth — what the Unity exporter compiles a Shader Graph into.
  Billboards, stretched billboards and mesh particles draw with a fragment shader generated from
  it (GLSL and WGSL, one shared shader per graph and render mode), so masks, noise, UV scrolling,
  flow distortion and depth fade survive the export; a mesh drawn with a graph is unlit, the graph
  alone deciding its colour, as in Unity. The loader resolves its textures and `toJSON` writes it
  back. A graph that does not hold together is refused with a console warning and the material
  draws as texture × colour, as trails always do. `buildGraphFragment(graph)` and the
  `MaterialGraph` types are exported.
- `VFXBatch.isBatchMesh(mesh)` — whether a mesh is one of the renderer's own batch meshes, known by
  identity. Hosts listing scene meshes (e.g. as emission sources) can exclude them without relying
  on their names.
- `QuarksLoader.hasAuthoredName(node)` — whether a loaded node's name was written in the effect
  file. Unnamed nodes still get a stand-in (their JSON type or a constructor default); this tells
  the two apart from the data.

### Fixed

- **Repeating bursts.** A burst's `cycle` and `interval` were ignored: every burst fired once per
  loop, so a Unity burst of 1 × 20 cycles made one particle instead of twenty. Waves now fire
  `interval` apart, are cut at the end of the loop, and come out at most once per simulation step
  (as Unity's do, so a burst repeating faster than the step does not flood).
- **Stretched billboards with almost no speed.** The stretch direction came from the velocity only
  above 1e-6, but Unity effects routinely give a stretched glow a speed of 0.001 just to point it,
  which with a speed factor of 0 arrives far below that — the streak then lay along the view
  direction and drew as a line. Any non-zero speed now gives the direction.
- **Stretched billboards moved by behaviors.** The streak followed `velocity` alone, which
  VelocityOverLife, orbits and the like do not touch: particles rising by velocity-over-life drew as
  short dashes pointing at the camera. The streak now follows the particle's total motion, as
  Unity's does.
- **`layers` did nothing.** A system's layer mask (`layers` in JSON, `ps.layers.mask`) was stored
  and batched on but never reached the batch mesh, so every system drew for every camera. It now
  sets the batch mesh's `layerMask`: a camera draws a system when their masks share a bit, and a
  system on no layer still simulates but is not drawn.
- **Premultiplied blending with a fading particle.** In premultiplied mode the particle colour is
  premultiplied by its own alpha in the shader, so fading alpha fades the colour too instead of
  leaving an additive-looking glow. It is premultiplied in the space the blending runs in: with a
  tint or linear vertex colour in a gamma-space scene it was premultiplied before the conversion
  to gamma, so a particle fading in added its colour at alpha^(1/2.2) — a burst particle fading
  in over the one before (the soft glow at the root of an aura) popped in over it instead of
  blending into a steady pulse.

### Changed

- `QuarksLoader` warns about a texture when its image actually fails to load, instead of when its
  url lacks an image-looking extension. A `.png` that 404s now warns; an extensionless CDN url that
  loads fine no longer does.

### Removed

- A dead `constructor.name` read in `quarks.core`'s `ContinuousLinearFunction.toJSON`.

## [0.17.9] — 2026-07-14

### Fixed

- `ParticleSystem` JSON load — preserve `material` reference from exported metadata
  (`sourceMaterial`) so editor/renderer can resolve shader settings from the effect file.

## [0.17.7] — 2026-07-09

### Changed

- Docs reframed around the in-house `babylon.quarks-editor` effect editor and the Unity
  exporter as the primary authoring workflows, instead of the external quarks.art editor
  (quarks.art-exported JSON still loads fine — same format).
- `babylon.quarks-editor`'s README now documents the `resolveTexture`/`resolveGeometry` host
  callbacks: their per-entry-point signatures (`EffectEditorHost`/`Show()` pass a `Scene` second
  argument, the bare `EffectEditor` component does not) and what happens when they're omitted.

## [0.17.5] — 2026-07-02

### Added

- UMD/CDN bundle `dist/babylon.quarks.umd.min.js` exposing the `BabylonQuarks` global —
  usable in the Babylon.js Playground and plain `<script>` setups. `quarks.core` is bundled in;
  `@babylonjs/core` maps to the `BABYLON` global. `unpkg`/`jsdelivr` fields point to it.
- WebGPU support validated: all render modes (billboard, stretched billboard, mesh, trail)
  create pipelines under `WebGPUEngine` with zero validation errors (GLSL is transpiled to WGSL
  by Babylon automatically). Documented in the README.
- Exported types that the public API referenced but did not export:
  `AdaptivePerformanceOptions`, `AdaptivePerformanceState`, `ParticleSystemJSONParameters`,
  `BabylonMetaData`, `AnimationData`, `QuarksTimelineClip`, `BurstParametersJSON`.
- API documentation generated with TypeDoc, published at
  <https://soullnik.github.io/babylon.quarks-standalone/docs/>.

### Changed

- `SpriteBatch` and `QuarksLoader` pass typed arrays to Babylon `VertexData` directly instead
  of copying them through `Array.from`.
- `BatchedRenderer` internals use typed `ParticleSystem` narrowing instead of `as any` casts
  (public signatures unchanged).

### CI

- npm publishing switched to trusted publishing (OIDC) with provenance.

## [0.17.4] — 2026-05-15

### Changed

- `QuarksLoader` test coverage reworked; demo application restructured (new demos, hero
  background). No functional changes to the package runtime.

## [0.17.3] — 2026-05-13

### Added

- Adaptive performance budget controls on `BatchedRenderer`
  (`configureAdaptivePerformance` / `disableAdaptivePerformance` / `getAdaptivePerformanceState`)
  with per-system quality scaling.

### Performance

- Tightened particle system update and spawn loops.
- Reduced hot-path allocations in renderer batches.
- Fast trail history ring buffers for trail rendering.

### Tests

- Extensive coverage expansion (sprite/trail batch integration, particle system, loader,
  prefab and utility paths) with enforced coverage thresholds.

## [0.17.2] — 2026-05-11

### Fixed

- `QuarksLoader` marks sub-emitter systems as `onlyUsedByOther` after UUID resolution.
- Custom blending mode handling refined.

### Added

- Tile blending support in shaders (additional UV calculations).

## [0.17.1] — 2026-05-11

### Changed

- Packaging setup for the standalone monorepo (README shipped with the package,
  tarball content checks).

## [0.17.0] — 2026-05-11

### Added

- Initial public release: a high-performance batched particle system for Babylon.js built on
  `quarks.core` — batched sprite/trail rendering, billboard/stretched/mesh/trail render modes,
  soft particles, texture tile animation, sub-emitters, mesh surface emitter plugin,
  `QuarksLoader` for quarks.art / Unity-exported JSON, `QuarksUtil` helpers.

[0.17.5]: https://github.com/Soullnik/babylon.quarks-standalone/releases/tag/v0.17.5
[0.17.4]: https://www.npmjs.com/package/babylon.quarks/v/0.17.4
[0.17.3]: https://www.npmjs.com/package/babylon.quarks/v/0.17.3
[0.17.2]: https://www.npmjs.com/package/babylon.quarks/v/0.17.2
[0.17.1]: https://www.npmjs.com/package/babylon.quarks/v/0.17.1
[0.17.0]: https://www.npmjs.com/package/babylon.quarks/v/0.17.0
