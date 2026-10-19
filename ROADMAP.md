# Roadmap

Where `babylon.quarks` stands and what comes next. Rewritten in October 2026 after the
performance and gap-closing pass; the older plan is in the git history.

## Where we are

- Three published packages: `babylon.quarks` (runtime), `babylon.quarks-editor` (headless
  edit model + React UI, embeddable through `QuarksEffectEditor.Show()`), and the Unity
  exporter (`tools/unity-quarks-exporter`, shipped as a `.unitypackage`). `quarks.core` is a
  vendored fork of the three.quarks core and is where the simulation lives.
- Runtime: batched rendering for every render mode (billboard, stretched, horizontal, vertical,
  mesh, trail), soft particles, texture tiles, sub emitters, mesh surface emitter, 20+
  behaviors, native WGSL shaders for WebGPU, scene integration (render order, rendering groups,
  layer masks, fog), bounds and frustum culling with Unity's culling modes, sort modes, screen-size
  limits, effect pool, deterministic randomness, adaptive performance.
- Simulation runs on a column store (structure of arrays) with compiled behavior passes. On
  this project's CI-class VM, 50k particles simulate and upload in about 3.5 ms per frame, 5–7×
  faster than Babylon's built-in CPU `ParticleSystem` on the same scenario (see the README's
  benchmark table and `examples/benchmark.html`).
- Editor: 19 Shuriken-style modules, hierarchy of systems, undo/redo, timeline, projects in
  IndexedDB, import/export round-trips through `QuarksLoader`. Its core is unit tested.
- Quality gates in CI: build of every package, unit tests of core, runtime and editor core, a
  smoothness sweep, a tarball content check, and a headless WebGL smoke over every demo.
- Parity with Unity's Shuriken: see [docs/SHURIKEN_PARITY.md](docs/SHURIKEN_PARITY.md). What is
  left is collision triggers and arbitrary collider shapes, ring buffer / stop action, noise
  quality (octaves), texture-based emission, lights, custom data and renderer shadows.

## Next

In rough priority order; each is a few days of work.

1. **WebGPU on real hardware** ([#19](https://github.com/Soullnik/babylon.quarks-standalone/issues/19)).
   The shaders are native WGSL and compile under a real WGSL compiler in CI, but headless
   software adapters cannot run the demos end to end. A pass on real hardware across every
   demo, with the soft-particle depth path and texture uploads checked, then `check:demos
--webgpu` on a runner that has an adapter.
2. **Editor to done** (the remainder of the former #16): layer mask field, a warning when the
   exported JSON references `blob:` textures, min/max placeholders on random fields, a
   BabylonJS Editor window host, an embedding guide, a keyboard/accessibility pass on the curve
   and gradient editors.
3. **Shuriken leftovers**: collision triggers and sub emitters on collision, collider shapes
   beyond planes, stop action, ring buffer, noise quality.
4. **Perf, round two** (from the profiling report): a shared store per batch for scenes with
   hundreds of small systems, one interleaved instance buffer (one upload instead of five), trail
   colour in RGBA8 and neighbours through the vertex id instead of `previous`/`next` attributes.
5. **Docs**: a step-by-step effect authoring guide with screenshots, StackBlitz / CodeSandbox
   starters, an integration example with react-babylonjs.

## Later

- **GPU simulation** ([#18](https://github.com/Soullnik/babylon.quarks-standalone/issues/18)): a
  compute-shader backend on WebGPU behind the same `ParticleSystem` API, for the scenes where
  Babylon's `GPUParticleSystem` still wins on sheer count. Weeks, not days; the design document
  in #18 stands. Worth doing as the headline of a 1.0.
- **Per-particle ribbon trails** on billboard systems (Unity's Trails module): a different
  render architecture from the trail render mode.
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
