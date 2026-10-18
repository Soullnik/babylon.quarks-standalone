# Changelog

All notable changes to the `babylon.quarks` package are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows the `quarks.core` 0.x version line.

## [0.23.0] — 2026-10-18

### Changed

- CPU simulation and batch upload rewritten to work on the `ParticleStore` columns instead of
  walking particle objects. Scalar attributes (`rotation`, `angularVelocity`, `uvTile`, `flip`,
  `startSpeed`) and mesh quaternion rotations now live in store columns; the sprite batch copies
  them as ranges and only visits particle objects for sub-emitted systems. Compiled behavior passes
  (now built for single behaviors too) read and write the columns, interpolate sampled curves and
  gradients inline and take per-particle random samples from a mirrored memory column, so a step
  no longer touches the particle object for the built-in behaviors. Snapshots of size and colour
  for the renderer are only kept when a behavior can change them, and the step's integration,
  newborn fix-up and compaction run in one pass. Trail ribbons transform each recorded sample
  once, upload indices straight to the GPU buffer (no per-frame sub mesh rebuild) and recompute
  the emitter matrix only when its transform changed. `Noise` and `TurbulenceField` evaluate
  constant generators once per frame and update through the columns. Measured on 50k particles:
  billboards 2.1–2.9x faster per frame, trails 1.5x, noise/turbulence 1.2x.
- Assigning a `Quaternion` to a sprite particle's `rotation` or `angularVelocity` copies it into
  the particle's store row; reading the property back returns a view of that row rather than the
  assigned object. `RandomQuatGenerator` stores its sample as four numbers in the particle's
  memory instead of a `Quaternion`. `TrailParticle.previous` (deprecated) is created on first use.

## [0.22.0] — 2026-10-17

### Added

- Mesh particle lighting modes: `ParticleSystem.lighting` (constructor option `lighting`, saved
  as `lighting` on the effect's `QuarksMaterial` and read back by `QuarksLoader`) is `'fixed'`
  (default — exactly the light mesh particles had before), `'unlit'` (the lighting term is
  compiled out with `MESH_UNLIT`: texture × particle colour, for emissive meshes) or `'scene'`
  (the scene's first enabled `DirectionalLight` / `HemisphericLight`, re-read every frame:
  direction, diffuse × intensity, `scene.ambientColor`, plus a hemispheric light's ground colour
  in the ambient; falls back to the fixed light when the scene has neither). Systems with
  different lighting are batched apart. The default is not written to JSON.
- `BatchedRenderer.setMeshLighting({direction, color, ambient})` (Babylon `Vector3` / `Color3`,
  any subset) sets the `'fixed'` light for every mesh batch of the renderer, including later ones;
  `getMeshLighting()` returns a copy, `defaultMeshLighting()` the built-in values
  (`(0.4, -1, 0.6)`, white, `0.35` grey). Exposed in the editor's Renderer module as "Lighting".
- Mesh particle rim (Fresnel) term: `ParticleSystem.rim` (constructor option `rim`, saved as
  `rim` on the effect's `QuarksMaterial`) — `{color: [r, g, b], power, strength, mode}` with
  defaults `[1, 1, 1]`, `2`, `1`, `'add'`; any field may be left out. The edge term is
  `pow(1 - |N·V|, power) * strength`; `'add'` adds `color` (glowing edge), `'mix'` blends toward it
  (outline). Compiled in only when set (`MESH_RIM` / `MESH_RIM_MIX`), batched by value, written to
  JSON only when set, and exposed in the editor's Renderer module. `normalizeMeshRim` /
  `meshRimEqual` are exported.

### Changed

- **Behaviour change:** quarks.core `WidthOverLength` (Width over Trail) now reads its curve as a
  multiplier on the width each trail sample was recorded with (the particle's `size.x` at that
  moment), the way Unity's Width over Trail works, and gives the head sample the curve's value at
  0, so a trail no longer flares out behind its head or steps at the tip. A new `absolute` flag
  (`new WidthOverLength(curve, absolute = false)`, JSON field `absolute`) keeps the old reading —
  the curve as the width in world units, the head at the particle's size. `toJSON` always writes
  the flag; JSON without it (everything written by 0.21 and earlier, including the Unity
  exporter's output) loads as `absolute: true`, so authored effects keep their look. Code that
  builds `new WidthOverLength(curve)` gets the new multiplier behaviour: divide an absolute curve
  by the start size, or pass `true`. `TrailParticle` gains `historyBaseSizes` (the unscaled
  recorded widths) and `headWidthScale`.

### Fixed

- Burst `cycle` / `interval` are honoured: a burst fires `cycle` waves, `interval` seconds apart,
  each rolling `probability` on its own. Repeats past the system's `duration` are dropped (a
  looping system starts them over every loop), a `cycle` below 1 fires once, and a zero interval
  fires every wave at once. Previously every burst fired a single wave.
- Emission over distance spreads the particles it owes along the path the emitter travelled
  this step, each at its own metre mark (the spacing carries across steps), instead of spawning
  all of them at the emitter's current position — a fast world-space emitter now leaves a
  continuous trail rather than one clump per frame. Only the position is interpolated (rotation
  and scale are the emitter's current ones) and the particles start at age 0. Local-space
  systems, whose particles move with the emitter, are unchanged.
- A sub emitter whose target uuid is not in the effect no longer throws on every frame.
  `QuarksLoader` unlinks it (`subParticleSystem = undefined`) with one `console.warn` naming the
  emitter and the uuid — also when the uuid names a node that is not a particle emitter — and
  quarks.core `EmitSubParticleSystem` skips any value that is not a resolved emitter. An
  unresolved uuid string is written back unchanged by `toJSON`.
- quarks.core `RotationOverLife` turns mesh particles too: a quaternion rotation is turned about
  the particle's local Z axis (the axis a number `startRotation` uses, and what Unity's Rotation
  over Lifetime without separate axes does to meshes), in its own pass and in the fused pass, and
  the step is kept for the renderer's in-between-step interpolation. It used to do nothing on
  meshes, silently. `Rotation3DOverLife` remains the behavior for any other axis.

## [0.21.0] — 2026-10-16

### Added

- `QuarksResourceResolver` on `QuarksLoaderOptions` (`resolve` / `fetchJson`) so File pickers,
  CDN layouts and virtual FS backends can resolve relative texture and geometry links without
  calling `resolveExternalGeometries` by hand.
- `loadFromJSON(json, baseUrl?)` — same pipeline as `load(url)` when the effect document is
  already in memory; `resolveResources` / static `resolveLinkedResources` for prepare-only.
- `loadAll(urls)` and `loadFromJSONAll(entries)` for battle / level preload: fetch effect docs
  (optional `concurrency`), resolve every linked geometry/image across the pack so shared asset
  urls hit a per-scene fetch cache once, then parse. `continueOnError` and `onProgress` (once per
  settled effect) supported; without `continueOnError` the return type is `TransformNode[]`.
- `QuarksLoader.joinUrl` for portable baseUrl joining (data/blob/absolute urls left alone).

### Changed

- `load(url)` goes through `loadFromJSON` after fetching the effect JSON. Geometry JSON fetches
  are deduped per scene; inlined array fields are copied so cached documents are not aliased
  across effects. Prefer `load` / `loadFromJSON` / `resolveResources` over
  `resolveExternalGeometries` (kept for compatibility).

## [0.20.0] — 2026-10-16

### Added

- `ParticleSystem.maxParticles` (optional, no limit when unset) caps how many particles a system
  keeps alive, like Unity's Max Particles: emission past the cap is dropped rather than queued.
  Saved in the effect JSON only when set.
- quarks.core `BoxEmitter` (`box`) emits from the volume, faces or edges of a box, with an
  optional per-axis thickness, moving particles along +Z; a box with no depth is a flat rectangle.
  `EdgeEmitter` (`edge`) emits from a line along X, moving particles along +Y. Both match the
  Unity shapes of the same name.

- Trail settings `uvFromHead`, `colorFromParticle`, `dieWithParticle` and `recordWorldSpace`
  (all optional, off by default) for trails that behave like Unity's: the texture runs from the
  particle back to the tail, the whole trail takes the particle's current color, the trail
  disappears the moment its particle dies, and a local-space system lays its trail points down in
  world space so they streak behind a moving emitter. Saved in the effect JSON only when switched
  on.
- Emitter shapes take an optional local `transform` (`ShapeTransform`: position, rotation
  quaternion, scale) like the Position / Rotation / Scale of Unity's Shape module. The spawn point
  goes through scale, rotation and offset, and the start direction through scale and rotation
  without changing the start speed. Every `quarks.core` shape and `MeshSurfaceEmitter` support
  it; the shape JSON gets a `transform` entry only when one is set.
- `ParticleSystem.pivot` (Unity's renderer Pivot): offsets billboard and stretched billboard quads
  from their particle, in particle-size units. Billboards turn the offset with the particle and
  move it toward the camera by z (up, for horizontal billboards); stretched billboards measure x
  from head to tail and y across. Systems with different pivots batch separately; the shaders
  only compile it in (`PIVOT`) when a pivot is set.
- `ParticleSystem.flip` (Unity's renderer Flip): the fraction of billboard and stretched billboard
  particles whose texture is mirrored along U and V, picked per particle at birth.
- Both are saved in the effect JSON (`pivot: [x, y, z]`, `flip: [u, v]`) only when non-zero, and
  carried by `clone()`.

### Changed

- `QuarksLoader` shares one `Texture` per scene between every effect that uses the same image with
  the same sampling, and one copy of identical mesh geometry. The renderer only batches systems
  that share these objects, so each loaded effect used to get batches of its own: 661 Epic Toon
  FX combat effects loaded together drew 2,577 batches, and draw 180 now. Turn it off per loader
  with `shareResources: false`; `QuarksLoader.clearSharedResources(scene)` forgets the shared set.

### Fixed

- `PiecewiseBezier` and `Gradient` (`quarks.core`) resampled their 257-point lookup tables on
  every refresh, which runs every simulation step for every behavior using them. The "unchanged"
  check compared the control points against a `Float32Array` copy, and any value float32 can't
  hold exactly (0.2, 0.3, …) never compared equal. With such curves, 1,000 systems took 22.9 ms
  per frame and now take 12.7 ms.
- An idle sprite batch uploaded its cleared instance (five or six vertex buffer updates) on every
  frame; it now does so once each time it goes empty. Systems with no particles are skipped when
  the batch is filled, and the emitter's matrix is only fully decomposed for local-space mesh
  particles.
- A trail texture now reaches the end of the ribbon on frames that draw no live tip (with
  `followLocalOrigin`, while paused, or exactly on a simulation step). The newest recorded sample
  stopped one segment short of the texture's end, which cut the end of the texture off and made
  it pop in and out as the tip came and went.

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
