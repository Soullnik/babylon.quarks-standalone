# Changelog

All notable changes to the Unity Quarks Exporter are documented here.

## [Unreleased]

### Added

- **Unity's mesh shaders draw a particle without its colour** → `particleColor: false`: the legacy
  shaders outside Particles (Diffuse, Specular, Bumped, VertexLit, their Transparent and Cutout
  variants, Self-Illumin), Mobile's outside Particles, Unlit/* and Standard ignore the vertex
  colour the particle renderer gives them, colour and alpha (measured in Unity 6), so a tinted or
  fading system draws in its texture and material colour alone, and a cutout one clips at the
  texture's alpha times the material's. Before, babylon.quarks multiplied the particle's colour in. The
  particle and sprite shaders, URP's and any other keep the particle's colour.

- **Mesh vertex colours** → the geometry's `colors`, `r, g, b, a` per vertex as Unity stores them,
  which babylon.quarks multiplies a mesh particle's colour by as Unity does. A mesh whose vertices
  are all white is written without them. Before, they were not exported, and a mesh that fades out
  by its vertex colours (a stream on a spiral, black at its ends) ended in a hard edge.

- **Sorting Fudge** → `sortingFudge`, so the systems an author layered with it (a glow under the
  smoke, the smoke over the sparks) keep their order in babylon.quarks however the camera turns.
- **sRGB textures in a Linear project** → `colorSpace: 'srgb'` on the texture, from the
  importer's sRGB (Color Texture) setting, so babylon.quarks decodes and filters them in linear
  space as Unity samples them. A Gamma project, a texture imported with sRGB off and one made in
  code write none.
- **Trail Renderer** → a trail system of one particle that rides on the node and records its path
  in world space: Time → `lifetime`, Min Vertex Distance → `minVertexDistance`, the width curve and
  multiplier → `WidthOverLength`, Color → `ColorOverLength`, Texture Mode → `textureMode`, the
  material as a particle system's. On a node that also holds a particle system the trail gets a
  child node. Alignment Transform Z is exported as View with a warning. The trail system's scaling
  mode is `shape`: a Trail Renderer's width is in world units whatever its transform's scale, so a
  trail on a node scaled to 0 still draws. Before, Trail Renderers were not exported.
- **Texture Sheet Animation Single Row** → `FrameOverLife` `rowLength` / `rowCount`, with
  `randomRow` for Row Mode Random and `row` for Custom (Mesh Index plays the first row, with a
  warning). Before, a Single Row sheet played across all its rows.
- **Collision Planes** → `ApplyCollision` `planes`, in the emitter's local space, with Dampen →
  `dampen`, Lifetime Loss → `lifetimeLoss` and Radius Scale → `radiusScale`. Before, only Bounce
  was written and a plane collision fell back to the host's colliders. A Planes collision without
  any plane is left out, as it collides with nothing in Unity. Min / Max Kill Speed are skipped
  with a warning.
- **Force over Lifetime** Space: a Local force is written with `space: 'local'`; World stays the
  default.
- **Force over Lifetime Randomize** → `randomized: true`: a random force picks a new value every
  frame, as in Unity, instead of once per particle.
- **Render Alignment** of mesh particles → `renderAlignment`: View → `'view'` (Unity's default,
  so a quad mesh now faces the camera as it does in Unity), World → `'world'`, Local → `'local'`.
  Facing is exported as View with a warning; Velocity is left out with a warning.
- **Render Alignment** of billboards → `renderAlignment`: World → `'world'`, Local → `'local'`,
  so a billboard Unity lays in its node's plane (a bullet hole on the ground) stays there instead
  of turning to the camera. View, the default, is left out; Facing (exported as View) and Velocity
  are left out with a warning, so those billboards face the camera. Stretched, horizontal and
  vertical billboards take none: Unity draws them the same for every alignment (measured in
  Unity 6).

### Fixed

- **The trails of particles that never show are exported.** A system that draws both its
  particles and their trails keeps only its particles, a quarks system having one render mode; but
  when every start colour it can pick has an alpha of 0, which Color over Lifetime only multiplies,
  and its material draws the particle colour, Unity draws nothing of the particles and only the
  trails show. Such a system is now exported as a trail system, as one with Render Mode None is
  (streaks carried on such particles drew nothing). A system whose particles show still keeps them, with the warning.
- **A node is written by Unity's local position, rotation and scale, not a matrix.** A mirrored
  node's matrix splits into a turn and a scale more than one way, and babylon.quarks turns the
  systems below it by the one Unity has, as Unity's `transform.rotation` (a Local system
  under a root scaled (-0.891, 0.891, 1.06) flew the wrong way). `position`, `quaternion` and `scale` keep the scale's signs as Unity has them, and
  are left out at their defaults, which also makes the files smaller. **Re-export** effects with a
  mirrored node.
- **Inherit Velocity only where Unity applies it.** Unity adds the emitter's velocity to a World
  system's particles, and in its Initial mode to a Custom one's; a Local system inherits nothing
  in either mode, nor a Custom one in Current mode (measured in Unity 6 on a moving, turned node).
  The module is now left out there. Before, it was exported whatever the space, and babylon.quarks
  added the emitter's velocity to particles that already move with it: the smoke of a
  projectile (Local, Current, 0.2) flew ahead of it at a fifth of its speed instead of trailing
  behind it.

- **Opaque and cutout mesh shaders draw as in Unity: solid, clipped at their cutoff, back faces
  culled, lit.** A shader that keeps its surface in its code rather than in material properties
  (the legacy Diffuse and Transparent/Cutout/*, Unlit/Texture and Unlit/Transparent Cutout,
  Mobile/Diffuse, Standard) is read by its RenderType tag, which Unity's shaders and the effect
  editors' all set: Opaque and TransparentCutout export as an opaque surface (`transparent: false`,
  `depthWrite: true`) that babylon.quarks draws before the transparent systems, clipping at
  `_Cutoff` when the shader clips (RenderType TransparentCutout, or Standard's `_ALPHATEST_ON`)
  and, without a `_Cull` property, culling its back faces (`renderFace: 'front'`): Unity's default
  Cull Back, which all of these shaders keep where its particle and sprite shaders draw both. The
  legacy Diffuse and Specular shaders light (Lambert and Blinn-Phong), so their meshes are lit.
  Measured in Unity 6: render queue, RenderType, `_Cutoff`, depth write, culling and lighting of
  each legacy, Mobile, Unlit and Standard shader. Before, every such material exported as an
  alpha-blended, unlit particle material without depth write, so cutout mesh spikes
  (Transparent/Cutout/Diffuse) were see-through, showed their inner faces and the cell borders of their texture sheet; and
  Standard's Opaque mode warned that One Zero has no counterpart and blended.

- **A mesh's front faces are the ones Unity draws.** Unity winds its front faces clockwise as the
  camera sees them, Babylon (and an effect file, as babylon.quarks writes a Babylon mesh)
  counter-clockwise, in the same left-handed space: each triangle is now written with its last two
  corners swapped. Before, Render Face Front (Cull Back) culled the outside of every exported mesh
  and drew its inside, and a lit mesh took its outside for a back face and lit it from the wrong
  side (spikes showed the inside of their far wall through the open base).
  A Mesh shape emits out of the same faces as before, as babylon.quarks' `MeshSurfaceEmitter` now
  takes the normal of Babylon's front face. **Re-export** an effect whose meshes use Render Face,
  a lit shader or a Mesh shape: a mesh written by an earlier exporter is wound Unity's way, so
  babylon.quarks culls its outside, lights it from behind, and emits from a Mesh shape on it into
  the mesh.

- **A curve whose keys stop short of 0 or 1 holds its end keys' values there, as in Unity.** A
  flat piece is written before the first key and after the last, in every cycle of a frame curve.
  Before, the last key's piece ran on to 1, so a Velocity over Lifetime curve that falls from 2 to
  0 over the first 3% of the life fell over the whole life instead, and bullet
  holes, which move for 0.13 s and then rest under the rocks in Unity (measured in Unity 6), slid
  about 4 units away. Likewise webs whose Rotation over Lifetime stops at
  a seventh of the life in Unity and turns them by about half a radian, kept spinning all their
  life and turned by 3 to 4 rad.
- **A system with no shape emits as in Unity: at the emitter's origin, along +Z.** That is a
  disabled Shape module, or a Mesh, Mesh Renderer, Skinned Mesh Renderer, Sprite or Sprite
  Renderer shape without its source, all of which Unity emits from the same way, ignoring the
  module's Randomize Direction, Align to Direction and position, rotation and scale, and turning
  mesh particles about Z (measured in Unity 6). It is written as a cone with no radius and no
  opening, without those settings, and with the default `rotationAxis`. Before, it was a point,
  which sends particles every way, and a Mesh shape without its mesh kept Randomize Direction and
  `rotationAxis: 'emission'`, so mesh particles turned about random axes (cones that all
  face one way in Unity).
- **A material's tint is the system's `materialColor`, and the legacy particle shaders' doubling
  its `materialColorScale` of 2**, instead of both being folded into the start colour. In a
  Linear project Unity multiplies by the tint, and the legacy shaders double it, once it is
  linear; folded into the colour, babylon.quarks turned the doubling linear with it, so a legacy
  tint came out 2^2.2 ≈ 4.6 times as bright as its doubling: additive glows were over twice too
  bright and the faint rim of a halo showed as a hard edge. The colour over lifetime and start
  colours are now the particle system's own.
- **Randomize Direction is left out on a Cone emitting from its base**, which Unity does not
  randomize whatever the amount (only the Cone Volume and the other shapes take it), so a narrow
  cone of particles that Unity keeps in one curving column no longer scatters.
- **A mesh particle's 2D rotation turns about its axis of rotation**, as Unity's does: the start
  rotation is written as a number and the system gets `rotationAxis: 'emission'` when the Shape
  module is on, so a flat mesh on a box or a narrow cone spins as in Unity instead of always about
  its own Z, which tipped level rings over.
- **A mesh particle Unity rotates in 3D keeps the default `rotationAxis`**: with Rotation over
  Lifetime or Rotation by Speed on with Separate Axes, Unity lays the mesh by its Euler angles,
  its 2D start rotation the Z angle, and leaves its axis of rotation unused, whatever the X and Y
  rates (measured in Unity 6; a module with Separate Axes that is off changes nothing). Before,
  such a system got `rotationAxis: 'emission'`, so meshes a cone or a circle sends apart were
  each turned about their own axis and spread out of the plane Unity keeps them in (the
  dark swirls of a portal, or skulls that face the camera in Unity).
- **Legacy Alpha Blended Premultiply** draws as Unity draws it: its texture is premultiplied
  and may carry a glow where its alpha is 0, so the system is exported with `premultipliedMap`,
  which takes the colour times the vertex colour and alpha and lets the frame through by the
  texture's alpha. Quarks multiplied by the texture's alpha again, which darkened it most at its
  soft edges. URP's Premultiply mode is unchanged: it takes straight textures.
- **Systems Unity draws nothing of are left out**: a disabled renderer, Mesh render mode without a
  mesh, or Render Mode None without trails. Their nodes stay as empty groups, so child systems
  still play, and a warning names each. quarks drew them as billboards or default quads before.
  One whose particles spawn sub-emitters is still exported, since those are drawn.
- **Inactive GameObjects are exported disabled** (`visible: false`), so a system Unity does not
  play until something activates it (an animation, a script) no longer plays from the start in
  quarks. Enable the node (`setEnabled(true)`) where Unity would activate it.
- **Mesh particles drawn with an unlit shader are exported unlit** (`lighting: 'unlit'`), as Unity
  draws them. quarks lights mesh particles by default, so a legacy or Standard Unlit particle mesh
  came out shaded and tinted by quarks' fixed light. Lit shaders (Standard Surface, Particles Lit
  and Simple Lit, VertexLit) keep the default.
- **Randomize Direction** → `RandomizeDirection` with the same 0..1 amount. It was written as a
  `ChangeEmitDirection` turn of amount × π, so at 1 (Unity's old Random Direction checkbox)
  every particle flew straight back instead of in a random direction.
- **Gravity Modifier ignores the emitter's scale**, as in Unity: the gravity force is written with
  `scaleWithEmitter: false`. Before, a scaled world-space emitter scaled its gravity with it, so a
  half-size effect fell at half the speed.
- **Rotation over Lifetime with Separate Axes on mesh particles** is written with
  `integration: 'angles'`, so the rates add to the particle's Euler angles as in Unity. Before, a
  mesh tilted at birth turned about its own tilted axes (a ring spun about Y on a tilted start
  rotation wobbled instead of spinning flat), and X and Y rates logged a warning, which is gone.

## [1.0.0-rc.1] — 2026-10-26

### Changed

- The exporter's version follows babylon.quarks 1.0.0-rc.1, and so does the version in
  `metadata.generator`.
- Exports are format 3: a system no longer writes three.quarks' `version: '3.0'`. babylon.quarks
  0.29 and 0.30 read them as they are meant, after a warning that the format is newer.
- Exports no longer write three.js fields babylon.quarks never read: a material's `blending` and
  `map`, a texture's `name`, a node's `layers`, and a system's `blending`, `transparent`,
  `depthWrite` and `alphaTest` (the material entry holds them). The golden exports the
  tests compare with validate against babylon.quarks' effect schema.

## [0.30.0] — 2026-10-24

### Changed

- The exporter's version follows babylon.quarks 0.30. Its output is unchanged apart from the
  version in `metadata.generator`: files it writes load in babylon.quarks 0.29 and 0.30.

## [0.29.0] — 2026-10-24

### Added

- **Cone Volume** → a cone with `emitFrom: 1` (Volume) and its `length`; it no longer warns.
- **Scaling Mode** Local, Hierarchy and Shape map to the runtime's modes of the same names, which
  now behave as Unity's; Local and Shape no longer warn. Exports are format 2 and need
  babylon.quarks 0.29 or later; an older runtime reads Local as its own default.
- **Random Between Two Curves** → `RandomBetweenCurves` with both curves, wherever a curve is
  exported (start values, over-lifetime modules, Width over Trail, Texture Sheet Animation with
  cycles); it was the upper curve with a warning.
- **Limit Velocity over Lifetime with Separate Axes** → a per-axis `Vector3Function` limit with
  its Space; it was the X limit for the speed, with a warning.
- **Size by Speed with Separate Axes** → a per-axis `Vector3Function`; it was the X curve, with a
  warning.
- **Stop Action** Disable and Destroy → `stopAction`; the exporter no longer writes
  `autoDestroy: false`. Callback is the runtime's `finished` event. An effect authored with
  Destroy now disposes itself when it finishes, as in Unity; `EffectPool` keeps its copies.
- **Ring Buffer Mode** and its **Loop Range** → `ringBufferMode` and `ringBufferLoopRange`.

## [0.28.0] — 2026-10-23

The exporter is no longer experimental: it is tested on every change and held to the library's
release rules.

### Added

- **Tests without Unity.** `npm run test:exporter` compiles the exporter under .NET against
  stand-ins for the Unity API, exports effects built in code and compares them with golden files;
  the babylon.quarks suite loads those files with a strict `QuarksLoader`. CI runs both.
- **Materials** are read from their properties, as the URP, HDRP and Standard Particles shaders
  define them: the blend from `_SrcBlend` / `_DstBlend` / `_BlendOp` (Alpha, Premultiply, Additive,
  Multiply, Modulate, Subtractive), an Opaque surface (`transparent: false`, writing depth), Alpha Clipping
  → `alphaTest`, `_ZWrite` → `depthWrite`, Render Face → `renderFace` on mesh particles and Soft
  Particles → `softParticles` with its near and far fade.
- The main texture's **Tiling / Offset** → `mapUV`, and its **wrap mode** (it was always Clamp).
- A mesh's **second UV set** → the geometry's `uvs2`.
- The **Arc's Mode, Spread and Speed** of round shapes (they were always Random).
- **Scaling Mode** Hierarchy and Local → `scalingMode: 'hierarchy'`.
- **Rotation over Lifetime** with Separate Axes on mesh particles → `Rotation3DOverLife` (it was
  Z only).
- `metadata.generator` names the exporter and its version, and `metadata.quarksFormat` the JSON
  format.
- Warnings for what is approximated: Random Between Two Curves, Cone Volume, Scaling Mode Local
  under a scaled parent and a scaled Shape system, Rotation over Lifetime about X and Y on meshes,
  Subtractive blending, Mirror Once, separate-axes Limit Velocity and Size by Speed. The README
  lists them.

### Changed

- **Premultiply** materials export as `ALPHA_PREMULTIPLIED` (they were alpha blended), and the
  legacy Additive (Soft) shader as `ALPHA_SCREENMODE`.
- The source mesh of a Mesh shape is hidden (`isVisible: false`): Unity only emits from it.
- Numbers are written from the float Unity stores (`0.1`, not `0.10000000149011612`), and read
  back the same.

### Fixed

- Exporting a mesh without normals no longer recalculates the normals of the mesh asset itself;
  the runtime gives such a mesh its own.

## [0.27.1] — 2026-10-23 (not published)

### Changed

- Version aligned with babylon.quarks 0.27.1 (no exporter changes).

## [0.27.0] — 2026-10-23

### Changed

- Version aligned with babylon.quarks 0.27.0 (no exporter code changes). The README now marks
  the exporter as experimental and lists the Shuriken features it does not export, and its load
  snippet uses `QuarksLoader.load` instead of `parse`, which does not fetch linked files.
- The README no longer points at `sample-output.json`, which was not in the repository.

## [0.26.0] — 2026-10-21

### Changed

- Version aligned with babylon.quarks 0.26.0 (no exporter changes).

## [0.25.0] — 2026-10-20

### Changed

- Version aligned with babylon.quarks 0.25.0 (no exporter changes).

## [0.24.1] — 2026-10-20

### Fixed

- 0.24.0 did not compile in Unity (`JArray` has no `Count` and no three-argument constructor):
  Velocity over Lifetime → Orbital Offset and Sub Emitters → Inherit are now built with the
  exporter's own JSON API.
- Main → Random Seed above 16,777,216 lost its low bits on export (it went through a `float`); it
  is now written exactly.

## [0.24.0] — 2026-10-20

### Added

- Main → Simulation Speed is exported as `playbackSpeed` (only when not 1).
- Main → Random Seed is exported as `seed` when Auto Random Seed is off.
- Shape → Align To Direction is exported as `alignToDirection`. Noise → Scroll Speed (its constant)
  and Remap (when enabled) are exported as `scrollSpeed` / `remap`. Velocity over Lifetime → Radial
  and Orbital Offset are exported as `radial` / `orbitalOffset`. Sub Emitters → Inherit (color,
  size, rotation, lifetime) is exported as `inherit`.
- Renderer → Sort Mode is exported as `sortMode` (Distance and Depth → `distance`, Oldest in Front,
  Youngest in Front). Renderer → Min / Max Particle Size are exported as `minParticleSize` /
  `maxParticleSize` for billboard and stretched renderers, Unity's default maximum of 0.5 included.
- Main → Culling Mode: Pause and Pause And Catch-up are exported as `cullingMode` (`pause`,
  `pauseAndCatchUp`); Automatic and Always Simulate keep the runtime's default of always
  simulating.

## [0.23.0] — 2026-10-18

### Changed

- Version aligned with babylon.quarks 0.23.0 (no exporter behavior changes).

## [0.22.0] — 2026-10-17

### Changed

- Version aligned with babylon.quarks 0.22.0 (no exporter behavior changes). Its width-over-trail
  curves carry no `absolute` field, so they load in the absolute reading and keep their look.

## [0.21.0] — 2026-10-16

### Changed

- Version aligned with babylon.quarks 0.21.0 (no exporter behavior changes).

## [0.20.0] — 2026-10-16

### Added

- **Shape Position / Rotation / Scale** export as the shape's `transform` (rotation as Unity's own
  Euler → quaternion). They were ignored, so offset and turned emitters (SoftFireBig*,
  SpikyFireBig* and ~230 other Epic Toon FX prefabs) spawned from the system's origin.
- **Renderer Pivot** and **Flip** export as `pivot` / `flip` for billboard, vertical, horizontal
  and stretched billboard systems, mapped so that each quad lands where Unity puts it (checked
  vertex by vertex against `ParticleSystemRenderer.BakeMesh`). Mesh systems log a warning.
- **Material tint:** the particle (or trail) material's `_BaseColor`, `_Color` or legacy
  `_TintColor` (doubled, as the legacy particle shaders do) is multiplied into the start color.
  Effects such as EnergyMissile and EnergyMuzzle, whose materials carry an HDR tint, rendered
  dimmer or in the wrong hue without it.
- **Max Particles** is exported as the system's `maxParticles`, so effects that lean on Unity's
  cap to thin themselves out (Flamethrower, SoftFireBig) no longer overfill. Needs
  `ParticleSystem.maxParticles` added to babylon.quarks alongside this change.
- **Box**, **Box Shell**, **Box Edge** and **Rectangle** shapes export as a quarks `box` emitter
  (sized by the shape's Scale, with Box Thickness), and the single-sided **Edge** shape as an
  `edge` emitter; they all fell back to a point emitter, collapsing fog banks, coin showers and
  zone walls onto one spot. The shapes still left as a point emitter now log a warning.

### Fixed

- **Horizontal and stretched billboards** drew their texture upside down along V next to Unity.
  They now export `flip` with V set to `1 − Flip V`, which mirrors it back.

- A system that draws only its **trails** (Render Mode None + per-particle Trails) lost its
  texture and rendered as plain billboards: the exporter read the empty particle material and
  ignored the Trails module. It now exports a quarks trail system with the trail material,
  width, length, colors, Die with Particles and World Space, textured from the particle back like
  Unity's Stretch mode. Texture Sheet Animation is left off trails (Unity ignores it there), and
  Color by Speed only reaches a trail with Inherit Particle Color on. Needs the `uvFromHead` /
  `colorFromParticle` / `dieWithParticle` / `recordWorldSpace` trail settings added to
  babylon.quarks alongside this change.
- Values authored as curves (gravity modifier, collision bounce, trail lifetime and width scale)
  are exported as the curve's mean instead of its multiplier, which is the curve's peak scale.
- Systems that draw particles _and_ trails, and ribbon trails, now log a warning instead of
  dropping the trails silently.
- **Rotation over Lifetime** and **Rotation by Speed** spun 57× too slowly: Unity's API already
  returns radians, and the exporter converted them from degrees a second time.
- Billboards **turned the wrong way**: Unity rotates a camera-facing quad clockwise for a
  positive angle, quarks counter-clockwise. Start rotation, Rotation over Lifetime and Rotation
  by Speed are negated for billboard and vertical-billboard systems.
- **Texture Sheet Animation** frames were scaled to `tiles − 1`, so the last tile was on screen
  for an instant at most and a random tile pick never chose it. Frames now span every tile, and
  **Cycles** above 1 repeat the frame curve instead of playing it once.
- **Collision, Trigger and Manual sub-emitters** were exported as quarks' every-frame mode, which
  restarts the sub-system's emission on every frame (rain and waterfalls reached ~15,000
  particles). quarks has no matching event, so they are skipped with a warning.
- **Size over Lifetime with Separate Axes** exported the X curve only; it now exports a per-axis
  `Vector3Function`.

## [0.19.0] — 2026-07-25

### Added

- Mesh particle geometry now exports **normals** (recalculated when missing) so mesh shading and
  environment reflections work after load.
- When the particle material has a **Cubemap** (`_Cube` / `_Cubemap` / …), it is baked into an
  embedded 3×2 `reflectionAtlas` plus `reflectionLevel` for babylon.quarks mesh env sampling.

### Changed

- The exporter now carries the same version as the babylon.quarks packages it
  writes for, which is why this release jumps from 0.2.0 to 0.19.0. Nothing was
  released in between; the two are versioned together from here on, so the
  exporter version tells you which library version its output was written
  against.

### Fixed

- Constant `rate × life` that lands on a whole number gets one simulation step
  of lifetime slack on export. Quarks' fixed 1/60 clock otherwise leaves one
  blank frame per period on that knife edge (BlackHole's beam/ring); Unity's
  own tip is "life 1.01". Curves and random ranges are left alone.
- Gravity is exported as a world-space force. It was written as an `ApplyForce`,
  whose direction is added straight to the velocity and so gets turned by the
  emitter's own rotation: a particle system carrying Unity's usual -90° about X
  had its gravity pushing sideways instead of down. Now exported as
  `ForceOverLife`, which undoes the emitter transform.
- Textures Unity keeps in its built-in bundle (`Default-Particle` and friends)
  are embedded properly. They report a virtual asset path with no file behind
  it, so the exporter used to write that path into the image url and the effect
  loaded with a broken texture. Non-readable, compressed and authoring-format
  textures (`.tga`, `.psd`, …) had the same problem — the latter were embedded
  byte-for-byte but labelled `image/png`. All of them are now re-encoded to PNG
  through a render texture. An effect that still cannot embed a texture now logs
  a warning naming it.

## [0.2.0] — 2026-07-14

### Added

- **Tools → Quarks → Export Folder of Effects to JSON** — batch-export every prefab with a
  `ParticleSystem` under a selected Assets folder; output directory mirrors the source
  subfolder layout.
- Progress bar with cancel support during batch export.
- Public `ExportToFile(GameObject, string)` and `ExportFolder(string assetFolder, string outputFolder)`
  APIs for scripting and CI.

### Changed

- Single-effect export refactored to use `ExportToFile`; behaviour unchanged.

## [0.1.0] — initial release

- Export selected hierarchy to babylon.quarks JSON (Shuriken modules → quarks behaviours).
