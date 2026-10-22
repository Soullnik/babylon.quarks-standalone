# Changelog

All notable changes to the `babylon.quarks` package are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows the `quarks.core` 0.x version line.

## [Unreleased]

### Added

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

### Changed

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

### Fixed

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

### Tests

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

## [0.27.0] — 2026-10-21

### Added

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

### Changed

- **Seeded systems roll differently from 0.26.** A seeded system now rolls its emission rates,
  burst counts and start delay on its own generator when it is created and on every restart, so
  a restart replays them too. A seed saved with 0.26 gives a different, still repeatable, effect,
  and lock-step sessions must not mix 0.26 and 0.27 clients.

### Fixed

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
