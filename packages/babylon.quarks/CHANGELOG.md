# Changelog

All notable changes to the `babylon.quarks` package are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows the `quarks.core` 0.x version line.

## [1.0.0-rc.1] — Unreleased

Phase 9 of the road to 1.0: the file format and the platforms are made ready to be promised.

### Breaking

- **`@babylonjs/core` 9.24 or later.** The peer range was `^9.0.0`, but the library already used
  Babylon's white balance image processing define, added in 9.24, and the `ALPHA_REPLACE_COLOR`
  blend mode, added before it. On an older 9.x its types did not compile, and white balance and
  that blend mode did not work.
  The range is now `^9.24.0`, and CI builds, tests and compiles every shader against 9.24.0 and
  the latest release.
- **Effect files are format 3** (`QUARKS_FORMAT_VERSION`). Nothing is written for three.quarks any
  more: a system no longer writes `version: '3.0'`, and its start and emission curves and
  `behaviors` are written only when they differ from their defaults, as every other setting is.
  babylon.quarks 0.30 reads these files as they are meant, after a warning that the format is
  newer. 0.29 also skips a prefab's clip tracks, and 0.28 reads a system's Scaling Mode with its
  older meaning, so a system on the `'local'` default looks different there. three.quarks and
  babylon.quarks 0.27 and earlier do not read them.
  `ParticleSystemJSONParameters.version` is optional and no longer written.

### Added

- **Format migrations:** a file of an older format is upgraded as it is read, one step for each
  later version that changed what a file means, as Unity upgrades an asset on import. Format 2's
  step gives a system from before 0.29 the Scaling Mode that keeps its look, which the loader did
  before; format 3's names a prefab's `'three'` track `'clip'` and drops `ps.version`.
- **Effect file schema:** `babylon.quarks/schema/effect.schema.json`, a JSON Schema (draft
  2020-12) of the files this release writes, also published at
  `https://soullnik.github.io/babylon.quarks-standalone/schema/effect-3.schema.json`. A file can
  name it in `$schema` for editor completion; the loader ignores the field. Tests validate effects
  built in code, the golden fixtures, the example effects and the Unity exporter's golden output
  against it.

- Golden files saved by every published release from 0.27.0 to 0.30.0, each of which must load as
  the effect it was written from.

- **Bundle size budget:** `npm run check:pack` fails when a published bundle grows past its
  gzipped budget in `scripts/size-budget.json` (110 kB for each babylon.quarks bundle, about
  101 kB today), so growth is decided in the PR that causes it.

### Changed

- **A steady frame allocates nothing per particle**, so a large effect no longer hands the
  garbage collector work in proportion to its size. `npm run check:allocations` measures it in CI:
  each render mode bare and with every stock behavior at once, sorted batches, and each stock
  behavior on its own (Noise also turning mesh particles through a remap curve, Color over
  Lifetime also on trails).
  - Batches upload their buffers through kept views, rounded up to whole chunks, instead of a new
    view of each buffer every frame (about 1.3 KB a frame per batch). A sorted batch keeps the
    views of both buffers it swaps between.
  - Noise and Turbulence Field read the simplex field through a typed array instead of passing
    and returning numbers, which the engine boxed: 64 bytes per particle per frame for Noise, and
    several hundred for Turbulence Field. Noise turning mesh particles works on the quaternion's
    values instead of through its view (up to 80 bytes per particle), reads a remap curve from its
    sampled table, and no longer reads each particle's angle through its boxed getter.
  - Force over Lifetime reads its curves from their sampled tables, as Size over Lifetime does.
    Color by Speed reads its gradient from its sampled table and updates its particles in one
    loop, as Color over Lifetime does: a stepped gradient key is blended over 1/256 of the speed
    range, as one in Color over Lifetime already is over 1/256 of the lifetime.
  - Emitting a particle still allocates about 250 bytes, most of it the particle's generator
    memory being grown again after it was emptied for reuse.

### Fixed

- **A mesh with a second UV set drew nothing on WebGPU.** A mesh batch bound its position,
  normal, UV and UV2 as four vertex buffers, next to five per-instance ones: nine, and WebGPU
  allows eight by default, so no pipeline could be made for it, and the whole frame was dropped,
  every other effect and the scene with it. A batch's geometry is now one interleaved buffer, bound once: a mesh batch takes at
  most six bindings, and a stretched billboard or beam seven. Found on real hardware with the
  trail surface demo.
- Noise with a rotation amount threw on a trail, whose particles have no rotation: it took them
  for mesh particles and turned a quaternion they do not have. They now take no turn and still
  move with the noise.
- `serializeEffect` given several roots wrote the group it adds around them with its matrix as an
  object of numbered keys, not an array. The loader read it, but other tools would not.

## [0.30.0] — 2026-10-24

Phase 8 of the road to 1.0: the public API is frozen, so 0.30 is the last release that changes it
on purpose. quarks' own math leaves the public API, which takes Babylon's vectors and colours,
deprecated aliases and dead parameters are removed, custom behaviors are recognised by
implementation and have a guide, and the public surface is recorded in API reports.

### Upgrading from 0.29

Files from 0.29 load as they are, and effects built from the built-in behaviors look as before,
apart from the `ApplySequences` fixes below; the upgrade is in code. Check these, in this order:

1. **Math imports:** import `Vector2`, `Vector3`, `Quaternion`, `Color3` and `Color4` from
   `@babylonjs/core`, not from `babylon.quarks`, and Babylon's `Matrix` where you used quarks'
   `Matrix3` or `Matrix4`. Colours are `{r, g, b, a}`: replace `new Vector4(r, g, b, a)` in a
   `ConstantColor`, `ColorRange`, `RandomColor` or `tint` with a `Color4`, and `Gradient` colour
   keys with `Color3`. Code that read a colour's `x`/`w` reads `r`/`a`. A colour read back has
   accessors, so copy it field by field (`new Color4(c.r, c.g, c.b, c.a)`) rather than spreading
   it or passing it to `JSON.stringify`.
2. **Removed aliases:** `autoDestroy` → `stopAction: 'destroy'`, `speedFactor` →
   `rendererEmitterSettings`, `eular` → `euler`, `addThreeAnimation` → `addClipAnimation`, and
   the editor's `importGallery` → `importAssets`. The rest of what is removed, such as the
   `dependencies` argument of `fromJSON`, `MeshSettings.startRotationX/Y/Z`, the editor's
   `rgbaToVector4` and `PhysicsResolver.resolve`'s `normal.set`, is listed under Breaking with its
   replacement.
3. **Read-only state:** code that assigned `particleNum`, `particles` or `emissionState` no longer
   compiles; let the renderer keep them, and call `restart()` to clear a system.
4. **Vector methods on read-back values:** `pivot`, `flip`, `ringBufferLoopRange` and
   `TrailSettings.sideAxis` are plain `{x, y, z}` objects; use Babylon's math to work on them.
5. **Custom behaviors:** a subclass of a built-in, or a custom behavior whose `type` names a
   built-in, now always runs its own methods, which can be slower than the compiled built-in; a
   subclass that overrides `update` has it called. See
   [Extending babylon.quarks](https://github.com/Soullnik/babylon.quarks-standalone/blob/main/docs/EXTENDING.md).
6. **Prefabs with a clip track** are saved with `'clip'`, which a 0.29 runtime skips; load them
   with 0.30.
7. **Versions:** install `babylon.quarks-editor` 0.30 with `babylon.quarks` 0.30. Files from the
   Unity exporter 0.29 load as they are.

### Breaking

The public surface is cleaned before it is frozen. Every item below but the last, the switch to
Babylon's math types, was deprecated or had no effect; files written by earlier releases still load
as before.

- **Deprecated aliases are removed:**
  - `ParticleSystem.autoDestroy`, the `autoDestroy` constructor parameter and
    `QuarksUtil.setAutoDestroy`: use `stopAction: 'destroy'` and `QuarksUtil.setStopAction`.
    A file's `autoDestroy: true` still reads as `'destroy'`.
  - `IParticleSystem.autoDestroy` (quarks.core): read `stopAction`.
  - The `speedFactor` constructor parameter: set it in `rendererEmitterSettings`. A file's
    top-level `speedFactor` is still read.
  - `EulerGenerator.eular`: use `euler`.
  - `Matrix4.extractPosition`, `multiplyToArray` and `setRotationFromQuaternion`: use
    `copyPosition` and `makeRotationFromQuaternion`.
  - `MeshSettings.startRotationX/Y/Z`, which were never read: `MeshSettings` has no fields. Set the
    system's `startRotation` to an `EulerGenerator`.
  - `TrailParticle.previous` and `RecordState`, the old trail history that was no longer filled,
    and quarks.core's `LinkedList`, which only it used.
- **Dead parameters are removed:** `ParticleSystem.fromJSON(json, meta, scene)` no longer takes a
  `dependencies` map, and `toJSON` no longer takes `SerializationOptions`, which nothing read
  (also removed from `IParticleSystem.toJSON` and `ParticleEmitter.toJSON`).
- **Read-only state:** `ParticleSystem.particleNum` is a getter, and `particles` and
  `emissionState` are `readonly`, on the class and on quarks.core's `IParticleSystem`; the renderer
  keeps them. Code that wrote them, through either type, no longer compiles, and in JavaScript
  `ps.particleNum = 0` throws a `TypeError`.
- **The prefab's clip track is `'clip'`,** not `'three'`: `AnimationData.type` is `'clip' | 'ps'`
  and `QuarksPrefab.addThreeAnimation` is `addClipAnimation`. Files are written with `'clip'`;
  a `'three'` track from three.quarks or an older babylon.quarks is read as a clip track. A 0.29
  runtime and three.quarks skip a `'clip'` track.
- **editor:** the session handle's `importGallery` alias is removed; use `importAssets`.
- **quarks' own math is no longer exported; the API takes Babylon's types.** `Vector2`, `Vector3`,
  `Vector4`, `Quaternion`, `Matrix3` and `Matrix4` were quarks.core's simulation math, exported
  next to Babylon's classes of the same names, so an editor's auto-import picked the wrong one.
  Every public input now takes a structural type, `Vector2Like`, `Vector3Like`, `QuaternionLike`,
  `Color3Like` or `Color4Like` (exported): a Babylon `Vector3`, `Quaternion`, `Color3` or `Color4`
  is accepted as it is, and so is a plain `{x, y, z}` or `{r, g, b, a}`. Values are copied, so the
  caller keeps their own object. To upgrade, import the math from `@babylonjs/core` instead of
  `babylon.quarks`:
  - **Colours are `{r, g, b, a}`, not a `Vector4`:** `new ConstantColor(new Color4(1, 0.5, 0, 1))`,
    `new ColorRange(a, b)`, `new RandomColor(a, b)`, `ParticleSystem.tint`, and `Gradient` keys as
    `Color3` (`[[new Color3(1, 1, 1), 0], ...]`). Code that read a tint's `x`/`w` reads `r`/`a`.
  - **Vectors are any `{x, y, z}`:** `ApplyForce.direction`, `GravityForce.center`,
    `AxisAngleGenerator.axis`, `OrbitOverLife.axis`, `VelocityOverLife.orbitalOffset`,
    `TurbulenceField.scale`/`velocityMultiplier`/`timeScale`, `TextureSequencer.position`,
    `ShapeTransform.position`/`rotation`/`scale`, `ParticleSystem.pivot`, `flip`,
    `ringBufferLoopRange` and `TrailSettings.sideAxis`. Setting one copies the value (`sideAxis` when
    the system is built); reading it gives an object you can still edit in place
    (`force.direction.x = 1`). A colour read back, such as `ConstantColor.color`, has `r`, `g`, `b`
    and `a` as accessors over quarks' own storage, so copy it field by field
    (`new Color4(c.r, c.g, c.b, c.a)`) rather than spreading it or passing it to `JSON.stringify`.
  - `ParticleSystem.pivot`, `flip`, `ringBufferLoopRange` and `TrailSettings.sideAxis` read back
    as plain objects, without vector methods.
  - `getWorldBounds(min, max)` and `getBeamEnd(out)` fill any `{x, y, z}`, such as a Babylon
    `Vector3`.
  - `PhysicsResolver.resolve(position, normal)` (quarks.core) takes `Vector3Like` values: write
    the normal's `x`, `y` and `z` instead of calling `normal.set`.
  - Custom behaviors, shapes and generators still receive quarks' internal vectors in
    `initialize`, `update` and `genValue`/`genColor`, as before; the type is inferred from the
    interface they implement.
  - **editor:** `rgbaToVector4` is removed; pass `{r, g, b, a}`.

### Added

- **API reports:** the public API of `babylon.quarks`, `quarks.core` and each entry point of
  `babylon.quarks-editor` is recorded in the repository (`packages/*/api/*.api.md`, written by API
  Extractor), and `npm run check` and CI fail when a change alters it without updating the report.
  Every change to the public surface is now visible in review.
- **[Extending babylon.quarks](https://github.com/Soullnik/babylon.quarks-standalone/blob/main/docs/EXTENDING.md):** the contract for custom behaviors and
  emitter shapes (the hooks and when they run, what a behavior sees, the compiled pass, plugins
  and saving), with every example run by the tests.
- `ApplySequences` documents what it does and its limits: sequences play once, in seconds since
  the behavior was reset, each move eases in and out, and each particle starts `delay` after the
  one before. `Noise`,
  `TurbulenceField`, `OrbitOverLife` and `VelocityOverLife` say which to pick for what.
- Tests hold the editor-facing `params` of every registered behavior and shape to the class's
  fields and JSON, and every live parameter's in-place update to what a new material holds.
- `ShaderImageProcessing`, the type of `ShaderContext.imageProcessing`, is exported.
- `Gradient.evaluate(t, target?)`, as Unity's `Gradient.Evaluate`: the colour at `t` as
  `{r, g, b, a}`, written into `target` (such as a Babylon `Color4`) when one is given, for tools
  and UI that draw a gradient.

### Fixed

- **Custom behaviors run their own code, whatever their `type`.** The renderer compiled a behavior
  into its fused pass by its `type` string, so a custom behavior named like a built-in, or a
  subclass of a built-in with its own `update`, ran the built-in's code instead of its own, and
  was assumed not to change size or colour. Behaviors are now recognised by implementation: only
  an instance of exactly the built-in class, with no method set on the instance, is compiled.
  Every subclass runs its own methods, which can be slower than before for a subclass that only
  added fields.
- A subclass that overrides `update` but inherits its parent's `updateAll` has its `update`
  called; the inherited `updateAll` skipped the override. Such a subclass no longer takes the
  faster `updateAll` path.
- `ApplySequences` lands each particle on its point when its move ends; the last frame of a move
  left it short of the point, by up to a frame's step. A particle whose delayed move to one
  sequence is cut short by the next sequence now moves to the next sequence's point; it went on
  towards the old one.
- The renderer and the editor find sub-emitter links by `instanceof EmitSubParticleSystem`, not
  by the `type` string, so an object that only looks like one no longer orders or unlinks
  systems.

## [0.29.0] — 2026-10-24

Phase 7 of the road to 1.0: what still behaves differently from Unity is brought in line before
the API and the look of effects are frozen. Cones tilt and fill like Unity's and emit from their
volume, Scaling Mode has Unity's Local, Hierarchy and Shape, curves can be random between two,
Limit Velocity has Separate Axes, a system has a Stop Action and a Ring Buffer Mode, and the
particles take the scene's image processing as Babylon's own materials do.

### Upgrading from 0.28

Effects in a scene without image processing, at scale 1 and without cones, look as before. Check
these, in this order:

1. **Scenes with image processing** (tone mapping, exposure, contrast, a vignette or grading, also
   when set up by `createDefaultEnvironment()` or a `DefaultRenderingPipeline`): the particles now
   take it. Re-tune colours that were authored to look right without it, or set
   `applyImageProcessing: false` on a system to keep the old look.
2. **Scaled emitters or scaled parents:** the default Scaling Mode is now `'local'`. Set
   `scalingMode: 'hierarchy'` where a parent's scale should reach the effect. Files saved before
   0.29 read as `'hierarchy'` and keep their look; save them again to write format 2.
3. **Cones:** particles between the centre and the rim lean out more (Unity's tilt). Re-tune an
   effect that relied on the narrower middle.
4. **`autoDestroy`** still works but is deprecated: use `stopAction: 'destroy'`. Files are
   written with `stopAction`, which a 0.28 runtime does not read.
5. **TypeScript:** narrow `LimitSpeedOverLife.speed` before calling `genValue` on it
   (`!(speed instanceof Vector3Function)`); a custom behavior reading `emitter.matrixWorld` gets
   the matrix with the Scaling Mode's scale.
6. **Files are format 2.** babylon.quarks 0.28 warns about them and reads their systems with its
   own Scaling Mode. Install `babylon.quarks-editor` 0.29 with `babylon.quarks` 0.29, and export
   from the Unity exporter 0.29 for this runtime.

### Breaking

- `autoDestroy` gives way to `stopAction` (`'none'`, `'disable'` or `'destroy'`, Unity's Stop
  Action). Files are written with `stopAction` and no longer with `autoDestroy`; reading
  `autoDestroy: true` from an older file, or passing it to the constructor, still gives
  `'destroy'`, and the `autoDestroy` property and `QuarksUtil.setAutoDestroy` remain as deprecated
  aliases. An older runtime does not read `stopAction`.
- `LimitSpeedOverLife.speed` is typed `FunctionValueGenerator | ValueGenerator | Vector3Function`
  (it was `FunctionValueGenerator`), for Separate Axes and constant limits. Code that reads it
  with `genValue(memory, t)` narrows it first: `!(speed instanceof Vector3Function)`.
- **Cone particles between the centre and the rim tilt by `atan(r · tan(angle))`**, as Unity's
  Cone, instead of `angle · r`. Each particle follows the cone's side line through its start
  point, so the cone's far end is a disc of radius `radius + length · tan(angle)` filled as evenly
  as its base. The rim and the centre are unchanged; particles in between lean out more than
  before. Re-tune a cone effect that relied on the old, narrower middle. Cones in three.quarks
  files tilt the new way too, so they lean out further in the middle than in three.quarks.
- **Scaling Mode works as Unity's, in world and local space, and defaults to `'local'`.** The
  emitter's scale now reaches the shape, the particles' size and their motion in every mode except
  where the mode leaves it out: `'local'` (new, the default) uses only the emitter's own `scaling`
  and leaves its parents' out; `'hierarchy'` uses the whole world scale, as before; `'shape'` now
  scales only the emission shape, leaving the particles' size and speed alone (it used to scale
  their size too). Before, a local-space system took its emitter's whole world scale whatever the
  mode. An effect whose emitter or its parents are scaled looks different unless it was
  `'hierarchy'`: set `scalingMode: 'hierarchy'` to keep a parent's scale on it, or leave it at
  `'local'` to keep the effect its own size under a scaled parent. Effects at scale 1 are
  unchanged.
  - **Files from before this release keep their look:** the format goes to 2, and a system in a
    file of format 1 or without `quarksFormat` (older babylon.quarks, three.quarks, the Unity
    exporter before 0.29) reads as `'hierarchy'`, which gives it the emitter's whole world scale
    as before (except a world-space system's speed, which now scales too). Save it again to keep
    that, or set the mode you want. A 0.28 loader warns about a format 2 file and reads its
    systems as its own default.
  - **`ParticleEmitter.matrixWorld` (`IEmitter.matrixWorld`) is the matrix the system simulates
    and draws in:** the world matrix with each axis's length set by the mode. A custom behavior
    that reads it gets that scale. `ParticleEmitter.shapeScale` is what `'shape'` gives the shape.
  - **Negative scales mirror the start velocity as they mirror the position,** in every mode; a
    world-space `'hierarchy'` system used to mirror the position only.
  - **A sub emission's speed** takes its parent particle's frame, as its size did: it no longer
    scales with the sub emitter's own scale in `'hierarchy'`.
- **The scene's image processing applies to the particles by default**, as it does to Babylon's
  own `ParticleSystem` and its standard and PBR materials. A scene whose
  `imageProcessingConfiguration` does nothing (Babylon's default) looks the same as before. One
  that tone maps, sets exposure or contrast, grades, vignettes or dithers now does it to the
  particles too, so they sit in the frame like the meshes around them. Under a
  `DefaultRenderingPipeline` with image processing on (`applyByPostProcess`), the particles now
  leave their colour in linear space for the post process, as Babylon's materials do; before they
  were gamma-corrected twice and looked washed out. Set `applyImageProcessing: false` on a system
  to keep the old look. Check effects in scenes set up by any of these, which turn image
  processing on or hand it to a post process without saying so: `scene.createDefaultEnvironment()`
  (tone mapping, exposure and contrast), a `DefaultRenderingPipeline` with
  `imageProcessingEnabled` (its default), a `PrePassRenderer` (SSAO2, SSR, motion blur) and a
  `ReflectionProbe` rendering in linear space.
  Tone mapping clamps HDR particle colours, and a contrast below 1 or colour curves lift black,
  which an additive particle then adds.

### Added

- **Scene image processing** (`ParticleSystem.applyImageProcessing`, default true; JSON writes it
  only when false): the scene's `imageProcessingConfiguration` (exposure, contrast, tone mapping,
  vignette, colour curves, colour grading, dithering) is compiled into every render mode, in GLSL
  and WGSL, through Babylon's own includes, bound on every draw, and switched in place, on
  the same material, when the configuration changes what the shader needs. A post process that applies it gets the colour in
  linear space. It runs on the straight colour after fog and before the blend resolve, so alpha
  stays coverage; particles that multiply the frame (`ALPHA_MULTIPLY`) are a factor rather than
  light and are not tone mapped. Systems that differ are batched apart. On WebGPU, a 2D colour
  grading texture works through a WGSL port of Babylon's slice sampler, which Babylon's own WGSL
  include lacks. The Image Processing demo compares a flame with and without it.

- **Cone Emit from Volume and Length** (Unity's Cone Volume): `ConeEmitter.emitFrom`
  (`ConeEmitFrom.Base`, the default, or `ConeEmitFrom.Volume`) and `ConeEmitter.length` (5 by
  default, as in Unity). In Volume, particles start anywhere on their side line from the base up
  to `length` along z. The Unity exporter writes Cone Volume with its Length instead of warning,
  and the editor's Shape module and wireframe show both.
- **Random Between Two Curves** (Unity's MinMaxCurve mode of the same name): `RandomBetweenCurves`
  holds two `PiecewiseBezier` curves and rolls each particle a mix between them, kept for its
  life, so every particle follows its own curve within the band. It goes wherever a curve does
  (start values over the system's cycle, emission rates, every over-lifetime and by-speed
  behavior, Noise) and reads and writes as `{type: 'RandomBetweenCurves', curve1, curve2}`. Where
  a system-level setting takes it (emission over time or distance, a burst's count, a shape's
  speed, Noise's scroll speed) the mix is rolled once per play, as a random range is there, rather
  than at each emission step as in Unity. A bound that is missing or not a curve warns and reads as
  a flat 0 curve. The Unity exporter writes it instead of the upper curve, and the editor offers it
  in its value fields and in every module that edits a curve over life.
- **Grid sampling** (Niagara's Grid Location by particle index): `GridEmitter.sampling`
  (`GridSampling.Random`, the default, or `GridSampling.Sequential`). Sequential fills the cells in
  turn, row by row from −x, −y, so a burst of `row × column` particles puts one in every cell; a
  restart starts over at the first cell. The editor's Shape module offers it.
- **Separate Axes for Limit Velocity over Lifetime** (Unity's option of the same name):
  `LimitSpeedOverLife.speed` takes a `Vector3Function`, a limit per axis, and the new
  `LimitSpeedOverLife.space` (`'local'`, the default, or `'world'`) says which axes they are
  measured along. Each component of the velocity is limited on its own and keeps its sign; a world
  limit is scaled by the system's `motionScale` in a world-space system. `space` is written only
  when not `'local'`. One limit for the speed works as before. The editor's Limit Speed, Size over
  Lifetime and Size by Speed modules get a Separate Axes switch, and the new Limit Velocity Axes
  demo compares the two.
- **Stop Action** (Unity's option of the same name): `ParticleSystem.stopAction` says what a
  finished system does: nothing (`'none'`, the default), disable its emitter node (`'disable'`,
  once per finish), or dispose itself (`'destroy'`). Unity's Callback is the `finished` event,
  which fires whatever the action. `ignoreStopAction`, runtime only, skips it for tools that replay
  an effect; `EffectPool` and the editor set it, so pooled and previewed effects keep their
  authored stop action. `QuarksUtil.setStopAction` sets it on a whole effect. As in Unity, the
  action waits until the systems the system emits into have no particles left, and a sub emitter
  target takes none of its own. `ParticleSystem.isAlive(withSubEmitters = true)` is Unity's
  `IsAlive`. quarks.core's `IParticleSystem` gains `stopAction` (`autoDestroy` is deprecated),
  `ringBufferActive`, and `hasPendingEmission(state?)` for a sub emission's state.
- **Ring Buffer Mode** (Unity's option of the same name): with `maxParticles`, a full system's
  new particles replace the oldest instead of being dropped. `ringBufferMode: 'pauseUntilReplaced'`
  freezes a particle at the end of its life until then (footprints, decals);
  `'loopUntilReplaced'` replays the part of its life `ringBufferLoopRange` names (0 to 1 by
  default); a range of no length holds the particle at that point. Particles of a ring buffer
  never die by age, so the system keeps them, fires no Death sub emitter for them and never
  finishes. Lowering `maxParticles` drops the oldest over the new limit. Every render mode but
  Trail, whose particles always die. The Ring Buffer demo shows both.
- `EmitterFrame.fromSimulation`, the inverse of `toSimulation`, for behaviors that measure a
  vector in their own space.

### Fixed

- A **Death sub emitter** fired for the particles that died on a non-looping system's last step
  queued its burst and never emitted it: the system counted itself finished first. A system now
  finishes once the emissions its sub emitters run have nothing left to emit, so `finished` fires
  after those bursts.
- A local-space force, orbit or per-axis speed limit under an emitter scaled to 0 on an axis read
  a NaN rotation from it, and turned the velocity into NaN (forces) or stopped limiting
  (limits). `EmitterFrame` rebuilds the rotation from the axes that remain.
- **Noise** rolls a random Frequency, Strength, Position or Rotation amount, or Remap (a range or
  two curves) into every particle. Only the first particle got its own value; the others read a
  missing one and their position became NaN.

## [0.28.0] — 2026-10-23

The release after phase 6 of the audit and the 0.28 cleanup: alpha means coverage in every blend
mode, as in Unity; shapes fill like Unity's; `play()`, `resume()` and the `QuarksPrefab` timeline
behave like Unity's `Play` and `PlayableDirector`; the renderer's transform and the camera layers
no longer change what is drawn; effect files hold only what differs from the defaults; and no
`any` is left in the public types. The Unity exporter is out of experimental, and the editor gets a
headless `createEditorSession` and WebGPU. 0.27.1 was never published to npm: its packaging changes
(below) ship in this release.

### Upgrading from 0.27

Most effects load and play unchanged. Check these, in this order:

1. **Effects under additive, premultiplied, screen, subtract or max blending whose alpha falls
   below 1** now fade with it. If one looks dimmer than you want, raise its alpha or its colour; a
   texture authored premultiplied should be re-exported with straight alpha. Multiply and min
   particles lighten toward white as their alpha falls instead of staying dark.
2. **Fog follows the blend mode.** Subtract and screen effects fade toward black with distance, like
   additive ones, and multiply effects toward white; only those that lay over the frame still mix
   toward the fog colour.
3. **Soft particles** fade linearly instead of quadratically under `ALPHA_ADD` and
   `ALPHA_COMBINE`; re-tune `softFarFade` if a soft edge looks different.
4. **Shapes with a thickness above 0, cones, and grids** spread particles differently (evenly over
   the volume, every cone particle at its start speed, grid cells centred). Re-tune an effect that
   relied on the old crowding at the centre.
5. **Behaviors no longer reset at every loop.** A looping `Noise` or `TurbulenceField` keeps going
   instead of jumping back to its start once a loop, and the sub emissions of particles still alive
   carry on into the next loop.
6. **`play()` on a finished system restarts it.** To undo a pause and leave a finished system
   finished, call `resume()` (or `QuarksUtil.resume(root)`).
7. **`QuarksPrefab`'s end lets the particles die out.** Call `stop()` yourself where you want them
   cleared on the spot. `update()` with no argument now steps by the engine's frame time, and
   `autoUpdate` drives the timeline for you. A prefab saved with a `timeScale` other than 1 now
   plays its systems at that speed, and `addParticleSystemAnimation` no longer pauses the prefab.
8. **Move emitters, not the `BatchedRenderer`.** Its transform no longer moves the particles.
9. **Camera layers count for culling.** Only systems with a `cullingMode` other than the default
   `'always'` are affected: one whose `layers.mask` no active camera renders now pauses as its
   `cullingMode` says. Give the camera a `layerMask` that includes it.
10. **Files are written with only their non-default fields.** babylon.quarks 0.27 and later read
    them; three.quarks and babylon.quarks before 0.27 do not. Keep the old files if a three.quarks
    tool must read them.
11. **TypeScript and plugins:**
    - `v.isVector2` instead of `Vector2.isVector2`; `setAxisAngleFromRotationMatrix` takes a
      `Matrix4`.
    - JSON readers and `QuarksLoader` take typed JSON or `unknown` (see the `any` items below), and
      a behavior's `toJSON` returns a `BehaviorJSON` with a `type`.
    - A plugin's `loadJSON` must only read its JSON: saving now calls it to find the defaults.
    - `BatchedRenderer.batches` and `systemToBatchIndex` are read-only.
    - A `VFXBatch` subclass implements `resizeBuffers()` and `initialCapacity` and creates its own
      `mesh` in `setupBuffers`.
    - `EulerGenerator.eular` is now `euler` (the old name is a deprecated alias).
12. **Editor:** a `resolveTexture` callback returns a Babylon `Texture`, and `ValueField` with
    `curve={false}` reports a `ValueGenerator` (see the editor's changelog). Install
    `babylon.quarks-editor` 0.28 with `babylon.quarks` 0.28.

### Breaking

- **Alpha means coverage in every blend mode.** A particle's alpha (its colour over life, a soft
  fade, erosion, a rim fade, a `tint`) now fades it out whatever `blendMode` it draws with, as
  Unity's particle shaders do for their Alpha, Premultiply, Additive and Multiply modes. Before,
  modes whose blend takes the colour at full weight ignored alpha. What changes on screen:
  - `ALPHA_ONEONE`, `ALPHA_PREMULTIPLIED`, `ALPHA_SCREENMODE`, `ALPHA_SUBTRACT`, `ALPHA_MAXIMIZED`,
    `ALPHA_MAX` and the other modes that take the colour at full weight multiply it by its alpha
    in the shader. An effect whose alpha is below 1 under these modes draws dimmer than before, as
    it would in Unity; one with alpha 1 draws as before. Textures stay straight alpha, as in
    Unity's Premultiply mode: a texture authored premultiplied should be re-exported straight.
  - `ALPHA_MULTIPLY` and `ALPHA_MIN` move the colour toward white as alpha falls, so a fading
    multiply particle lightens away instead of staying dark (Babylon's own particles do the same).
  - The soft-particle fade lowers alpha only. Under `ALPHA_ADD` and `ALPHA_COMBINE` it used to fade
    colour and alpha together, so the blend weighed it twice and the fade looked quadratic; it is
    now linear over the soft distance, as in Unity and Unreal's Depth Fade. An opaque system
    (`transparent: false`) or one under `ALPHA_INTERPOLATE` or `ALPHA_REPLACE_COLOR` has no
    coverage to fade, so soft particles no longer darken it; they never faded it out either.
  - `ALPHA_MAXIMIZED` takes the colour by alpha twice (its blend weighs it once more), so its fade
    is quadratic; every other coverage mode fades linearly.
- **Fog follows the blend mode.** Particles that subtract from or screen over the frame fade
  toward black with distance, like additive ones; multiply particles fade toward white, which
  leaves the frame alone; particles that lay over the frame (`ALPHA_COMBINE`,
  `ALPHA_PREMULTIPLIED`, opaque) still mix toward the fog colour. Before, every mode other than
  `ALPHA_ADD` and `ALPHA_ONEONE` mixed toward the fog colour, which fogged a multiply or subtract
  effect into a coloured haze.
- **`Vector2.isVector2` is an instance flag**, set on the prototype as `isVector3` and `isVector4`
  are, instead of a static field. Read it on a vector (`v.isVector2`); `Vector2.isVector2` on the
  class is gone.
- **`Vector4.setAxisAngleFromRotationMatrix` takes a `Matrix4`**, the matrix it has always read
  (see Fixed). Code that passed a `Matrix3` no longer compiles; it got a wrong axis and angle.
- **Shape thickness fills evenly, as in Unity.** A sphere's or hemisphere's Radius Thickness now
  spreads particles evenly over the volume of the shell, and a circle's and donut tube's over its
  area (the cone already did); a rectangle spreads each edge's particles evenly over its band. Before, the radius was rolled linearly, so a
  full sphere put half its particles within half its radius instead of an eighth. Effects with a
  thickness above 0 look less crowded at the centre.
- **Cone particles all start at their start speed.** The direction tilted toward the rim was not
  normalised, so particles inside the base disc moved slower than the rim's, by up to 3 % at the
  default 30° and up to 24 % at 90°.
- **A grid emits from its cells' centres**, symmetric about the origin: a grid of width 2 with two
  columns emits from x = ±0.5 instead of −1 and 0.
- Every shape's `fromJSON` takes a `ShapeJSON` instead of `any`, `ShapeJSON.speed` is a
  `FunctionJSON`, and `ValueGenerator.startGen` and `genValue` take a `GeneratorMemory`.
- `EmitterShapes` lists the fields its shapes have: the grid's `row` (it said `rows`), no `angle`
  on the sphere and hemisphere, the box's `emitFrom` as the new `'boxEmitFrom'` field type, and a
  `transform` (the new `'shapeTransform'` type) on every shape.
- **Files hold only the shape and behavior fields that differ from their defaults.** A system's
  shape and each behavior are written through the new `EmitterToJSON` and `BehaviorToJSON`, which
  leave out every field equal to the default their type reads a missing field as, as the system's
  own settings already were; a field the type needs, such as a behavior's curve, stays. babylon.quarks
  0.27 and later read these files; **three.quarks and babylon.quarks before 0.27 no longer do**.
  `toJSON()` on a shape or behavior still writes every field.
- `Behavior.toJSON()` returns the new `BehaviorJSON` (a `type` and the settings) instead of `any`. A
  behavior whose `toJSON` was declared to return something without a `type` no longer compiles.
  `EmitterShapePlugin.loadJSON` and `BehaviorPlugin.loadJSON` are declared to take `ShapeJSON` and
  `BehaviorJSON`, as methods, so a plugin that types its own JSON still compiles; they must only
  read, since saving calls them to find the defaults.
- **`play()` on a finished system plays it again**, as Unity's `Play` does: it restarts it from
  the beginning. Before, it only unpaused, and a finished system stayed empty. A paused or stopped
  system still resumes where it was. `QuarksUtil.play(root)` does the same for each system, so a
  short burst that had finished inside a longer effect plays again; to undo a pause without that,
  use the new `resume()` and `QuarksUtil.resume(root)`.
- **Behaviors no longer reset at every loop.** A looping system called each behavior's `reset()`
  as it began its next loop, so a `Noise` or `TurbulenceField` jumped back to its start offset
  once a loop and the sub emissions of particles still alive were dropped. `reset()` now runs only
  on `restart()` (and `stop()`), as `Behavior.reset` documents.
- **`QuarksPrefab` timeline:**
  - The end of the timeline ends the emission of the systems still playing and lets their
    particles die out, stops the clips, stops the prefab and rewinds it; it used to call `stop()`,
    which cleared every particle on the spot. Call `stop()` yourself for that.
  - A track's window excludes its end in `update` too, as `setTime` did: a system whose track ends
    at 0.5 s stops emitting at 0.5 s, not one frame later.
  - `update()` with no argument advances by the engine's frame time (game time) instead of the
    wall clock.
  - `addParticleSystemAnimation` no longer pauses the prefab.
  - A looping track that ends with the timeline does not start over, and one restarted earlier
    ends its emission with the timeline too.
  - `timeScale` now speeds up and slows down the particle systems on the timeline (see Added), and
    a negative, NaN or infinite one is read as 0. A prefab saved with a `timeScale` other than 1
    plays its systems at that speed now.
  - `pause()` then `play()` resumes exactly the systems the pause paused, those dying out after
    their window included (they stayed frozen before), and `setTime` on a paused prefab leaves the
    systems it starts paused.
- `ParticleEmitter.toJSON` writes `visible` from the emitter's own enabled flag, as `clone()` and
  `serializeEffect` do, not from its parents': an emitter under a disabled template is saved
  visible.
- `retainEffectResources` takes the effect's materials as any iterable, and counts holders of a
  material as it does of a texture.
- **The renderer's transform no longer moves particles.** The batch meshes stay under the
  `BatchedRenderer` node (disabling or disposing it still hides or frees them), but their world
  matrix is frozen at identity: particles are drawn where their emitters put them, wherever the
  renderer is, and the batch bounds Babylon culls by are the particles' own. Before, a moved,
  turned or scaled renderer moved every particle again and only warned once; the warning is gone.
- `BatchedRenderer.batches` and `systemToBatchIndex` are read-only (`ReadonlyArray`,
  `ReadonlyMap`); the renderer has always owned them, and code that wrote to them no longer
  compiles; assigning `batches` throws at runtime.
- **Culling only counts the cameras that render a system's layer**: a camera whose `layerMask`
  shares no bit with the system's `layers.mask` no longer keeps it simulating, so a system on a
  layer only an inactive camera renders pauses as its `cullingMode` says. The `CullingMode` docs
  say which cameras are tested, and that one rendering into a render target texture is not.
- A `VFXBatch` subclass implements `resizeBuffers()` and `initialCapacity`, which the shrinking
  instance buffers call, and creates `mesh` in `setupBuffers`; the base class no longer makes one.
- **quarks.core's JSON and data types have no `any` left.** What changes for code that
  compiles against them:
  - `FunctionJSON` is the union of each generator's JSON (`ConstantValueJSON`, `GradientJSON`,
    `EulerJSON` and the rest, grouped as `ValueGeneratorJSON`, `ColorGeneratorJSON`,
    `RotationGeneratorJSON` and `Vector3GeneratorJSON`), with `type` as the tag. It was an open
    record of `any`. Each generator's `toJSON` and `fromJSON` use its own type, and the
    `…GeneratorFromJSON` readers take their group's. A generator class of your own that
    implements `ValueGenerator` or a sibling interface writes one of these, or casts its `toJSON`;
    no reader would know its type anyway.
  - `BehaviorJSON` is `{type: string}`, no longer an open record, and every built-in behavior has its
    own JSON type (`ColorOverLifeJSON`, `EmitSubParticleSystemJSON`, …) for its `toJSON` and
    `fromJSON`. A plugin's `loadJSON` may take its own JSON interface with a `type`, as
    `examples/src/demos/customPlugin.ts` does. An object literal passed to `BehaviorFromJSON` is
    typed as its behavior's JSON, e.g. `const json: NoiseJSON = {type: 'Noise', …}`.
  - `GeneratorMemory` is `number[]`. `ContinuousLinearFunction`'s values are `number`, `Vector3` or
    `Vector4`, its `subType` follows from them, and its `fromJSON` returns the matching type for
    the `subType`. `GradientJSON`'s `color` and `alpha` say their `subType`.
  - `IEmitter.matrixWorld` is a `Matrix4`; `IParticleSystem.toJSON` and `IAnimationData.target` are
    `unknown`, which a renderer narrows; `Constructable` takes `never[]` arguments.
  - `EmitSubParticleSystem.subParticleSystem` is declared `IEmitter | string | undefined`: a loaded
    behavior holds the uuid until the loader links it, as it always has.
  - `Sequencer.toJSON` returns `SequencerJSON`; `Euler.fromArray` and `toArray` take numbers and an
    order.
  - In babylon.quarks, `ParticleSystemJSONParameters.rendererEmitterSettings` is the new
    `RendererEmitterSettingsJSON`: a trail's `TrailSettingsJSON` or a stretched billboard's
    settings.
  - The `isVector3`-style flags are set on the prototypes as non-enumerable, read-only properties,
    so they no longer show up in a `for…in` over a vector.
- **babylon.quarks's effect format and loader have no `any` left either.** The parts of an effect
  file have named types: `EffectDocumentJSON` for what `QuarksLoader` reads, with
  `QuarksMaterialJSON`, `EffectGeometryJSON` (quarks' own, three.js `BufferGeometry`,
  `PlaneGeometry` and `SphereGeometry`), `EffectImageJSON`, `QuarksPrefabJSON`,
  `ParticleEmitterJSON` and the rest. What changes for code that compiles against them:
  - `QuarksLoader`'s `loadFromJSON`, `parse`, `resolveResources`, `resolveLinkedResources` and
    `resolveExternalGeometries` take the document as `unknown`, as parsed from its file. `resolveLinkedResources` takes the new `QuarksResolveOptions`.
  - `ParticleSystem.material` and `ParticleSystemParameters.material` are a
    `ParticleMaterialSource`: the fields a system reads from a Babylon material or a loaded
    material record. Any Babylon material fits.
  - `BabylonMetaData` holds `BaseTexture | null` textures, `QuarksMaterialJSON` materials and
    `GeometryEntry` geometries; its unused maps are `unknown`.
  - `QuarksNodeJSON` lists its fields instead of an open record, `matrix` is optional, `visible`
    is a boolean, and it has the prefab and three.js transform fields the loader reads.
    `QuarksEffectJSON.materials` is `QuarksMaterialJSON[]`.
  - `ParticleSystemJSONParameters` types its generators by group (`ValueGeneratorJSON`,
    `ColorGeneratorJSON`, …), its `shape` as `ShapeJSON`, its `behaviors` as `BehaviorJSON[]`,
    and `instancingGeometry` as a uuid or an entry. `BurstParametersJSON` has the older
    `cycleCount`.
  - `QuarksPrefab.toJSON` returns a `QuarksPrefabJSON`, `ParticleEmitter.toJSON` a
    `ParticleEmitterJSON`, and `MeshSurfaceEmitter.fromJSON` takes a `ShapeJSON`.
  - quarks.core's `JsonMetaData.textures` may hold null.

### Deprecated

- `RecordState`, the sample of the old linked-list trail history. Trails record into the flat ring
  buffer of `TrailParticle` (`historyPositions` and its siblings); nothing fills or draws the list.
- `TrailParticle.previous`, that list, is `@internal` and out of the documented API.
- `MeshSettings.startRotationX`, `startRotationY` and `startRotationZ`, which nothing reads, are
  optional and deprecated; a mesh particle's start rotation about each axis is the system's
  `startRotation`, an `EulerGenerator`.
- `EulerGenerator.eular`, a misspelling: the Euler is `EulerGenerator.euler`, and `eular` is an
  alias of it.

### Added

- **`blendCategory(settings)`** says how a blend mode's colour leaves the shader (`'straight'`,
  `'premultiply'` or `'multiply'`) and where fog takes it (`'color'`, `'black'` or `'white'`), with
  the `BlendCategory`, `BlendOutput` and `FogTarget` types. Opaque materials, `ALPHA_INTERPOLATE`,
  `ALPHA_REPLACE_COLOR` and `ALPHA_DUAL_SRC0_ADD_SRC1xDST` have no coverage and stay `'straight'`.
- The shader variants cover every blend resolve with and without fog and soft particles, so
  `validate:shaders` compiles the new `BLEND_PREMULTIPLY`, `BLEND_MULTIPLY` and `FOG_MULTIPLY`
  defines in GLSL and WGSL.
- **The whole simulation core is documented.** Every vector, quaternion, matrix and math helper,
  every shape, value, colour and rotation generator, behavior field and plugin type re-exported from
  `quarks.core` now carries TSDoc, and `npm run docs:check` fails on one that does not, as it does
  for the rest of the package.
- `ContinuousLinearFunction` (the keys of a `Gradient`) and its `ObjectValueType` are exported, and
  `Bezier` has `BezierJSON` and `BezierSplit` types for what `toJSON` and `split` return.
- **Format warnings name the part of the file they are about**, by its JSON path
  (`object.children[2].ps.behaviors[3]`). `QuarksLoaderOptions.onFormatWarning` receives them
  instead of the console, and `QuarksLoaderOptions.strict` makes a load throw `QuarksFormatError`
  for them, after reading the whole effect and freeing what it built, with every part in its
  `problems`, to check in CI that a set of assets loads cleanly. The
  loader's own format warnings (a newer format, an unresolved sub emitter or mesh surface link, an
  image url that is not an image) go the same way. `readFormat`, `readFormatPart`,
  `currentFormatPath`, `warnFormat` and `QuarksFormatError` (now defined in `quarks.core`) give plugin
  readers and other hosts the same.
- `BehaviorTypes.EmitSubParticleSystem` lists `inherit`, with the new `'subEmitterInherit'` field
  type.
- **`EffectPool.acquire` takes a placement** (`EffectPlacement`: `position`, `rotation` or
  `rotationQuaternion`, `scaling`, `parent`), so a hit can face its surface normal or a muzzle
  flash its barrel. Every acquire first puts the copy back to the template's transform, so a
  rotation or scale from its last use does not stay. `acquire(position, parent)` still works, with
  any vector that has `x`, `y` and `z`.
- **`ParticleSystem.timeDilation`**, a runtime multiplier on `playbackSpeed` that is not part of
  the effect (never saved, cloned or loaded), like Unreal's Custom Time Dilation or Unity's
  `VisualEffect.playRate`: for slow motion, a pause menu, or a timeline.
- **`QuarksPrefab.timeScale` reaches the systems**: it sets the `timeDilation` of each track's
  system, so they slow down and speed up with the timeline; it is normalised like
  `playbackSpeed`. Removing a system's last track sets it back to 1. Clips keep their own speed.
- **`ParticleSystem.resume()` and `QuarksUtil.resume(root)`** undo a pause and leave a finished
  system finished, for a pause button over a scene; the editor's transport uses them.
- **`QuarksPrefab.autoUpdate`** advances the timeline before every render by the engine's frame
  time, as a Unity `PlayableDirector` on Game Time does; it is turned off on dispose.
- `removeAllEventListeners()` with no event type removes every listener.
- A **Timeline** demo: a charge, a release burst on a window shorter than a frame and lingering
  smoke on a `QuarksPrefab`, every other blast in slow motion.
- **`renderFace`** on a system (`'both'`, `'front'`, `'back'`; the new `RenderFace` type), Unity's
  Render Face and Unreal's Two Sided: a mesh particle can cull its back faces, or show only its
  inside. `'both'` by default, as before; written to JSON only when set; mesh systems that differ
  are batched apart; the flat render modes (billboards, stretched, beam, trail) always draw both
  faces. The culling is per batch, so a mesh mirrored by a negative size on an odd number of axes
  swaps which side `'front'` and `'back'` show. The editor has a Render face field for mesh systems.

### Fixed

- `new Gradient()` with no keys is opaque white from 0 to 1, as Unity's default gradient is. Its two
  colour keys were both at 0 (black, then white), so it already looked white after the start; now
  its keys span the range.
- `PiecewiseBezier.toSVG` returns an empty path for a curve with no pieces instead of throwing.
- A shape transform's rotation is read as a unit quaternion, and a zero one as the identity, so a
  hand-written or rounded rotation no longer scales the shape.
- `Rotation3DOverLife` no longer allocates a quaternion for each mesh particle it starts.
- `BatchedRenderer.addSystem` throws for a system of another scene instead of building a batch
  that holds two scenes' meshes and materials.
- `configureAdaptivePerformance` keeps `minQuality` at 0.1 or more, the floor
  `ParticleSystem.setQualityFactor` clamps to and the documented range; it allowed 0.05.
- The 1×1 white map mesh batches share is made again after something outside disposes it, instead
  of binding a disposed texture.
- An env atlas that fails to build from a cube's faces warns once instead of once per system: it
  is not tried again until the cube's faces change or `disposeEnvAtlas` is called for the cube.
- `ApplySequences` keeps each particle's place in a `WeakMap` instead of fields added to the
  particle, reuses that state when a pooled particle is emitted again instead of allocating two
  vectors, and moves a particle straight to its point when a sequence's range has no length (it
  divided by zero).
- An `EmitSubParticleSystem` read from a file without `useVelocityAsBasis` saves without it, as a
  default, instead of writing `false`.
- `PiecewiseBezier.toSVG` draws the curve itself, not its sampled table.
- A `Gradient` read from JSON without its `color` or `alpha` keys warns, and keeps the default for
  the missing part.
- A particle system reads its texture from the first material slot that holds a `Texture`; a cube
  or other non-`Texture` in a slot is passed over instead of drawn as a broken 2D texture.
- A list of an effect file (`images`, `textures`, `materials`, `geometries`, a node's `children`)
  that is not a list, or an entry in one that is not an object, warns and is skipped, like any
  other part the loader cannot read, instead of failing the load with a `TypeError`.
- `ParticleSystem.fromJSON` with a material entry whose `reflectionAtlas` is a texture uuid
  resolves it, as it does the other slots, instead of failing on the string.
- The fragment's `alpha < 0.01` discard is right in every blend mode: under one-one or
  premultiplied blending a discarded fragment used to be one that would still have drawn.
- Erosion and a mesh's rim fade no longer show a hard cut under one-one and premultiplied
  blending; they fade like under alpha blending.
- **`Bezier.split(t)` split the curve at `1 - t`.** Its de Casteljau steps weighted the two points
  the wrong way round, so the halves met at the mirrored point; a curve split in the editor away
  from a segment's middle changed shape. It now splits at `t`, and both halves trace the curve.
- `Matrix3.makeTranslation(vector)` read a `Vector2` as a number and built a broken matrix; it
  checked a flag that `Vector2` only had as a static.
- `Vector4.setAxisAngleFromRotationMatrix` is typed to take the `Matrix4` it reads (as three.js
  does); it was typed `Matrix3` and read a 3×3 matrix's entries from the wrong places.
- Shapes read out-of-range settings safely: a thickness is clamped to [0, 1] (NaN reads as 1), a negative radius,
  width or height is read as 0, a cone's angle is clamped to [0, π/2] and a box's thickness to 1, a
  grid's rows and columns are read as whole numbers of at least 1 (0 or Infinity gave NaN
  positions), and a
  short `boxThickness` array reads its missing axes as 0.
- A donut with no tube, and a rectangle with no size, started particles with no speed; they head
  out from the centre line, or along the edge's normal, at their start speed.
- `AxisAngleGenerator` normalises its axis when it rotates (a zero axis is read as +z): an axis of
  any other length gave a quaternion that was not a unit and skewed mesh particles.
- `RandomQuatGenerator` and `RandomColorBetweenGradient` used before `startGen` read slots that
  belong to other generators, and the gradient mix rolled a new value every frame, flickering; both
  now roll their own slots once, as `IntervalValue` does.
- `PiecewiseFunction.insertFunction` at a `t` outside every piece inserted at the front and
  unsorted the pieces; it inserts in order and clamps `t` to [0, 1].
- A circle or rectangle in `Random` mode no longer samples its sweep speed every frame, as the
  other shapes do not; a random sweep speed no longer draws its roll, which shifts a seeded
  effect's random sequence by one draw.
- Shape docs give the units and axes of `arc` (radians around +z from +x), the ranges of every
  size and thickness, and say that `RectangleEmitter` emits from the outline (Unity's Rectangle is a
  `BoxEmitter` with no depth); the donut's `donutRadius` is the tube's radius, not the hole's.
- `docs/FORMAT.md` gave 0.28 as the release of format version 1; 0.27.0 is. It now says how a
  system's blend mode is read when its material entry, or the system, has none, and that
  `ps.version` is written for three.quarks only.
- **`QuarksPrefab` plays a window a single frame steps over.** A track shorter than a frame (a
  release burst, say) was never entered when one update jumped from before its start to after its
  end; its system now restarts and ends its emission once it has simulated a step (checked on
  each update and after each render), and its clip plays and stops.
- **An `EffectPool` never hands out a disposed copy.** A copy disposed from outside, by its own
  `dispose()` or with a parent it was placed under, leaves the pool, which makes a new one when
  it needs it; before, `acquire` handed out the disposed node and it never came back.
- **`QuarksUtil.instantiate` copies meshes as meshes**, sharing the source's geometry and
  material, where it made plain transform nodes of them; an instance of a mesh in the tree becomes
  an instance of its copy, and a `MeshSurfaceEmitter` whose mesh is in the copied tree emits from
  the copy. The copy holds the source's materials as it held its
  textures, so `disposeEffect(source)` leaves a copy's meshes and materials whole.
- **`MeshSurfaceEmitter` emits from a mesh without indices**, read as a triangle list, instead of
  from the origin. A stray vertex count past the last whole triangle is ignored.
- **A listener removed while an event fires no longer makes the next one skip**: the listener
  lists are copied on write, so every listener registered when the event fired is called once,
  and one added during it waits for the next event.
- `particleDied` allocates nothing per death: one event object is reused, its `particle` set only
  while the listeners run (documented, as is when a trail's death fires).
- `EmitSubParticleSystem.reset()` drops the running sub emissions, as `ParticleSystem.restart`
  did through a special case it no longer needs; any host gets the same reset.
- Culling reuses its frustum planes; it allocated a new array per extra camera every frame.
- **Instance buffers shrink.** A batch whose buffers a burst grew halves them after it has used
  under a quarter of them for 300 renderer updates (about five seconds at 60 fps), down to where
  it started, so one big explosion no longer holds that memory for the rest of the session.
  Trails too.
- A batch no longer creates a placeholder mesh that it disposes straight away.
- `SortMode` documents that `'distance'` sorts once a frame, for the first active camera.

### Internal

- Tests cover the vectors, quaternions, Euler angles, matrices and math helpers, and the coverage
  floors rise: the simulation core's from 54 % to 88 % of lines, the library's and the editor's to
  one point under what the suites reach.
- Behaviour tests for every shape: even filling, bounds, start speed, the rectangle's outline,
  grid cells, out-of-range settings, JSON round trips of every field and the registry's fields.
- Golden fixtures in `packages/babylon.quarks/test/fixtures`: effects written by three.quarks, by
  the Unity exporter and by babylon.quarks 0.27.0. Each loads with the warnings its snapshot holds and
  saves to the format it holds, saving is stable, and each 0.27.0 file loads as the one it was
  written from.
- Loaded node ids and mesh surface links live in module `WeakMap`s instead of `as any` fields on
  nodes and systems.
- The batch settings, their defaults and the helpers that normalise and compare them move from
  `VFXBatch.ts` to `batchSettings.ts`, which `VFXBatch.ts` re-exports; the batch key reads them
  there, so the build no longer reports a circular import. Exports are unchanged.
- A clean build and install print no warnings: the core build stops passing `declarationDir`
  without declarations, CI runs on Node 24 with current GitHub Actions, dev dependencies have no
  known vulnerabilities, and the demo smoke test fails on a console warning as well as an error.
- The toolchain moves to ESLint 10 (with `defineConfig` and react-hooks 7's React Compiler rules),
  TypeScript 6, Vite 8 (Rolldown: the examples' chunks all fit under its 500 kB warning) and
  cross-env 10. Babel stays on 7, which Jest's own preset still needs.
- No explicit `any` is left in the repository, tests included, and ESLint now reports one as an
  error. Tests reach private members with `obj['member']`, and use typed helpers in
  `test/internals.ts` for shader options, empty resources, fetch responses and values the types
  rule out.

## [0.27.1] — 2026-10-23 (not published)

Packaging and release checks; the runtime is the same as 0.27.0. It was never published to npm; its
changes ship in 0.28.0.

### Changed

- **`@babylonjs/core` peer range is `^9.0.0`** instead of `>=9.0.0`. The package is built and
  tested against Babylon 9; a future major is a separate release, so npm no longer accepts it
  silently. No Babylon 10 exists yet, so no install that worked stops working.
- **`sideEffects` names the built bundles**, the only files with import-time work (they register
  the mesh-surface emitter with the shape table, so a bare `import 'babylon.quarks'` keeps doing
  that); bundlers may treat everything else in the package as side-effect free.
- The README says what `require('babylon.quarks')` needs: `@babylonjs/core` is ES modules only, so
  CommonJS consumers need a Node that can `require` ES modules (20.19 or 22.12 and later).

### Internal

- **`npm run check:pack` checks that the editor moves with the library.** The editor's peer
  dependency on `babylon.quarks` must be the library's own minor line (`~X.Y.0`), and CONTRIBUTING's
  release steps say so: an editor published with an older range would install a babylon.quarks
  without the API it imports.
- The examples compile with `strict` and are part of `npm run typecheck`, in CI too.
- The vendored `quarks.core` workspace is marked `private` (it is bundled into babylon.quarks and
  never published on its own), points at this repository, and lists `types` first in its
  `exports`. Its unused Babel and ESLint configs are gone, and so is `composite` in the library's
  `tsconfig.json`, which nothing referenced.
- The examples dev server accepts only localhost and Cloudflare quick tunnel hosts instead of
  any `Host` header. The repository's Node requirement is 20.19, the version `check:pack`'s
  CommonJS import needs.

## [0.27.0] — 2026-10-23

The release that follows the October 2026 audit: every domain (emitters, behaviors, system and
loader, shaders, trails) was brought to the working rules in `CLAUDE.md`. A 0.27.0 dated
2026-10-21 was prepared but never published; its entries are folded in here, so this is the only
0.27.0 and the whole list applies when upgrading from 0.26.

### Breaking changes

Each item is described in full in the section it points to.

- **Exports removed** that nothing in the package read: `VFXBatchSettings.reflectionFaces`,
  `MeshSettings.rotationAxis`, the `ParticleMesh*Material` classes, the shader chunk registry and
  GLSL string exports, `BatchedParticleRenderer`, the `SpriteBatch` / `TrailBatch` exports,
  `ParticleEmitter.extractFromCache`, `ParticleSystemParameters.startLength` and the duplicate
  `quarks.core` type re-exports (Removed); `ApplyForce` loses its runtime fields `magnitudeValue`
  and `memory` (Changed).
- **Trails stretch their texture by distance** by default; set the texture mode to
  `'distributePerSegment'` to keep the old layout (Changed).
- **`WidthOverLength` spans the samples the trail holds**, not its `startLength` capacity
  (Changed).
- **Trails face the camera in view space**; the trail material loses its `lineWidth`,
  `resolution`, `sizeAttenuation`, `world` and `worldViewProjection` uniforms (Changed).
- **Flipbook frames wrap into the sheet** and the last cell blends into the first (Changed).
- **`softFarFade` defaults to 1**, so soft particles fade without a fade distance set (Changed).
- **Soft particles name their depth encoding**: `setDepthTexture(depth, {encoding})` with
  `'linear'` as the default; a hand-built non-linear depth needs `'nonLinear'` (Changed).
- **`ApplyForce` is a world force**; a local-space effect that relied on the old reading sets
  `space: 'local'` (Changed).
- **`OrbitOverLife` orbits the emitter about the emitter's normalised axis**; set `space: 'world'`
  for the old orbit (Changed).
- **`Noise` turns mesh particles by `rotationAmount`** instead of ignoring it (Changed).
- **`TurbulenceField` is deterministic**: two fields with the same settings and no `seed` swirl
  identically (Changed).
- **Bursts take the file defaults in code too**: `interval` is 0.1 s when left out, and the
  system holds its own copy of `emissionBursts` (Changed).
- **A system belongs to one `BatchedRenderer` at a time**, and a disposed renderer refuses
  `addSystem` with an error (Changed).
- **`ParticleSystem.toJSON()` ids are numbered per `meta`**, so two separate calls both write
  `quarks_geometry_1`; merge outputs through one `meta` or use `serializeEffect` (Changed).
- **A disposed system stays disposed**: `restart()` no longer brings it back (Changed).
- **Seeded systems roll differently from 0.26**; a saved seed gives a different, still repeatable,
  effect (Changed).
- **`serializeEffect` writes the url a texture's image had in its source file** rather than the
  joined url, so a save next to the source loads; a save elsewhere passes `imageUrl` (Changed).
- **TypeScript:** the fields of `ParticleSystemJSONParameters` other than `version` are optional,
  and `StoredBatchSettings.texture` is `BaseTexture | null` (Changed).

### Added

- **Trail texture modes** (`TrailSettings.textureMode`, Unity's Texture Mode): `'stretch'` (the
  default) runs the texture once along the ribbon by distance; `'distributePerSegment'` once with
  each recorded segment an equal share (Niagara's Scaled Uniformly, what trails did before);
  `'tile'` repeats it per world unit, anchored where the particle was born so a sample keeps its U
  while it lives (Niagara's Tiling Distance); `'repeatPerSegment'` once per segment.
  `TrailSettings.textureScale` (Unity's Texture Scale) sets the repeats: per unit, per segment or
  over the ribbon. `uvFromHead` runs any mode from the particle back. The texture's UV channel 1
  follows the same U. Each sample now records its distance along the trail
  (`TrailParticle.historyDistances`, `measureHeadDistance()`).
- **`TrailSettings.minVertexDistance`** (Unity's Min Vertex Distance): a point is fixed only once
  the particle has moved that far from the last fixed one, the newest sample following the
  particle meanwhile (`TrailParticle.update(replaceHead)`), so a slow or standing particle no
  longer fills its history with points on one spot, and the trail's length is a distance rather
  than a number of steps.
- **`TrailSettings.lifetime`** (Unity's Time): samples older than that many seconds are dropped
  from the tail (`TrailParticle.historyAges`, `dropOldest()`), within the `startLength` cap.
- **`ParticleSystem.clearTrails()`** (Unity's `TrailRenderer.Clear`): drops every ribbon and keeps
  the particles, which start new ones where they are. With `pause()`, the move and `play()`, it is
  how an emitter teleports without a ribbon across the jump; the advice to `pause()` alone, given
  below, never cleared the samples already recorded.
- Normalisers `trailTextureMode`, `trailTextureScale`, `trailMinVertexDistance`, `trailLifetime`,
  beside `trailTessellation` and `trailCurveTension`; the trail settings' JSON writes each only
  when set, and `fromJSON`, `clone()`, `serializeEffect` and `QuarksLoader` carry them all.
- Demo: Trail Texture Modes and Sampling.
- **`shaderProgram()` and `shaderVariants()`**: the defines, attributes, uniforms, samplers and
  sources (GLSL and WGSL) of the material a batch builds from its settings, and every distinct
  program the library can compile (Unity's ShaderVariantCollection), for warming the shader cache
  before the first frame. The batches build their materials through `shaderProgram`, so the list
  is the code's own account of what it compiles; `npm run validate:shaders` compiles every variant
  in both languages in CI (the former `validate:wgsl` compiled a hand-written WGSL subset that
  missed, among others, the env atlas, lit meshes with texture effects, and effects with fog, soft
  particles or alpha test). Types `ShaderProgram`, `ShaderSettings`, `ShaderContext`,
  `ShaderVariant`, `ShaderSources`.
- **`ParticleSystem.clear()`** (Unity's `Clear`): removes the particles alive and nothing else; the
  emission clock, the bursts and the pause stay where they were, and the sub emissions the
  removed particles were driving end with them.
- **`space` on `ApplyForce`, `ForceOverLife` and `OrbitOverLife`** (quarks.core), the space the
  force or the orbit is authored in (Unity's Space on Force over Lifetime): `'world'` keeps gravity
  down and wind steady however the emitter is turned, and orbits the world origin about a world
  axis; `'local'` turns and scales the force with the emitter, and orbits the emitter about one of
  its own axes. The forces default to `'world'`, the orbit to `'local'`. The behavior converts into
  the space the system simulates in, so a setting means the same in a local and a world-space
  system, and the compiled behavior pass does the same. Written to JSON only when not the default.
  The type is `BehaviorSpace` (`VelocityOverLifeSpace` is now an alias of it); the decomposed
  emitter transform the conversions use is `EmitterFrame`, for behaviors of your own. The editor
  shows Space on Force over Lifetime and Gravity, and Seed on Turbulence. The Force Space demo
  shows a world gravity and a local thrust on turning emitters.
- **`seed` on `TurbulenceField`** (quarks.core): the field is built from it, 0 by default, so the
  same settings swirl the same way on every run and in every copy; give each system its own seed
  for different fields. Written to JSON only when set. `ParticleSystem.seed` now covers the whole
  effect, since no behavior rolls outside the step any more.
- **`PhysicsResolver`** (quarks.core) is exported, and `setPhysicsResolver(undefined)` unregisters
  the host's resolver. `ApplyCollision` asks the registered resolver when a particle is tested,
  so one registered after the effect loaded takes effect; a resolver given to the constructor is
  still preferred. `getPhysicsResolver()` is typed as possibly undefined.
- **`prewarmTime` on `ParticleSystem`**: how much of the cycle `prewarm` simulates before the first
  frame, in seconds (Niagara's Warmup Time), on a looping system like `prewarm` itself. 0, the
  default, warms up a whole cycle as Unity's Prewarm does; a shorter time warms up the cycle's last part only, with the bursts before it
  counted as fired, which is enough for an effect whose particles live shorter than its cycle and
  keeps a long cycle's first frame cheap. Cut to the cycle and to the static
  `ParticleSystem.maxPrewarmSeconds` guard; written to JSON only when set.
- **`transparent`, `depthTest`, `depthWrite` and `alphaTest` on `ParticleSystem`**, the material
  flags a system is built with, readable and settable afterwards like `blending`. Setting one
  moves the system to a matching batch. `alphaTest` is kept to 0…1; the material flags were
  only constructor parameters and JSON fields before.
- **`instancingIndices` on `ParticleSystem`**: the mesh particles' index list, settable after
  construction. Mesh systems that share a vertex buffer but not an index list (sub-meshes of one
  buffer) are now batched apart; they used to share a batch and draw with the first system's
  indices.
- **`serializeEffect(root, options?)` writes a whole effect** as one document `QuarksLoader`
  loads back, the counterpart of `loader.load()`. It writes the node tree (groups, emitters, mesh
  nodes with their geometry, prefabs with `timeScale`), each texture with its sampler state, and a
  format version. The result is plain data, so `JSON.stringify` takes it; a loaded effect saved
  again writes the same file. A texture with no url a file can point at is reported through
  `onWarning`, as are links to nodes it does not write and mesh settings it cannot hold. Options:
  `filter` to leave out helper nodes, `imageUrl` to write image urls relative to where the file is
  saved, `generator`, and `name` for several roots. A mesh node that is not drawn keeps its
  children drawn (`isVisible: false`, which the loader now reads). The document types are exported (`QuarksEffectJSON` and the rest), and the format is
  described in `docs/FORMAT.md`. Before, `ParticleSystem.toJSON` left live textures and materials
  in its meta, and every caller wrote its own envelope.
- **Effect files carry a format version**, `metadata.quarksFormat` (`QUARKS_FORMAT_VERSION`). The
  loader warns about a file from a newer version. Files without one still load.
- **`QuarksFormatError`**, thrown by `QuarksLoader.parse` for a document with no `object`.
- **Loads can wait for textures, report what failed, and be cancelled.** The loader option
  `waitForTextures` makes `load`, `loadFromJSON`, `loadAll` and `loadFromJSONAll` resolve once every
  texture of the effect has loaded or failed, so it does not draw its first frames blank, like an
  Addressables or Unreal streamable handle completing. `onResourceError(kind, url, error)` reports
  each geometry file or image that fails; the effect still loads. A `signal` (`AbortSignal`) in the
  new `QuarksLoadOptions`, and in `QuarksBatchLoadOptions`, cancels a load: it rejects with the
  signal's reason as soon as it is aborted and leaves no node of the effect in the scene, whatever
  `continueOnError` says. The effect document's fetch is cancelled, and a custom
  `QuarksResourceResolver.fetchJson` gets the signal for it. A scene disposed during a load rejects
  it the same way, and a batch whose effect fails stops waiting on the others' textures.
- **A loaded effect frees what it owns when it is disposed**: the materials made for it, and each
  texture once no other loaded effect, or copy of one, uses it. This holds however the root goes
  (`root.dispose()`, its parent's or the scene's); `QuarksLoader.disposeEffect(root)` says so in
  code. Before, those materials and textures stayed in the scene. A material or texture of a loaded
  effect handed to other code is freed with the effect.
- **Soft particles and alpha test on trails.** `softParticles` and `alphaTest` now apply to trails
  as to every other render mode, in GLSL and WGSL. Before, a trail accepted them, batched on them
  and drew hard with a fixed 0.01 cutoff.
- **Soft-particle depth encodings:** `SoftDepthEncoding`, `DepthTextureOptions`,
  `BatchedRenderer.depthEncoding`, and the decode helpers `softDepthParams` and `decodeSoftDepth`
  (see Changed).
- **`disposeEnvAtlas(cube, scene?)`** drops the env atlases built for a cube.
- **Trail tessellation** (`TrailSettings.tessellation`, `curveTension`), like Niagara's ribbon
  tessellation and curve tension:
  - Each segment between two recorded samples is drawn as `tessellation + 1` segments along a
    centripetal cardinal spline through the samples: Catmull-Rom at `curveTension` 0 (the
    default), straight at 1. Centripetal spacing keeps the curve from overshooting where samples
    lie unevenly apart.
  - A fast or sharply turning trail, such as a weapon swing that moves far between frames, stays
    round instead of showing its corners. The curve passes through every sample, so the trail
    keeps its shape.
  - Swept trails curve their sides with the points, keeping each side's length, so a blade's trail
    stays as wide as the blade.
  - Widths, colors and the texture's U are eased along the curve. The live tip drawn between
    steps joins it with a straight segment, so the recorded part stays still as the tip moves.
  - `tessellation` is a whole number from 0 (the default: off, no cost) to 16
    (`MAX_TRAIL_TESSELLATION`). JSON writes both settings only when set. Helpers:
    `trailTessellation`, `trailCurveTension`.
- **`textureSourceUrl(texture)`**: the url a loaded texture's image had in its effect file,
  before the loader joined a base url, which `serializeEffect` now writes by default. It is
  `undefined` for a texture made in code, one whose image a resolver inlined as a `data:` url, or
  one whose `url` changed since it was loaded, which all write their `url` as before.

### Removed (breaking)

The public API is now what the docs describe; these exports were left over from the three.js port
or duplicated something else, and nothing in the package used them.

- **`VFXBatchSettings.reflectionFaces`**: six face textures were read off a material
  (`material.reflectionFaces`) and kept in the batch key, but no shader ever sampled them.
  `reflectionTexture` is documented as it works: a cube texture is unfolded into `reflectionAtlas`
  and sampled from there; nothing else is sampled.
- **`MeshSettings.rotationAxis`** (quarks.core), which was declared but never read, written or
  cloned: a mesh particle's rotation is its start rotation (`startRotationX/Y/Z`, or a
  `RandomQuatGenerator` / `EulerGenerator` start rotation) and `Rotation3DOverLife`. A file that
  wrote it loses nothing, since no runtime ever read it.
- **`ParticleMeshStandardMaterial`, `ParticleMeshPhysicsMaterial` and
  `BabylonParticleMaterialParameters`.** Mesh particles are drawn by the batch's own material; set
  their look with the system's `material`, `texture` and lighting settings.
- **The three.js shader chunk registry**: `registerShaderChunks`, `getShaderChunk`,
  `getRegisteredShaderChunks`, and the side effect that ran it on import. The batches never read
  it.
- **The GLSL shader string exports** (`particleVertShader`, `particleFragShader`,
  `localParticleVertShader`, `trailVertShader` and the rest). The batches build their shaders
  themselves, in GLSL and WGSL.
- **`BatchedParticleRenderer`**, an alias of `BatchedRenderer`.
- **The `SpriteBatch` and `TrailBatch` exports.** `BatchedRenderer` makes the batches; `VFXBatch`
  stays exported as the type of `renderer.batches`.
- **`ParticleEmitter.extractFromCache`**, a three.js serialisation helper.
- **`ParticleSystemParameters.startLength`**, which nothing read. A trail's length is
  `rendererEmitterSettings.startLength`.
- **The duplicate type re-exports of `quarks.core`.** The same types still come from
  `export * from 'quarks.core'`.

### Changed

- **A trail's texture is stretched by distance** (breaking: an existing effect file has no
  `textureMode`, so its trails now stretch by distance, which shows wherever a trail's speed
  varies along its length): the default texture mode is Unity's Stretch, so a fast stretch of
  the ribbon shows more of the texture than a slow one. Trails used to give each recorded segment
  an equal share whatever its length; set `textureMode: 'distributePerSegment'` to keep that. A
  ribbon that has not moved is laid out per segment, since it has no distance to stretch over.
- **`WidthOverLength` spans the samples the trail holds** (breaking for a young trail): the curve's
  end is the oldest sample, as Unity's width curve runs over the trail as it is, so a trail cut
  short by `lifetime` or `minVertexDistance` reaches the curve's end and a trail still growing
  shows the whole curve compressed. It used to span the `startLength` capacity, so a growing or
  shortened trail never tapered to the curve's end.
- **`followLocalOrigin: false` is no longer written to JSON**, as the other trail settings at
  their defaults are not (three.quarks's loader reads a missing flag as off); `startLength` is
  still always written, for loaders that read it without a default. A JSON `sideAxis` that is
  not three finite numbers (numeric strings still count), or has no length, is dropped with a
  `[quarks]` warning instead of making a ribbon of no width (or of NaN).
- **A particle at the end of its life is dead for its trail too.** The trail path recorded one
  more sample at `age === life`, the step the removal pass already counted the particle dead, and
  the renderer drew a tip for it; the samples, the world-space rewrite, the side axis and the tip
  now all stop at `age < life`.
- **Flipbook frames wrap into the sheet, and the last cell blends into the first** (breaking for a
  frame outside the sheet). A frame past the last cell used to read outside the texture, a
  negative one differed between GLSL (floored) and WGSL (truncated), and with `blendTiles` the last
  frame cross-faded into a cell that does not exist. The cell is now computed by one shared chunk in
  both languages and by the trail's CPU path (`sheetCell`), frames wrapping as Unity's Texture
  Sheet Animation loops. `blendTiles` compiles nothing on a 1×1 sheet, where the `TILE_BLEND` shader
  read varyings the vertex stage never wrote (undefined behaviour on some GLSL drivers; the common
  content of imported files).
- **`uTileCount`, `vTileCount`, `softNearFade` and `softFarFade` are normalised**: tile counts are
  whole numbers of at least 1 (a 0 or fractional count divided by zero in the shader), fade
  distances are finite and at least 0. **`softFarFade` defaults to 1** (breaking): with the old
  default of 0 a soft particle was cut off hard at the scene instead of fading, so soft particles
  did nothing unless a fade distance was set; a file that wrote neither fade now fades over one
  unit, Unreal's Depth Fade default.
- **Mesh particles light both faces and keep their normals under a non-uniform size.** The normal
  is scaled by the inverse of the size, so a stretched mesh stays lit as a stretched mesh rather
  than as its unscaled shape, and a back face (meshes draw without culling) is lit, reflected and
  rimmed as the face the camera sees instead of as the hidden one; a mirrored size (a negative
  component) turns the normal with the winding, so a mirrored mesh lights the same way.
- **A stretched billboard seen along its velocity no longer vanishes**: the side vector was
  `normalize(0)` (NaN) for a particle moving straight at the camera; it falls back as the beam's
  already did.
- **A rim fade can discard**: `MESH_RIM_FADE` lowered the alpha after the alpha test had run, so a
  face faded to nothing still passed the test; the test now runs after the rim.
- **A gradient map without a map tints every render mode the same**: sprites ignored it and meshes
  (which sample a white placeholder) took the ramp's end colour; both now look the ramp up at white.
- **Linear fog with `fogEnd == fogStart`** divided by zero; it is a cut at that distance.
- **Erosion and distortion write only non-default values** to JSON (`softness`, `edgeWidth`,
  `edgeColor`, `strength`, a missing `mask`), like every other setting; a gradient map, erosion mask
  or distortion map that is not a url-backed `Texture` warns when it is left out of a file instead
  of vanishing silently.
- Documented: the fixed discard of fragments under alpha 0.01, fog on multiply and subtract blend
  modes, `blendTiles` needing a sheet and not applying to trails, trails cutting their flipbook
  cell on the CPU.
- Internal: the unused `worldView` and `worldViewProjection` uniforms and the `USE_COLOR_AS_ALPHA`
  define, which nothing set, are gone from the sprite shaders.
- **A system belongs to one `BatchedRenderer` at a time.** `addSystem` on a second renderer takes
  the system out of the first (both used to step and draw it), and adding a system again after
  its settings changed moves it to the matching batch instead of leaving it in two. A disposed
  renderer lets its systems go (they can join another renderer) and refuses `addSystem` with an
  error; a setter on a system after its renderer was disposed used to rebuild a batch, mesh and
  material under the dead node. The renderer warns once when it is itself transformed: particles
  are placed by their emitters, so its transform would move them again.
- **Opaque materials no longer draw a depth pre-pass.** `needDepthPrePass` was set whenever a
  system wrote depth, so an opaque mesh system drew twice; it is now set only for a transparent
  material that writes depth, which is what the pre-pass is for.
- **Setting `renderMode` or `instancingGeometry` keeps the pause.** Both rebuild the particles
  through `restart()`, which also unpaused a stopped system; the pause state is kept now.
  Switching to `Mesh` at runtime gives the system normals when it has none (the mesh shader reads
  them; a mesh without the attribute was the iOS `GL_INVALID_OPERATION`), and a geometry with a
  different vertex count takes its own index sequence instead of keeping the old geometry's
  indices (a cube given to a quad system drew two triangles). `play()` is documented as resuming
  only; a finished system needs `restart()`.
- **Bursts are normalised, in code and from a file.** A burst given to the constructor and one
  read from JSON take the same defaults: `interval` 0.1 s when left out (the file default; the
  constructor used to fire the waves all at once), `probability` kept to 0..1, `cycle` at least 1,
  a non-finite `time` 0, a numeric `count` a constant; and the bursts are kept in time order, which
  emission relies on: `restart()` puts bursts edited in place back in order, so an editor that
  appends a burst at 0 after a later one no longer fires it late. The constructor used to keep the
  caller's array; it now holds its own copy, so edit `emissionBursts` rather than the array that
  was passed in. `BurstParameters.count` is documented as rolled per play and read at the wave's
  time as a fraction of the duration, which is what the code has done since 0.27's burst fix.
- **Setting `ParticleSystem.time` resynchronises the bursts and is normalised.** The bursts
  before the new time count as fired and the ones after are due again (a burst the clock was set
  past used to fire on the next step anyway); NaN or a negative value is 0 (NaN used to hang the
  system, never finishing), a value past the duration wraps on a looping system. The waves of a
  burst in progress are counted with the emission's own arithmetic, so a wave on a rounding edge is
  no longer skipped (this also affected prewarm).
- **`emissionMultiplier` is kept finite and at or above 0**; a negative, NaN or infinite value
  counts as 0 (a negative value used to be ignored, an infinite one hung the spawner). An infinite
  burst `cycle`, which hung the burst loop, is 1.
- **`ApplyForce` is a world force (breaking for turned or scaled emitters in local-space systems,
  and for `motionScale`).** It used to push along its direction in whatever space the system
  simulated in, so a local-space system with a turned emitter had its "gravity" turned with it,
  and a world-space system in `'hierarchy'` scaling mode did not scale it with the emitter, unlike
  `ForceOverLife`. Both forces now follow the same rule: a `'world'` force is converted into the
  emitter's axes for a local-space system and multiplied by `motionScale` in a world-space one. A
  file that relied on the old reading sets `space: 'local'`. Converting a world vector into a
  non-uniformly scaled emitter's axes now undoes the rotation before the scale, as the matrix's
  inverse does; `ForceOverLife` used to do it the other way round. `GravityForce` is documented as
  pulling toward a point in the simulation space.
- **`OrbitOverLife` orbits the emitter, about the emitter's axis (breaking for a non-unit axis,
  and for world-space systems).** The axis is normalised: an axis of length 2 used to turn
  particles twice as far and push them off their circle. In a world-space system the pivot is now
  the emitter's world position and the axis turns with the emitter, where it used to orbit the
  world origin about the world axis; an effect that wants the old orbit sets `space: 'world'`.
  A zero axis orbits nothing. The compiled behavior pass does the same.
- **`Noise` turns mesh particles by `rotationAmount` (breaking for mesh particles with a
  `rotationAmount`).** A quaternion particle used to be turned by
  a normalised four-noise quaternion, which ignored the amount and the power altogether: a
  `rotationAmount` of 0.001 wobbled as hard as 1. It now turns about an axis the X, Y and Z noise
  choose by W noise × π × amount, the angle a billboard would turn by.
- **`TurbulenceField` is deterministic and restarts cleanly (breaking: two fields with the same
  settings and no `seed` now swirl identically).** Its noise permutation and time offsets were
  rolled from the global random source when the behavior was constructed, so a clone, a reloaded
  file and a seeded system all swirled differently, and `reset()` did nothing;
  a zero `scale` component divided by zero and filled the velocities with NaN. The field now comes
  from `seed` (see Added), `reset()` rewinds the drift, and a zero scale samples the field at 0
  along that axis (no variation there) instead.
- **`ForceOverLife` before its first particle.** `update`, `updateAll` and the compiled pass
  disagreed on a behavior that had not seen a particle yet (one applied the force, one skipped
  it); all three now apply it as a world force.
- **The `Behavior` interface documents its contract**: the order the host calls `initialize`,
  `frameUpdate`, `update`/`updateAll` and `reset` in, what the particle looks like at each, that
  randomness goes through `quarks.core`'s `random()` so a host that wraps its steps in
  `setRandomSource` replays an effect, and that everything else a behavior keeps derives from its
  settings. `BehaviorTypes[...].params` lists every field a behavior writes (`Noise`'s
  `scrollSpeed` and `remap`, `VelocityOverLife`'s `radial` and `orbitalOffset`, `FrameOverLife`'s
  options, `WidthOverLength.absolute`, the new `space` and `seed`), and the serialisation contract
  test fails when a field is written that the table does not list, so an editor cannot miss one.
- **A moving emitter's motion is spread over the steps of a frame.** The simulation runs in fixed
  1/60 s steps, several per frame on a slow display, and every step of a frame used the emitter
  where the frame ended: the frame's spawns clumped there, and a trail recorded in world space
  stair-stepped behind a moving emitter. Each step now gets the emitter interpolated between
  where the last simulated step had it and where it is now, position, rotation and scale apart,
  the way Niagara's interpolated spawning does; emission over distance already spawned along the
  path, and the rate's spawns and world-space trail samples now follow it too; a burst due on a
  mid-frame step fires where the emitter was then. A single-step frame, the first frame after
  `play()`, `restart()`, a catch-up or a spell out of view, and a still emitter are unchanged, so
  a copy placed and restarted (as `EffectPool.acquire` does) starts where it was put. A large move
  of a playing system is motion like any other: a frame of two or more steps lays that frame's
  spawns and trail samples along the jump, so teleport with `pause()` or `stop()` first.
  `emitterVelocity` is still the frame's displacement over its time, which is the per-step
  velocity of a linear path, so Inherit Velocity is unaffected. A seeded system with a moving
  emitter plays differently from 0.27 when a frame runs more than one step; the simulation
  snapshot test was re-recorded.
- **Batches are keyed on what the render mode draws.** The renderer used to split systems on
  every setting, including the ones their mode ignores: two billboards with different mesh rims,
  two meshes with different billboard pivots or size limits, two opaque systems with different
  blend modes, two systems with different soft fade distances and soft particles off, or two
  trails with different instanced geometry each cost a draw call. They now share a batch. The
  settings a mode ignores are at their defaults in the batch's `settings`, so an opaque batch's
  `materialBlendMode` reads `ALPHA_DISABLE` and a billboard batch's `rim` is unset.
- **Live parameters change a batch's material in place.** The values that only set uniforms (the
  soft fade distances, the alpha cutoff, the pivot, the size limits, the reflection level, the rim
  colour, power and strength, each texture effect's numbers and each texture's tiling, offset and
  scroll) are the batch's live parameters, as a Unity MaterialPropertyBlock's values or an
  Unreal dynamic material instance's parameters. Changing one on a system that is alone in its
  batch writes the material and keeps the batch; it used to make a new batch, mesh and material
  per value, and leave the old one for 120 frames. A change that needs a different shader (a
  cutoff or pivot switched on or off, a rim mode, a texture) still rebuilds the material, and a
  system that shares its batch still moves to a batch with its values. `VFXBatchSettings`
  documents the two groups.
- **A particle system's JSON leaves out settings at their defaults.** `toJSON`, and so
  `serializeEffect` and the editor's saves, used to write every setting; now a setting is written
  only when it differs from the default, and a missing field reads as the default. The shape, the
  start and emission curves except `startDelay`, `startTileIndex`, the geometry, the material and
  the behaviors are still always written, since loaders up to 0.27 and three.quarks need them, so
  both still load the files. Files from earlier releases load as before. The fields of
  `ParticleSystemJSONParameters` other than `version` are therefore optional (breaking for
  TypeScript code that read them without a check).
- **Every export has TSDoc**, and `npm run docs:check`, part of `npm run check` and CI, keeps it
  that way. Members that are public only for other files of the package are tagged `@internal`
  and left out of the API docs: the batches' buffers and lifecycle methods, `VFXBatch.addSystem`,
  `applyDepthTexture`, `applyMeshLighting` and the like. They still compile, but are not part of
  the contract.
- **`StoredBatchSettings.texture` is typed `BaseTexture | null`** instead of `any` (breaking for
  TypeScript code that assigned something else), and `ParticleSystemParameters.material` is
  `unknown`: a Babylon material, or the material record a loaded system carries.
- **`ParticleSystemParameters.speedFactor` is deprecated** in favour of
  `rendererEmitterSettings.speedFactor`, and the demos use the latter.
- **`BatchedRenderer.deleteSystem` is typed to return `boolean`**, whether the system was in a
  batch, which it already returned.
- **`QuarksPrefab.toJSON` writes `timeScale`** when it is not 1, so `toJSON` and `fromJSON` round-trip;
  only `serializeEffect` wrote it before.
- **The package compiles with TypeScript's `strict` mode.** The published declarations are the
  same as before.
- **`loadFromJSON` and `loadFromJSONAll` no longer change the document they are given.** They
  resolve urls and inline geometry files on a copy, so one document can be loaded many times, into
  several scenes or with several base urls. Code that read the resolved urls back from its own
  document should call `resolveResources` (which still works in place) or read the loaded nodes.
- **`EffectPool` frees a copy with `QuarksLoader.disposeEffect`**, and `QuarksUtil.instantiate`
  gives the copy a hold on the source's textures, so disposing the source leaves its copies drawing
  and the last one to go frees the textures.
- **A geometry file that fails to load is reported through `onResourceError`** (default: the
  same console warning as before). With `waitForTextures`, `onProgress` counts an effect once its
  textures have settled.
- **Unreadable parts of an effect warn and take their default** instead of throwing a `TypeError`
  or going silent: an unknown shape gives a point emitter, an unknown behavior is skipped with a
  warning, an unknown curve or colour type warns, and a setting the file leaves out (a system's
  `startLife`) takes the constructor's default. A behavior's missing number, vector or speed
  range takes a fixed default where the constructor has none (see `docs/FORMAT.md`). A mesh surface shape whose mesh is not in the effect warns, as a sub emitter does.
- **Systems of one document share geometry and texture entries.** `ParticleSystem.toJSON(meta)`
  writes a geometry or texture once per `meta`, however many systems or slots use it, and numbers
  its ids per document, so the same effect serializes to the same file. Ids are no longer unique across
  calls: two separate `toJSON()` calls both write `quarks_geometry_1`, so merge their outputs
  through one `meta`, or use `serializeEffect`.
- **Trails face the camera in view space (breaking for custom trail shaders)**, across their
  tangent and the line of sight, like Unity's View alignment and Niagara's ribbons. The width is
  the particle's size in world units, measured across the line of sight. Before, the facing was
  worked out on screen, which spiked across the view when a trail passed the camera and put NaN
  vertices (holes) at repeated points and hairpins. The trail material no longer has the
  `lineWidth`, `resolution`, `sizeAttenuation`, `world` and `worldViewProjection` uniforms. Code
  that set or read them, or a shader built on them, should drop them; to change a trail's width,
  scale `startSize` or add `WidthOverLength`.
- **A trail system made without `rendererEmitterSettings`** gets `startLength: 30` and
  `followLocalOrigin: false`, as setting `renderMode` to Trail does, instead of throwing on its
  first particle. `startLength` and `followLocalOrigin` are documented.
- **Box and edge shapes now apply their shape transform.** `BoxEmitter` and `EdgeEmitter` take a
  `transform` (offset, rotation and scale within the system) like the other shapes, and write and
  read it in JSON. Before, a Unity export that moved, turned or scaled a Box, Rectangle or Edge
  shape lost that transform, and its particles started from the system's origin. Effects with such
  a shape now emit where they were authored.
- **`ApplyForce` no longer has the public runtime fields `magnitudeValue` and `memory`.** The
  magnitude is rolled per particle (see Fixed); read `magnitude` for the setting.
- **Texture sequencer JSON names its type and writes `position` as `[x, y, z]`.** Files written
  before this release, with no type and an `{x, y, z}` position, still load.
- **Color, Size and Rotation by Speed read the current speed**, like Unity's modules and
  Niagara's Scale by Speed: the velocity's length times the speed modifier, clamped to
  `speedRange`. Motion `VelocityOverLife` adds does not count, since it moves particles without
  changing their velocity. Before, they read the start speed, so a particle slowed by drag, a limit or a
  collision kept its birth colour and size. Effects that use them on particles whose speed changes
  now look different. An empty `speedRange` is a step at its value instead of NaN. The helper is
  exported as `speedFraction`.
- **`LimitSpeedOverLife` dampen is clamped to 0..1 and no longer depends on the frame rate.** At
  60 steps a second a step still removes `dampen / 3` of the excess speed, so babylon.quarks
  effects, which step at 60 Hz, look the same. Other step lengths now remove the share that
  compounds to the same loss per second; before, a long step could reverse the velocity.
- **A disposed system stays disposed.** `restart()` no longer brings it back, `update()` and
  `emit()` do nothing, and `dispose()` drops its particles, also when called from a
  `particleDied` listener. `isDisposed` (also on `IParticleSystem`) says so.
- **Node ids in saved effects.** `ParticleEmitter.uuid`, and every link a file writes to a node
  (sub emitter targets, mesh surface meshes, prefab animation targets), is now
  `quarksNodeId(node)`: the uuid the node was loaded under, or a GUID given once to a node made in
  code. Before, nodes made in code were written under their Babylon `uniqueId`, which differs per
  session and can equal a loaded node's id. The editor writes every node this way too. Files
  saved earlier with numeric ids still load; a prefab resolves a numeric id only to a node with no
  file uuid.
- **A Death sub emitter ignores `inherit: ['lifetime']`**, since its parent has no life left;
  its particles live their own life.
- **Soft particles: the depth texture now says what it stores (breaking for hand-built depth).**
  `setDepthTexture(depth, {encoding})` takes `'linear'` (Babylon's default depth renderer, the
  default), `'nonLinear'` (the depth buffer value, Unity's `_CameraDepthTexture`) or `'viewZ'`
  (view-space Z, Unreal's SceneDepth). Pass the `DepthRenderer` itself and its encoding and
  packing are read off it: `setDepthTexture(scene.enableDepthRenderer(camera))`. Perspective and
  orthographic cameras, WebGL and WebGPU depth ranges, a reverse depth buffer and an infinite far
  plane (`'nonLinear'` or `'viewZ'`) are handled. Before, the shaders always decoded a depth buffer
  value, which no Babylon depth renderer writes by default. If you fed a non-linear depth by hand,
  pass `{encoding: 'nonLinear'}`. The `projParams` uniform now holds the decode coefficients from
  `softDepthParams`; the `soft_pars_fragment` chunk uses them too.
- **Soft particles are compiled in only while a depth texture is set**, as Unity turns them off for
  a camera with no depth texture. Without one they draw hard instead of sampling an unbound
  texture; setting or clearing it rebuilds the soft batches.
- **Batch meshes are not pickable, take no collisions and are not serialized** by Babylon's scene
  serializer. Their geometry is one quad or mesh at the origin, not the particles.
- **Env atlases are cached per scene**, so a second scene or engine (an editor preview) gets its
  own instead of a texture of the first scene. `getCachedEnvAtlas(cube, scene?)` takes the scene.
  An atlas quarks built is disposed with its cube; `disposeEnvAtlas(cube, scene?)` drops one
  sooner. A system whose atlas is disposed while its cube is kept builds a new one.
- **`BatchedRenderer.depthTexture` is an accessor**, and setting it calls `setDepthTexture`.
  `VFXBatch.applyDepthTexture` takes a depth binding as well as a texture.
- **Seeded systems roll differently from 0.26.** A seeded system now rolls its emission rates,
  burst counts and start delay on its own generator when it is created and on every restart, so
  a restart replays them too. A seed saved with 0.26 gives a different, still repeatable, effect,
  and lock-step sessions must not mix 0.26 and 0.27 clients.
- **`serializeEffect` writes each image's url as its source file had it** (breaking for a save
  that relied on the joined url): a texture loaded from `fx/hit.json` as `tex/a.png` holds the url
  `fx/tex/a.png`, and the saved file used to point at that, so a save next to the source loaded
  `fx/fx/tex/a.png` the next time. The file now gets `tex/a.png` (see `textureSourceUrl`), as
  Unity and Unreal keep asset links relative to the project; `imageUrl` still overrides it for a
  save elsewhere, and a texture made in code still writes its `url`.

### Fixed

- **A trail re-emitted with a random `startLength` reallocated its history every time.** The ring
  buffers were replaced whenever the capacity changed; they now only grow
  (`TrailParticle.ensureHistoryCapacity`), and `TrailParticle.length` defaults to 30, the
  documented value, instead of 100.
- **Trail batches allocated twice the vertices they could draw.** The buffers were sized in
  vertex pairs but compared against vertex counts, so every trail batch held two unused copies
  of itself on the CPU and the GPU; `maxParticles` now counts vertices.
- **A tessellated trail bunched its points at the samples at `curveTension: 1`** and on the live
  tip's segment: the Hermite basis eased a segment with no tangents while its widths, colours and
  U ran linearly. A straight segment is now walked evenly.
- **Local-space sub emitter particles jumped to the next parent.** A sub emitter target in local
  space (`worldSpace: false`) draws each particle through the matrix of the emission that spawned
  it; that matrix object was reused for the next emission once the first ended, so particles that
  outlived their emission (a child whose particles live longer than its `duration`) moved to where
  the next parent died. The matrix now stays with the particles born through it, so they keep
  following their parent while it lives (Frame and Birth modes), and the next emission gets its own.
- **`ChangeEmitDirection` with a random angle (`IntervalValue`) threw on every spawn**
  (`memory.push is not a function`): its scratch memory was in a format the generators no longer
  use. It is a generator memory now, cleared before each spawn, so one sample is rolled per
  particle and the memory does not grow. The behavior and `restart()` reset it.
- **Arc modes keep their position within the arc.** `Loop` and `PingPong` at a negative speed, and
  `Burst` for particles emitted by rate (not in a burst), gave positions outside 0…1, so the particle landed outside the arc or on the wrong side
  of it; `PingPong` also started at the arc's far end. `Loop` wraps, `PingPong` starts at the arc's
  start and sweeps back and forth, `Burst` places rate-emitted particles at random, and `spread`
  snaps the result afterwards, as Unity's Arc Mode and Spread do.
- **`restart()` starts a sweeping shape over.** A `Loop`/`PingPong` shape resumed its arc from where
  the system stopped, so a seeded replay or a pooled copy did not spawn where the original did.
  `EmitterShape` gained an optional `reset()`, which the built-in sweeping shapes implement and
  `restart()` calls; a custom shape with sweep state can implement it too.
- **`PointEmitter` emits at the start speed.** It scaled the speed by a random cube root, so with
  `startSpeed` 5 the particles left at anything from 0.4 to 5, which no other shape and no Unity
  shape does. Directions are uniform over the sphere as before. An effect tuned to the old spread of
  speeds should set `startSpeed` to a random range (`IntervalValue`) to keep it.
- **Cone `thickness` maps to the radius as Unity's Radius Thickness does.** The ring started at
  `sqrt(1 - thickness)` (0.71 of the radius for a thickness of 0.5) instead of `1 - thickness`, and
  the Unity exporter already wrote the value 1:1. Emission is uniform over the ring's area, and
  the thickness is kept to 0…1 (a value above 1 used to give NaN positions).
- **Curves and gradients hold their last key past 1.** `ContinuousLinearFunction` (vector and colour
  curves, gradient keys) returned the _first_ key for a time past 1, so a particle that outlived its
  curve snapped back to its start colour on the exact path while the sampled table held the end.
  Both paths agree now.
- **An empty or unknown sequencer no longer breaks the system.** `TextureSequencer` with no
  locations (before `fromImage`, or `locations: []` in a file) threw on the first particle it moved;
  it leaves the particle where it is. A sequencer of an unknown type in a file used to become a
  silent empty one and throw the same way; it warns and is skipped, like an unknown behavior.
- **The start colour and a burst's count curve run over the cycle like every other start curve.**
  Both were sampled in seconds, so with a 4 s cycle a start-colour gradient was read past its end
  from 1 s on, and a burst count curve was read at the burst's time in seconds. They now get the
  normalised time of the cycle (0 to 1), as `startLife`, `startSpeed` and `startSize` do and as
  Unity evaluates them. A sub emission reads the time since it began (its parent particle's birth
  or death) over the target's duration, as its other start curves already did; before, a sub
  emitter target's burst count curve was always read at 0, since the target's own clock never
  runs. An effect authored to the old sampling changes: a start-colour gradient or burst count
  curve meant to span the cycle now does.
- **Distance covered while emission over distance is 0 is not owed later.** With a rate curve
  that rises, or a rate switched on in code or in the editor, the emitter used to spawn a line of
  particles for every metre it had moved while the rate was 0.
- **A system stopped, paused or disposed from a listener stays stopped for the rest of the
  frame.** `stop()` from a `finished` listener (which `EffectPool` does on release), `dispose()`
  from `particleDied` and `autoDestroy` used to be followed by the frame's remaining steps, which
  emitted into the stopped system and could fire `finished` again.
- **A fast playback speed runs at full speed.** The 0.1 s frame clamp now applies to the host's
  frame before it is scaled by `playbackSpeed`, and the per-frame step cap grows with the speed, so
  speed 10 advances 10 seconds per second; before, it was held to about 6. A host frame longer than
  0.1 s is still simulated as 0.1 s at any speed.
- **Prewarm runs on the fixed step directly**, not through `update()`, so it always simulates one
  whole cycle: before, `playbackSpeed` scaled it too, so at speed 0.5 only half the cycle was
  warmed up and at speed 0 none of it. It costs one step per 1/60 s of the cycle and no more. A
  cycle longer than `ParticleSystem.maxPrewarmSeconds` (10 by default, a performance guard for the
  whole app) is warmed up over its last part only, with the burst waves due before that counted as
  fired, so a long looping effect does not stall its first frame.
- **Invalid clock settings are normalised.** A negative, NaN or infinite `playbackSpeed` reads as
  0 (the clock never runs backwards) and a `duration` shorter than one simulation step (1/60 s),
  0 or NaN reads as one step, so `timeRatio` stays finite; both are accessors now and normalise
  what is set after construction too. The constructor also reads an invalid `cullingMode` as
  `'always'` and a negative or NaN `maxParticles` as no limit, as `fromJSON` already did. A
  negative or NaN frame given to `update()` is no time at all.
- **A culled `'pauseAndCatchUp'` system owes at most 0.1 s per frame it missed**, the same clamp a
  visible system's frame gets; before, one stalled frame off screen could owe up to the 2 s cap.
- **`QuarksPrefab.play()` after `pause()` resumes the timeline's systems and clips**; before, a
  system paused in the middle of its track stayed paused until the track ended.
- **Setting `MeshSurfaceEmitter.mesh` to nothing, or to a mesh without positions or indices,
  emits from the origin** as documented, instead of from the previous mesh.
- **A stretched billboard system no longer writes its defaults into the
  `rendererEmitterSettings` object it was given**, as trails already did not.
- **A texture whose image failed to load is no longer shared.** The next load of the same image
  tries it again instead of reusing the broken texture. A texture the engine cannot make at all is
  reported and left out instead of failing the load.
- **A loader read the images of the document it parsed before.** A document with textures but no
  `images` loaded the previous document's pictures. Each parse now has its own.
- **`loadPlugin` did not record the plugin**, so loading it again ran `initialize` again and
  `unloadPlugin` removed nothing. `unloadPlugin` now removes only the types that plugin registered.
- **`QuarksPrefab.timeScale` was not read from files.**
- **A trail's live tip folded back over its head** on frames where the last step ran ahead of the
  display, about every other frame at 120 Hz. The head is now drawn back along its last segment
  instead. Float noise in the step accumulator no longer adds a tip of no length.
- **A dead trail particle's tip kept moving**, drawing a spike that grew while the trail shrank.
  The trail now ends at its last sample.
- **The live tip ignored `WidthOverLength`**, so a trail narrowed by it flared at the tip on
  frames between steps.
- **`WidthOverLength` read its curve past the end** for a fractional or zero `startLength`.
- **Camera-dependent uniforms reached the GPU one draw late.** The eye position (rim, env
  reflection), the soft-particle depth decode and the `'scene'` light were
  written after the material had uploaded its uniforms, so each draw used the previous bind's
  values: a frame late with one camera, and the other camera's with `activeCameras`. They now reach
  the effect of the draw they are for.
- **Soft particles faded against the wrong depth**, both from the decode (see Changed) and because
  the particle's own depth had the wrong sign for a left-handed camera, Babylon's default.
- **GLSL and WGSL applied fog and the soft fade in different orders**, so WebGPU kept a fog-coloured
  fringe where a fogged soft particle met geometry. Both now fade last, after fog.
- **A mesh batch rebuilt for its env atlas lost the soft-particle depth texture.**
- **A non-looping system whose rate curve starts at 0 never emitted.** It reported nothing
  pending on its first step and finished at once. A rate that rises later in the cycle now counts
  as pending.
- **A looping system reported pending emission after `endEmit()`.**
- **A disposed sub emitter target kept taking particles without limit**, since nothing updated it
  any more. Sub emitters now skip disposed targets.
- **Death sub emissions followed a newborn.** The dying particle's object is reused for the next
  particle, and the emission followed that one back to the emitter, inheriting its colour and size.
  A Death emission now stays where its parent died and inherits what the parent died with. Birth
  and Frame emissions stop following when their parent dies (`Particle.serial`). A restart or
  `stop()` drops the emissions still running from the last play.
- **`useVelocityAsBasis` stretched the sub emitter by the parent's speed**, and gave a NaN matrix
  for a parent moving along -Z or faster than 1 along +Z. The basis is now orthonormal.
- **The fused `VelocityOverLife` ignored `radial` and `orbitalOffset`.** The fused pass, which runs
  by default, now matches the per-particle path.
- **Sub emitter and mesh surface links broke when a loaded effect was saved again.** The links were
  written with Babylon's `uniqueId` and the nodes with the uuid they were loaded under.
- **`clone()` shared state with the original**, so editing one changed the other:
  - `ChangeEmitDirection`, the `Euler` rotation generator and `Vector3Function` (and with it
    `SizeOverLife` with separate axes) reused their child generators.
  - A system's emission bursts shared their `count` generator, and `startTileIndex` was shared.
  - `emissionMultiplier` and a fixed `beamEnd` point were not copied. A `beamEnd` given as a
    Babylon `Vector3` is now copied by value too. A `beamEnd` node is still shared, since the
    clone follows the same node.
- **`ApplyForce` with a random magnitude threw** when it was created or loaded, since its
  generator memory was the wrong shape for `IntervalValue`. The magnitude is now rolled per
  particle at emission, as Unity's Force over Lifetime does with Random Between Two Constants, on
  the system's seeded random source.
- **`ApplySequences` lost its sequences in JSON.** A texture sequencer wrote no type, so loading
  the file could not tell which sequencer to build.
- **Node ESM, webpack 5 and SSR could not import the package.** The ESM and CJS builds imported
  `@babylonjs/core` deep paths without `.js`, which only lenient bundlers such as Vite resolve.
  Every deep import now ends in `.js`. The `exports` map now gives `require` its own declaration
  file (`dist/types/index.d.cts`) and lists `./package.json`, so TypeScript with
  `node16`/`nodenext` resolution types both module kinds. `npm run check:pack` now installs the
  packed tarballs into a scratch project and imports them with Node ESM, Node CJS and TypeScript
  `nodenext`.
- **`restart()` broke random emission.** It emptied the system's generator memory without
  rolling `emissionOverTime` again, so an `IntervalValue` rate became NaN and the system emitted
  nothing. Every pooled effect with a random emission rate was empty from its second play.
- **`restart()` kept the emission-over-distance history.** A pooled effect placed somewhere new
  and restarted spawned a line of particles along the jump from where it last played.
- **Disposing an emitter node left its system running.** `root.dispose()` on an effect tree now
  disposes every `ParticleSystem` in it and removes it from its renderer. A system that disposes
  itself (`dispose()`, or `autoDestroy` when it finishes) still leaves the systems of its child
  emitters playing until they finish.
- **`depthTest: false` had no effect.** It was stored, batched and saved, but never reached the
  material. It now draws particles over all geometry (Unity's `ZTest Always`) in every render mode.
- **A mesh batch leaked a material when its env atlas finished loading.** The rebuild now disposes
  the material it replaces, and does nothing when the batch was disposed before the atlas loaded.
- **`QuarksLoader` joined a relative base url twice.** `load('fx/hit.json')` and
  `loadFromJSON(json, 'fx/')` loaded textures from `fx/fx/...`, and from `fx/fx/fx/...` when the
  same document was loaded again.
- **Trails picked the wrong sprite-sheet cell.** The cell column was counted with `vTileCount`
  and fractional frames were not rounded down, so a sheet with more columns than rows, or a
  `FrameOverLife` curve, showed the wrong cell or a slice across two. Trails now pick the same cell
  as billboards.
- **`OrbitOverLife.clone()` dropped the axis**, so a cloned system orbited about Y.
- **`loadFromJSON` after `resolveResources()` joined the base url twice.** The copy
  `loadFromJSON` takes of the document lost the mark that its image urls were already resolved,
  so a document prepared with `resolveResources(json, 'fx/')` and then loaded with the same base
  got `fx/fx/tex/a.png`. The copy keeps the mark.

### Tests

- Trails: the texture modes and scale, the live tip's distance, minimum vertex distance, lifetime
  (alive and dead), the end-of-life boundary, `clearTrails()` and the teleport, the history
  buffers' reuse, the batch's vertex sizing, tessellation at tension 1, the trail `tint`, the
  trail settings through `serializeEffect` and `QuarksLoader`, the `sideAxis` JSON validation,
  and `WidthOverLength` on fractional and zero lengths.
- **Coverage is enforced.** The package thresholds were never checked, because `npm test` ran
  without coverage, and the root run ignored each package's file list. `npm run test:coverage` (in
  CI and `npm run check`) now counts every source file and fails under a floor per package, set in
  the root `jest.config.json` one point under today's coverage and raised as tests are added. The
  floors show where tests are thinnest: the editor's core sits at 14%, quarks.core at 55%.
- **Serialisation contract.** Every behavior, emitter shape, value and colour generator, and every
  `ParticleSystem` setting in each render mode, must survive `toJSON` → `fromJSON`, `clone()` and
  `QuarksLoader` unchanged, and a clone must share no mutable state with its original. A new
  behavior or shape type fails the test until it is added to it.
- **Frame-rate independence.** Every quarks.core behavior that changes a particle over time reaches
  the same state after a second at 30, 60, 120 and 144 Hz, through both `update` and `updateAll`.
  A seeded `ParticleSystem` gives the same particles, finishes within a frame of the same time and
  pauses the same way at 20 to 240 Hz.
- **Seeded simulation snapshot.** A seeded system in each render mode (billboard in world and
  local space, stretched, mesh, trail, beam), with a moving emitter, bursts and behaviors, is
  stepped on uneven frames and its particles (trail history included), bounds and JSON are compared
  with a stored snapshot; loaded back with `fromJSON`, it must write the same JSON and play the same.
  It was recorded before `ParticleSystem.ts` was split and pins the simulation while the rest of the
  split follows.
- Loader: a document `resolveResources()` prepared loads with the same base once; a save next to
  the source writes the source url, through a custom resolver too.

### Docs

- **README** describes the WebGPU path as it is: native WGSL shaders, nothing transpiled or
  fetched at run time. The feature list names beams, the texture effects and the scene-integration
  options; the Unity-style snippet imports from `babylon.quarks` (the npm package `quarks.core` is
  the upstream three.quarks core, not this monorepo's fork of it); the demo count is current. `ROADMAP.md` and
  `docs/SHURIKEN_PARITY.md` match what shipped in 0.24 to 0.27.
- **Three new demos** in the examples app: pooled one-shot hits (`EffectPool`,
  `QuarksUtil.getDuration`, `emissionMultiplier`), renderer options side by side (`sortMode`,
  `alignToDirection`, `minParticleSize` / `maxParticleSize`, `scalingMode`), and surface trails with
  a mesh second UV set (`MeshSurfaceEmitter`, the trail flags, `tessellation`, `curveTension`,
  `instancingUVs2` with a map on UV channel 1 through a gradient map).

### Internal

- **`npm run validate:wgsl` runs in CI** (job `wgsl`), on Chromium's software WebGPU adapter, so a
  WGSL variant that stops compiling fails the pull request. The script compiles the variants in
  batches instead of one round trip each, which brings a run from ten minutes to about fifteen
  seconds; it reports a missing WebGPU adapter or an empty run in plain words instead of a stack
  trace, fails when the device is lost mid-run (a lost device compiles nothing and reports no
  errors), and gives up after five minutes instead of holding the job.
- **The demo smoke in CI opened the wrong pages.** The examples are built under `/<repository>/`
  on GitHub Actions, and the preview server answers a request outside that path with a 404 page
  that loads without an error, so `check:demos` had been passing on 404 pages there. Both
  `check:demos` and `validate:wgsl` now ask the server for its base path
  (`scripts/examplesBase.mjs`), and the smoke fails a page the viewer never comes up on.
- **`batchKey.ts`** holds the batch key: `storedBatchSettings` reduces a system's settings to the
  canonical form a batch stores, `shaderKeyEqual` and `liveParamsEqual` compare the two groups
  and `batchSettingsEqual` both. `BatchedRenderer.updateSystem` writes live parameters through
  `VFXBatch.applyLiveSettings`. `VFXBatch` reads the texture layouts off its settings on every
  bind, and each batch writes its live uniforms from one place (`writeLiveUniforms`), on build and
  on a change.
- **The stretched-billboard shaders no longer declare a `speedFactor` uniform.** The speed factor
  is baked into the velocity attribute on the CPU, so the uniform, which was set from
  `softNearFade`, was never read. The per-frame sync and its tests are gone with it.
- **`integrate.ts`** (`src/system/`) holds the passes of a simulation step after emission: the
  snapshot the renderer extrapolates from, the behavior steps, the sprite path's one pass over
  the store (newborn collapse, motion, ageing, bounds and removal) and the trail path's passes
  (collapse, motion, history, removal), as plain functions over the store and the particle array.
  `ParticleSystem.stepOnce` calls them in order and is 60 lines; the file is now about 1700
  lines, from 3641 before phase 3c. The hot loops are the same code and run the same within
  benchmark noise (a local 88k-particle benchmark: 11.5, 11.6 and 10.4 ms before against 11.6,
  9.2 and 10.1 ms after, in interleaved runs).
- **`EmissionController` and `ParticleSpawner`** (`src/system/`) take emission (rates, bursts and
  their waves, emission along the emitter's path, the system-level generator memory) and the
  making of newborn particles (pool growth, start values, placement, behavior initialisation) out
  of `ParticleSystem`, which goes from about 2460 to 1950 lines. The hot path is unchanged within
  measurement noise (a 20-system, 88k-particle Node benchmark: 7.5 ms before, 7.9 ms after, a
  spawn-heavy one 10.3 and 10.3 ms, with a run-to-run spread of about 1 ms).
- **`SimulationClock`** (`src/system/SimulationClock.ts`) holds the fixed-step accumulator, the
  rounding rule that keeps the residual near zero, the start delay and the catch-up debt of a
  culled system, as pure numbers with their own tests. `ParticleSystem.update` is a client of it.
- **One table of `ParticleSystem` settings** (`src/system/settingsSchema.ts`) gives each plain and
  generator setting its default, its JSON form and how it is copied. `toJSON`, `fromJSON` and
  `clone` are built from it, and a test fails when a constructor parameter is in neither the table
  nor the code that handles the meta, the shape or the behaviors.
- **`ParticleSystem.ts` is being split into modules under `src/system/`.** This first part moves
  out the parameter and JSON types (`types.ts`), reading and writing JSON
  (`serialization.ts`), culling bounds (`BoundsTracker.ts`), event listeners
  (`EventDispatcher.ts`), the behavior fusion plan (`BehaviorPlan.ts`), reading draw settings from a
  material (`materialResolve.ts`), default and fallback geometry (`geometry.ts`) and the setting
  normalisers (`normalize.ts`). The file goes from 3641 to about 2500 lines. The public API and the
  simulation are unchanged; the types are still exported from the package root. Still to come: one
  table of settings for the constructor, setters, JSON and `clone`, the simulation clock, emission
  and spawning, and the integration passes.

## [0.26.0] — 2026-10-21

### Changed (breaking)

The texture effects of 0.25 are redesigned on the concepts Unity and Unreal use, so that one
model covers every texture a particle samples. Effects and code written against 0.25 need the
renames below.

- `ParticleSystem.gradientMap` is now a `ParticleGradientMap` `{ramp, channel}` instead of a bare
  texture. `channel` (`'r'` default, `'g'`, `'b'`, `'a'`, `'luminance'`) picks the texel value
  the ramp is looked up by, so channel-packed and coloured textures work as well as greyscale ones.
  Looked up by `'a'`, the ramp's alpha replaces the map's, so a soft shape can glow at its fringe
  and stay solid at its heart. JSON: `gradientMap: {ramp: <texture uuid>, channel}`.
- `ParticleSystem.uvScroll` is replaced by `mapUV`, a `TextureUV` that lays the main map (tiling,
  offset, scroll, and UV channel 1). JSON: `mapUV` on the material, only the fields that differ from
  the default. The `UV_SCROLL` define and `uvScrollOffset` uniform become `MAP_TRANSFORM` and
  `mapTransform` (`uv * xy + zw`), with `MAP_UV1` when the map reads channel 1.
- `ParticleErosion.maskScroll` is replaced by `maskUV`, a `TextureUV`.
- Shader uniforms: `erosionParams` is a `vec2` (softness, edge width) and the mask is laid by
  `erosionMaskTransform`. The gradient map adds `gradientMapChannel`.
- 0.25 JSON is not migrated: a bare-texture `gradientMap`, `uvScroll`, and `erosion.maskScroll` are
  ignored on load. Re-export those effects.

### Added

- **UV channels** (`UVChannel`: `0 | 1`), as Unity's UV channels and Niagara's ribbon UV0/UV1:
  - Channel 0 is the map's UV as drawn.
  - Channel 1 is the particle's own UV, which the sprite sheet never moves:
    - the whole quad on billboards, stretched billboards and beams;
    - along and across the trail on trails;
    - the mesh's second UV set on meshes.
  - A texture on channel 1 can run once across a whole trail or mesh however the map repeats or
    animates. Shaders declare `vUV1` under `UV1` only when a texture reads it.
- **Second UV set on mesh particles:** `instancingUVs2` (glTF `TEXCOORD_1`, Unity's `uv2`).
  - It is saved with the geometry as `uvs2` and read from three.js `uv1`/`uv2` attributes by the
    loader.
  - Systems batch by both UV sets.
  - A mesh without a second set reads its first on channel 1. A set whose length is not two values
    per vertex is left out with a one-time warning.
  - `ParticleSystem.instancingUVs` and `instancingUVs2` accessors. Assigning `instancingGeometry`
    with a different vertex count resets the first set to zeros and drops the second, so assign
    the UVs after the geometry.
- **`TextureUV`** (`channel`, `tiling`, `offset`, `scroll`) lays a texture over the particle:
  Unity's Tiling/Offset plus Unreal's Panner. `mapUV`, `erosion.maskUV` and `uvDistortion.mapUV`
  take it. The offset is kept as given; only the scroll's share is wrapped.
  JSON writes only the fields that differ from the default. Helpers: `normalizeTextureUV`,
  `textureUVEqual`, `textureUVToJSON`.
- **`ParticleSystem.tint`** (`Vector4`, runtime only, copied by `clone()`):
  - Multiplies every particle's colour and alpha as drawn, without touching the particles or
    splitting batches.
  - Use it for a per-instance colour or fade driven from code, like Unreal's user parameters.
    With erosion, alpha is the erosion level.
  - Additive and premultiplied blending ignore alpha; fade those through the colour instead.
- quarks.core `FrameOverLife` option **`random`** (FPS mode, with `frameCount`; saved in JSON only
  when set):
  - Every `1 / fps` seconds it shows a random frame of the segment instead of the next.
  - Each particle has its own sequence.
  - Like Cascade's random SubUV, for the flicker of lightning, sparks and neon.
- Mesh particle **rim mode `'fade'`** (Fresnel to opacity):
  - Faces turned to the camera fade by `strength` instead of gaining a colour.
  - A wall of light reads thick along its silhouette and thin across its face.
- **`ParticleSystem.uvDistortion`** (`ParticleUVDistortion`: noise `map`, `mapUV` (default
  scroll `[0, 0.5]`), `strength`;
  saved with the material only when set):
  - A scrolling noise texture pushes the map's UV about, for heat shimmer and licking, breathing
    shapes.
  - Works on sprites, meshes and trails, in GLSL and WGSL.
- quarks.core **`TrailSettings.sideAxis`** (JSON `[x, y, z]`, written only when set):
  - The trail is swept along that emitter axis instead of facing the camera.
  - Each sample records the axis as the emitter held it, so a trail on a blade is the surface the
    blade swept, like Unreal's AnimTrail.
  - `TrailParticle.historySides` holds the recorded sides.

### Fixed

- **Scrolls wrap over two repeats instead of one** in every `TextureUV`. A map with mirrored addressing no longer flips to its mirror image at every wrap.
- **Systems that share positions but not UVs batch apart.** Before, the first system's UVs drew
  for both. Systems given a geometry without UVs share one fallback array per geometry, so they
  still batch together.
- **Mesh systems that share positions but not normals batch apart.** Before, the first system's
  normals lit both. Fallback normals are shared per geometry, and trails no longer split batches
  over instanced UVs they never read.
- **Assigning `instancingGeometry` replaces stale normals and fallback UVs**: normals of a different
  vertex count, and the previous geometry's fallbacks, move to the new geometry's.

## [0.25.0] — 2026-10-20

### Added

- `ParticleSystem.emissionMultiplier` (runtime only, default 1): scales bursts, emission over time
  and over distance, and may go above 1, unlike `setQualityFactor`. The two multiply.
- `QuarksUtil.getDuration(root)`: seconds until an effect played from the start is over (start
  delay, duration and longest life over playback speed; sub emitter targets a life after their
  parents), or `Infinity` when a system loops.
- quarks.core `FrameOverLife` options (`fps`, `cycles`, `frameCount`, `loop`, `startFrame`, all
  saved in JSON only when set): Unity's texture sheet FPS mode, several cycles per life, a looping
  or holding frame segment and a per-particle random start frame. Without them the behaviour is
  unchanged and stays in the fused pass.
- Texture effects on sprites, meshes and trails, GLSL and WGSL, each saved with the material in the
  effect JSON only when set and batched apart when they differ:
  - `ParticleSystem.uvScroll` `[u, v]`: scrolls the map in UV units per second on the renderer's clock.
  - `ParticleSystem.gradientMap`: recolours the map through a ramp texture picked by its red
    channel; the particle colour still tints it.
  - `ParticleSystem.erosion` (`ParticleErosion`: mask, softness, edgeWidth, edgeColor, maskScroll):
    alpha erosion. The particle's alpha decides how much of the shape is left instead of how
    transparent it is, so a `ColorOverLife` alpha curve dissolves it through a noise mask or wipes
    it through a gradient one, with an optional glowing edge.
- `RenderMode.Beam` (6) with `ParticleSystem.beamEnd` (a point or anything with a world position,
  such as a `TransformNode`, read every frame; runtime only): a quad laid from each particle to
  the end and turned about its length to face the camera, U along it, the size as its width. With
  a sheet and `FrameOverLife` `fps` it flickers like lightning; bounds reach the end.
- `ParticleSystem.scalingMode` (`'shape'` default | `'hierarchy'`, constructor option, JSON written
  only when `'hierarchy'`): in `'hierarchy'` a world-space system's start speeds scale with the
  emitter's world scale, and `ForceOverLife` and `LimitSpeedOverLife` by its mean, so a scaled
  effect moves in proportion. quarks.core `IParticleSystem.motionScale` carries the factor to
  behaviors; `LimitSpeedOverLife` now learns its system in `initialize`.
- Example "Texture Effects" showing the texture effects and a beam.

### Fixed

- A looping system kept firing its bursts on every loop after `endEmit()`, so it never finished.
  Bursts now stop with the rest of the system's own emission; a sub emitter's bursts, which belong
  to parent particles still dying, keep firing.

## [0.24.1] — 2026-10-20

### Changed

- Version aligned with babylon.quarks-editor 0.24.1 and the Unity exporter 0.24.1, which fix
  issues in 0.24.0 (no runtime changes).

## [0.24.0] — 2026-10-20

### Added

- `ParticleSystem.renderingGroupId` (constructor option, JSON `renderingGroupId`, written only when
  not 0): the Babylon rendering group the batch mesh draws in. Systems with different groups are
  batched apart.
- `ParticleSystem.applyFog` (constructor option, JSON `applyFog`, written only when false): the
  scene's fog now reaches the particles in every render mode, in GLSL and WGSL, the way it reaches
  any other mesh. Additive blending fades toward black instead of the fog colour. Fog is bound from
  the scene on every draw, so enabling or disabling it at runtime needs no recompile.
- `ParticleSystem.playbackSpeed` (constructor option, JSON `playbackSpeed`, written only when
  not 1): a multiplier on the time the system is advanced by — Unity's Simulation Speed. The
  Unity exporter writes it from Main → Simulation Speed.
- quarks.core `ApplySequences` is registered in `BehaviorTypes`, so an effect using it serialises
  and loads like any other behavior.
- Bounds and culling. Every system measures the world bounds of what it draws
  (`ParticleSystem.getWorldBounds`), from the store columns for sprites and meshes and from the
  ribbons for trails; batch meshes carry the union, so Babylon's frustum culling skips the draw of
  a batch no camera sees and transparent sorting has real bounds to work with. Measured in full
  every few steps and carried, padded for the motion since, in between: no measurable cost on the
  profiling scenarios.
- `ParticleSystem.cullingMode` (constructor option, JSON `cullingMode`, written only when not
  `'always'`): Unity's Culling Mode. `'pause'` freezes a system while no active camera sees its
  bounds; `'pauseAndCatchUp'` also replays the missed time (up to 2 s) when it comes back, within
  `BatchedRenderer.catchUpBudgetMs` (2 ms per frame, shared by all systems; what does not fit is
  dropped). Culled systems are neither simulated nor filled into their batch. Empty systems and sub
  emitter targets are never culled; `BatchedRenderer.cullingEnabled = false` turns the test off.
  With 400 systems in a ring around the camera and three quarters of them out of view, a frame goes
  from 9.6 ms to 1.6 ms. The Unity exporter writes Pause and Pause And Catch-up.
- Deterministic randomness. Every roll the simulation makes now goes through quarks.core's
  `random()`, whose source is replaceable: `setRandomSource(createSeededRandom(seed))` makes a whole
  scene reproducible, `withRandomSource` scopes it, and `getRandomSource` reads it back. The noise
  generators are seeded by slot, so a Noise behavior looks the same on every run. UUIDs keep using
  `Math.random`.
- `ParticleSystem.seed` (constructor option, JSON `seed`, written only when set): the system rolls
  on its own generator started from the seed while it steps, and restarts it on `restart()`, so the
  effect plays out identically every time; systems it emits into roll on it too. The editor has a
  "Fixed seed" field; the Unity exporter writes Main → Random Seed when Auto Random Seed is off.
- `EffectPool`: a pool of copies of one effect for things played many times over.
  `acquire(position, parent)` takes an idle copy (or makes one, up to `maxSize`), places it and
  plays it; a copy whose systems have all finished returns to the pool by itself; `stop(copy)` ends
  a looping copy's emission and lets it die out first; `release(copy)` takes it back at once;
  `prewarm` makes copies up front. Idle copies stay disabled in the renderer's batches, so acquiring
  allocates nothing.
- `QuarksUtil.instantiate(root)`: a deep copy of an effect tree, with sub emitter links pointing at
  the copied emitters.
- `ParticleSystem.sortMode` (constructor option, JSON `sortMode`, written only when not `'none'`):
  Unity's Sort Mode. `'distance'` draws the particles of the batch farthest from the active camera
  first, so nearer alpha-blended particles cover farther ones; `'oldestInFront'` and
  `'youngestInFront'` order by age. The order is a radix sort over the whole batch after each fill
  (about 2.5 ms per 50k particles), so systems with different modes are batched apart; trails are
  not sorted. The editor's Renderer module and the Unity exporter carry it (Distance and Depth both
  map to `'distance'`).
- `ParticleSystem.minParticleSize` / `maxParticleSize` (constructor options, JSON, written only when
  set): Unity's Min / Max Particle Size, the smallest and largest size a billboard or stretched
  particle is drawn at as a fraction of the viewport height, clamped in the vertex shader (GLSL and
  WGSL). Meshes and trails ignore them. The editor's Renderer module has them under "Limit screen
  size"; the exporter writes Unity's values, its default maximum of 0.5 included.
- `ParticleSystem.alignToDirection` (constructor option, JSON `alignToDirection`, written only when
  true): Unity's Align To Direction. A mesh particle's +Z is turned along the direction its shape
  sends it; a billboard's top is turned toward it in the emitter's XY plane. The start rotation is
  applied on top; a particle with no speed is left alone. Shape module checkbox in the editor; the
  exporter writes Shape → Align To Direction.
- quarks.core `Noise` gains `scrollSpeed` (Unity's Scroll Speed: the field moves past the particles,
  sampled once per frame, reset with the behavior) and `remap` (Unity's Remap: a curve read at the
  raw noise mapped from [-1, 1] to [0, 1], whose value replaces it). Both in JSON, the editor's Noise
  module and the exporter.
- quarks.core `VelocityOverLife` gains `radial` (Unity's Radial: speed away from the orbit centre)
  and `orbitalOffset` (Unity's Orbital Offset: where the orbital speeds turn around, relative to
  the emitter). In JSON, the editor's Velocity module and the exporter.
- quarks.core `EmitSubParticleSystem` gains `inherit` (Unity's sub emitter Inherit): `'color'` and
  `'size'` multiply the sub particles' start values by the parent's current ones, `'rotation'` adds
  the parent's, `'lifetime'` scales theirs by the parent's remaining lifetime fraction. The mask
  travels in the emission state, so a host that emits into a system by hand can set it too. In
  JSON, the editor's Sub Emitters module (four checkboxes) and the exporter.
- `BatchedRenderer.simulationBudgetMs` (unlimited by default): once a frame's simulation has taken
  this long, the systems still to be advanced run one step instead of catching up on the long
  frame, and the time the skipped steps would have covered is dropped — so a frame that already ran
  long cannot make the next one longer still.

### Changed

- Developed and tested against `@babylonjs/core` 9.31.0 (was 9.6.2); the peer range stays
  `>=9.0.0`. The examples and the editor's dev dependencies follow.
- `ParticleSystem.isFinished()` is true for a looping system whose emission was ended with
  `endEmit()` once its particles are gone, and for a sub emitter target whenever it is empty,
  looping or not; `finished` fires accordingly. `QuarksUtil.isEffectFinished` follows, so an effect
  with looping systems is finished after `endEmit` rather than never.

### Fixed

- quarks.core `ApplySequences` threw on update while it had no sequences yet (an editor adds the
  behavior before its first sequence); it now leaves the particles alone until one is appended.
- `ParticleSystem.clone()` left cloned `EmitSubParticleSystem` behaviors transforming by the
  original system's emitter; they now follow the clone. `ParticleEmitter.clone()` no longer
  disables the clone itself when only an ancestor of the original was disabled.
- `renderOrder` now reaches the batch mesh as `alphaIndex`, so it orders the batch among the
  scene's transparent meshes instead of only keying the batching; it used to have no effect on
  what was drawn first. `layerMask` likewise now reaches the batch mesh — cameras with a
  non-matching mask used to draw the particles anyway.

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
