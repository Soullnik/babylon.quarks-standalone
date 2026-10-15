# Changelog

All notable changes to the Unity Quarks Exporter are documented here.

## [Unreleased]

### Fixed

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
