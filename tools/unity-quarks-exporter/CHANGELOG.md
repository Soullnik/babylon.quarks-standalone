# Changelog

All notable changes to the Unity Quarks Exporter are documented here.

## [Unreleased]

### Added

- **Tools → Quarks → Audit Effect Parity (Selected)** — three-way field audit per particle system:
  `unity` (full `UnityEffectProbe` dump) vs `expected` (re-built `BuildPs`) vs `exported` (actual
  envelope). Writes `{name}.parity.json` with `notableDifferences` for debugging effects that score
  `full` but look wrong visually.
- `UnityEffectProbe` — forensic dump of every Shuriken module, curve mode, TSA, renderer stretch,
  material blend inference.
- `QuarksExporter.ExportEnvelope` — returns the envelope `JObject` for audits without writing a file.
- `ValueConverter.ScaleCurve` — shared curve scaling (TSA frame indices, rotation deg→rad).

## [0.19.1] — 2026-07-28

### Added

- **Tools → Quarks → Analyze Effect Pack Metadata** — scan a folder of particle prefabs, dedupe by
  feature fingerprint, and write a JSON report (`featureHistogram`, `gapImpact`, per-effect
  scores/tiers). Use this on large VFX packs to drive exporter work toward ~90% validity.
- **Tools → Quarks → Dump Conversion for Selected Effect** — side-by-side Unity source vs exported
  values plus heuristic `suspicions`.
- Pack analyze report v2 also includes `suspicionImpact` and embeds full `conversion` dumps on
  effects that have suspicions.
- **Tools → Quarks → Export Folder (Good+ Validity Only)** — batch-export only effects scored
  `full` or `good`; writes `export-validity-report.json` beside the output.
- Shared `ExportCoverage` scoring (`full` / `good` / `partial` / `poor`) used by analyze, filtered
  export, and single-effect Console warnings.
- quarks.core **`RandomBetweenCurves`** — Unity MinMaxCurve TwoCurves mode (stable per-particle
  lerp between two curves over `t`).

### Changed

- **TwoCurves** export uses `RandomBetweenCurves` (was upper curve only) — the dominant gap on the
  ~1200-prefab skill pack (~61% of unique fingerprints).
- **Size over Lifetime / by Speed** separate axes export as `Vector3Function`.
- **Color over Lifetime TwoGradients** → `RandomColorBetweenGradient`.
- **TSA `frameOverTime`** maps through `ScaleCurve` to frame indices (incl. TwoCurves).
- **Null material** defaults to **additive** blend (Unity default particle), fixing child alpha
  among additive siblings.
- **Box / BoxShell / BoxEdge** shapes map to quarks `rectangle` (XY plane).
- **Noise** exports Unity `positionAmount` and `rotationAmount`.
- Blend inference also reads Particles/Standard Unlit `_ColorMode` after name + `_DstBlend`.
- `FrameOverLife` accepts any `FunctionValueGenerator` (not only `PiecewiseBezier`).

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
