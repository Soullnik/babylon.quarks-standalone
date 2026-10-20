# Changelog

All notable changes to the Unity Quarks Exporter are documented here.

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
