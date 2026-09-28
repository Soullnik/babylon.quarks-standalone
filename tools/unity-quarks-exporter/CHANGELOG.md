# Changelog

All notable changes to the Unity Quarks Exporter are documented here.

## Unreleased

Checked against Unity itself with `tools/unity-parity-capture` and `tools/unity-parity-compare`
(see `docs/UNITY_PARITY_AUDIT_HOVL.md`): most of what made exported effects look wrong turned out
to be data the exporter did not carry.

### Added

- **Shape transform.** The Shape module's Position / Rotation / Scale are exported as the system's
  `shapeTransform`. 49 of the 51 systems in the Hovl auras carry one — cones turned to point up,
  spheres stretched into columns — and without it cones fired at the camera and every stretched
  glow drew as a line.
- **Measured material colour.** Each material is rendered once, in a preview scene of its own, on
  a quad with a plain white texture over black and over white (`MaterialProbe`). That gives the
  linear-space gain it puts on the particle colour — an HDR colour times an intensity slider,
  whatever the shader calls them — exported as the material's `tint`. Hovl's materials multiply by
  2–18; without it every effect exported several times too dark.
- **Blend measured when it cannot be read.** The same render shows how the material blends
  (additive, straight alpha, premultiplied). A built-in shader with a hard-coded blend — the
  `Default-Particle` material, say — exported as alpha blend before; it now exports as what it
  renders. When the measurement disagrees with the declared blend, the measurement wins and the
  console says so.
- **Freeform stretching** (Unity 2022.2+) is exported as `freeform` on the stretched-billboard
  settings, read from the serialized renderer so older editors are unaffected.
- **Linear colour space.** In a Linear project, materials are exported with
  `vertexColorSpace: "linear"`: Unity hands particle shaders the particle colour unconverted, and
  the runtime then does the same.

### Changed

- **Nothing is decided by a name any more.** Every place the exporter inferred what something _is_
  from what it is _called_ now reads the data instead. Properties are still looked up by their own
  names — that is how a property is addressed — but no shader, material, texture or file name
  steers the export.
    - **Blend mode.** `DetectBlend` used to match "additive" / "multiply" / … in the shader's name
      _first_ and only then look at the blend state, so a shader named "MyAdditiveGlow" that
      alpha-blends exported as additive, and renaming a shader changed the export. It now reads,
      in order: the shader's own ShaderLab source when it is a file in the project (the `Blend` /
      `BlendOp` statements it renders with, parsed as ShaderLab, with `[_Property]` references
      resolved through the material — which also covers shaders that hard-code their blend or
      name their blend properties something else); the `_SrcBlend` / `_DstBlend` / `_BlendOp`
      properties (and the `_BUILTIN_` spellings Shader Graph generates); the `Blend` surface
      option. What none of those resolves exports as alpha blend with a console warning naming
      the material and saying why. The exported material records `blendModeSource`.
    - **Reflection cubemap.** Found by the texture dimension of the properties the material's
      shader declares, instead of a list of guessed names (`_Cube`, `_EnvMap`, …) and the
      material's saved-property list, which keeps textures from shaders the material used before.
    - **Texture embedding.** Whether a texture file can be embedded as-is, and its MIME type, come
      from the file's signature bytes (PNG / JPEG / WebP), not its extension.
- Unity's built-in shaders that hard-code their blend (Legacy Shaders/Particles/\*,
  Mobile/Particles/\*) have no source in the project and no blend properties, so they now export
  as alpha blend with that warning, where the old name matching guessed right for the common
  ones. Switching such materials to Particles/Standard Unlit or URP Particles/Unlit — both expose
  their blend — exports them correctly.

### Fixed

- **Texture alpha as Unity imports it.** Textures were embedded as their source files, but the
  importer's Alpha Source often takes alpha from the colour's grayscale (or drops it), and particle
  textures are usually opaque files imported that way. They drew as opaque squares. The exported
  image now carries the alpha Unity uses.
- **Shape module off.** Unity then emits from the system's origin straight along +Z; the exporter
  wrote a point emitter, which sprays in every direction. It now writes a cone of no radius and
  no angle.
- **Infinite burst cycles.** A burst set to repeat until the loop ends (cycle count 0) exported as
  a single burst; it now exports as the number of cycles that fit.
- **Premultiplied alpha.** `One / OneMinusSrcAlpha` means two different things. Built-in Standard
  Particles, URP and Shader Graph enable `_ALPHAPREMULTIPLY_ON` and multiply colour by alpha in the
  shader, so the texture is straight alpha and quarks must alpha-blend it; without that keyword the
  premultiplication is in the texture and quarks must blend premultiplied. The exporter now reads
  the keyword. It previously collapsed every premultiplied material into alpha blend (too dark for
  premultiplied textures), and the first rework of `DetectBlend` flipped that the other way (too
  bright for URP's premultiply mode).
- Subtractive blending (`BlendOp Sub` / `RevSub` with `DstBlend One`) is recognised rather than
  exported as alpha blend.
- The material's `blending` field is written in three.js's numbering, which is what it means for a
  three.js material; `alphaMode` keeps Babylon's. The two were previously given the same integer,
  so a material read by three.quarks / quarks.art — which the JSON claims compatibility with — got
  the wrong mode. babylon.quarks was unaffected because `QuarksLoader` prefers `alphaMode`.

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
