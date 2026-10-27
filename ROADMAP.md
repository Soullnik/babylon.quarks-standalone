# Roadmap

Where `babylon.quarks` stands and what comes next. Rewritten for 1.0 in October 2026; the older
plans are in the git history. What 1.x promises is in [STABILITY.md](STABILITY.md).

## Where we are

- **1.0.0-rc.1 is out** on npm's `next` tag. The API, the effect format and the look of an effect
  are frozen as [STABILITY.md](STABILITY.md) describes; 1.0.0 follows the feedback on the
  candidate.
- Three published packages: `babylon.quarks` (runtime), `babylon.quarks-editor` (headless
  edit model + React UI, embeddable through `QuarksEffectEditor.Show()`), and the Unity
  exporter (`tools/unity-quarks-exporter`, shipped as a `.unitypackage`). `quarks.core` is a
  vendored fork of the three.quarks core and is where the simulation lives.
- Runtime: batched rendering for every render mode (billboard, stretched, horizontal, vertical,
  mesh, trail, beam), soft particles, texture tiles, texture effects (per-texture UV layout with
  channel, tiling, offset and scroll; gradient map; alpha erosion; UV distortion; flip; rim on
  meshes), smoothed trails (tessellation, curve tension, swept side axis), sub emitters, mesh
  surface emitter, 20+ behaviors, native WGSL shaders for WebGPU, scene integration (render order,
  rendering groups, layer masks, fog), bounds and frustum culling with Unity's culling modes, sort
  modes, screen-size limits, effect pool, deterministic randomness, adaptive performance, the
  scene's image processing, a versioned effect format with migrations and a JSON Schema
  (`docs/FORMAT.md`) written by `serializeEffect`. Steady frames allocate nothing per particle.
- Simulation runs on a column store (structure of arrays) with compiled behavior passes. On
  this project's CI-class VM, 50k particles simulate and upload in about 3.5 ms per frame, 5–7×
  faster than Babylon's built-in CPU `ParticleSystem` on the same scenario (see the README's
  benchmark table and `examples/benchmark.html`).
- Editor: 27 Shuriken-style modules, hierarchy of systems, undo/redo, timeline, projects in
  IndexedDB, import/export round-trips through `QuarksLoader`. Its core is unit tested with a 95%
  coverage floor and its React modules are tested under jsdom.
- Quality gates in CI: formatting, lint, `strict` TypeScript, build of every package, TSDoc on
  every export, unit tests with coverage floors for core, runtime and editor, a smoothness sweep,
  a tarball content check, and a headless WebGL smoke over every demo that also checks each has a
  gallery preview. `npm run validate:shaders` compiles every shader variant, GLSL and WGSL, under a
  real compiler, in CI too, on Chromium's software adapter. CI also builds and tests against the
  lowest and the latest Babylon.js the peer range admits, measures what a steady frame allocates,
  checks the API reports and each bundle's size budget, and loads golden files saved by every
  release. Every demo has been run on WebGPU on real hardware (#19), and that run is a release
  step.
- Parity with Unity's Shuriken: see [docs/SHURIKEN_PARITY.md](docs/SHURIKEN_PARITY.md). What is
  left is collision triggers and arbitrary collider shapes, Limit Velocity drag, noise quality
  (octaves), texture-based emission, lights, custom data and renderer shadows.

## Next

1. **1.0.0**: the release candidate becomes 1.0.0 once its feedback is in. Then 1.x minors add
   what is below without breaking anything STABILITY.md promises.
2. **Docs**: a step-by-step effect authoring guide with screenshots, a StackBlitz starter, an
   integration example with react-babylonjs.
3. **Editor to done** ([#43](https://github.com/Soullnik/babylon.quarks-standalone/issues/43)):
   min/max placeholders on random fields, a BabylonJS Editor window host, an embedding guide, a
   keyboard/accessibility pass on the curve and gradient editors, the WebGPU warning when a
   project opens. The editor stays on 0.x while it settles.
4. **Shuriken leftovers** (1.x minors): collision triggers and sub emitters on collision,
   collider shapes beyond planes, Limit Velocity drag, noise quality, texture-based emission.
5. **Perf, round two** (from the profiling report): a shared store per batch for scenes with
   hundreds of small systems, one interleaved instance buffer (one upload instead of five), trail
   colour in RGBA8 and neighbours through the vertex id instead of `previous`/`next` attributes.
   Emitting still allocates about 250 bytes a particle, most of it generator memory regrowing.

## Later

- **GPU simulation** ([#18](https://github.com/Soullnik/babylon.quarks-standalone/issues/18)): a
  compute-shader backend on WebGPU behind the same `ParticleSystem` API, for the scenes where
  Babylon's `GPUParticleSystem` still wins on sheer count. Weeks, not days; the design document
  in #18 stands. Planned for 1.x: it adds a backend and changes neither the API nor the format.
- **Per-particle ribbon trails** on billboard systems (Unity's Trails module): a different
  render architecture from the trail render mode.
- **Beams as ribbons** (Niagara's beam emitter): a beam is one quad from each particle to one
  end point per system. Tangents at both ends, subdivisions along the beam, noise and a per-particle
  end would make it a ribbon; the trail batch is the natural host.
- **Trail tessellation by curvature or screen size** instead of a fixed count, and a trail
  vertex format with RGBA8 colour and neighbours by vertex id (see Perf, round two).
- **Node-based authoring**: not planned. Babylon's own Node Particle Editor covers it, and a
  graph only pays off once it compiles to GPU code.

## Positioning

The competition is Babylon's built-ins: `ParticleSystem`, `GPUParticleSystem` and the Node
Particle Editor. What this library adds: trails, mesh particles with lighting and rim, sub
emitters and behavior composition, batching of many systems into few draw calls, a CPU
simulation that is 5–7× faster than the built-in one, the Shuriken-style editor, the Unity
exporter, and a format shared with three.js through quarks.core.

Channels, in order of reach: the Babylon.js forum thread (an update with a GIF per release),
the community extensions list and awesome-babylonjs, Playground snippets built on the UMD
bundle, short videos of effects.
