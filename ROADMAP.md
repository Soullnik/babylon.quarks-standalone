# Roadmap

Improvement and promotion plan for `babylon.quarks`, based on a full repository review (July 2026).

## Where we are

- Publishable package `babylon.quarks` (~4.3k LOC) built on `quarks.core`, ESM + CJS + types, `@babylonjs/core >= 9` as peer dependency.
- Strong test culture: ~3.2k LOC of tests with 97% statement coverage threshold, CI validating build, tests and tarball contents, npm publish on release.
- Feature set already competitive: batched rendering (sprite/trail), all billboard modes + stretched + mesh + trail, soft particles, texture tiles, sub-emitters, mesh surface emitter plugin, `QuarksLoader` for quarks.art / Unity-exported JSON, adaptive performance budget.
- 18 interactive demos deployed to GitHub Pages with automated preview capture.

## Strategic direction: own effect editor + GPU backend

The project does **not** depend on the quarks.art editor going forward. The two flagship efforts are:

### Effect editor (Shuriken-style, in progress)

A stacked-module editor modeled after Unity's Particle System inspector — the quarks.core data
model (behaviors = modules) maps to it 1:1, and Unity tutorials translate directly. Explicitly
**not** a node editor: Babylon already ships NPE for node-based authoring, and a dataflow graph
only pays off when it compiles to GPU code (see GPU backend below — revisit then).

Architecture (designed for embedding into [BabylonJS Editor](https://github.com/BabylonJS/Editor)):

- `packages/babylon.quarks-editor` — `.` export is the headless core (`EffectBinding`
  edit-model, value/shape/gradient helpers, Quarks JSON export), `./react` export is the UI
  (module stack, curve editor, gradient editor, field widgets). React is a peer dependency;
  the same components can mount in the standalone page or in a BabylonJS Editor plugin.
- Standalone host: `/editor.html` in the examples app (live preview + Export JSON).

Shipped modules (Unity inspector order): Main, Emission (rate + bursts), Shape (7 emitter
types), Speed over Lifetime, Limit Speed over Lifetime, Force over Lifetime, Gravity,
Color over Lifetime (gradient), Size over Lifetime (curve), Rotation over Lifetime, Noise,
Texture Sheet Animation (tiles + frame-over-life), Renderer (render/blend mode, texture
picker with host-provided presets, render order). JSON export verified to round-trip
through `QuarksLoader` with all behaviors active.

Also shipped: Sub Emitters module (trigger mode/probability/velocity basis + nested sub-effect
editing via reused Main/Emission/Shape modules; `EffectBinding` handles multiple systems and
serializes sub systems as children with resolvable references) and JSON import on the
standalone page (round-trips with export, including sub emitters).

Next: undo/redo in `EffectBinding`, npm publish of the editor package, BabylonJS Editor
plugin host.

## Technical directions

### 1. WebGPU support — verified

All shaders are GLSL registered via `Effect.ShadersStore` and used through `ShaderMaterial`; under `WebGPUEngine` Babylon transpiles them to WGSL automatically (glslang/twgsl).

- Done: validated under `WebGPUEngine` in headless Chromium (SwiftShader adapter) — all four render modes (billboard, stretched billboard, mesh, trail) create pipelines and render 90 frames with zero WebGPU validation errors. Support stated in the README; the live demos and the benchmark page accept `?engine=webgpu`.
- Remaining: a visual pass on real hardware (headless SwiftShader cannot capture WebGPU canvas pixels), and eventually native WGSL shader variants via `ShaderLanguage.WGSL` to drop the transpiler dependency.

### 2. GPU particle simulation (second flagship effort)

Simulation is fully CPU-side (inherited from three.quarks). Babylon ships a built-in `GPUParticleSystem`, which is the main argument against this library in large scenes. The previously reverted "pluggable simulation backend API" idea is worth revisiting: a simulation backend abstraction with a compute-shader implementation on WebGPU would be the headline differentiator for a 1.0 release. Notably, Babylon's Node Particle Editor currently generates CPU-only systems — this is an open window.

### 3. Public benchmarks — page shipped

The examples app now has a benchmark page (`benchmark.html`, linked from the gallery toolbar) comparing `babylon.quarks` batched rendering against Babylon's native `ParticleSystem` and `GPUParticleSystem` on an equivalent scenario (cone emitters, additive billboards, color over life). It reports CPU frame ms, FPS, draw calls and active particle count, supports 1/4/16 emitters and 2k–50k particles, and has a "run full benchmark" sweep with copy-as-markdown results. Remaining: run the sweep on real hardware and publish the numbers in the README.

### 4. API cleanliness and tree-shaking — mostly done

- ~~`BatchedRenderer` `as any` casts~~: replaced with typed `ParticleSystem` narrowing; public signatures unchanged.
- ~~`Array.from(Float32Array)` copies~~: `SpriteBatch.setupBuffers` and `QuarksLoader.createMeshNode` now pass typed arrays to `VertexData` directly (JSON serialization keeps `Array.from`, as it must).
- ~~Types referenced by the public API but not exported~~ (`AdaptivePerformanceOptions/State`, `ParticleSystemJSONParameters`, `BabylonMetaData`, `AnimationData`, `QuarksTimelineClip`, `BurstParametersJSON`) are now exported from the index.
- Remaining: `sideEffects` is moot while the package ships a single bundle file — revisit if the build moves to `preserveModules`; registration could then move to an explicit `init()`.

### 5. UMD/CDN build for the Playground — done

The Babylon community lives in the Playground (playground.babylonjs.com). The package now ships `dist/babylon.quarks.umd.min.js` (global `BabylonQuarks`, `quarks.core` bundled, `@babylonjs/core` mapped to the `BABYLON` global) with `unpkg`/`jsdelivr` fields in `package.json`. A paste-ready Playground snippet lives in the package README. Remaining: publish a release, then share saved Playground links on the forum.

## Documentation & DX

- README previews: done — both READMEs now show the demo gallery (previews were already captured by `npm run capture:previews`).
- ~~API documentation~~: TypeDoc now builds in the Pages workflow and deploys to `/docs/` next to the demos, linked from the gallery toolbar and both READMEs.
- Document the killer workflow front and center: author an effect in the [quarks.art](https://quarks.art/) editor (or export from Unity) → load the JSON with `QuarksLoader`. A step-by-step guide with screenshots.
- ~~Add CHANGELOG.md, CONTRIBUTING.md~~ (done: changelog ships with the npm package, contributing guide covers setup/checks/demo guide/release flow). Remaining: GitHub repo topics and a social preview image (repo settings, maintainer-only).
- Starter templates: StackBlitz/CodeSandbox (Vite + Babylon + quarks), plus an integration example with react-babylonjs / Reactylon.

## Promotion & positioning

The competition is not other libraries but Babylon's built-ins: `ParticleSystem`, `GPUParticleSystem` and the Node Particle Editor (v8.14+). Advantages to state explicitly:

- **Trail rendering** — Babylon has no built-in particle trails.
- **Sub-emitters** and rich behavior composition.
- **Batching** of heterogeneous systems into few draw calls.
- **Cross-engine format** — one effect runs in three.js and Babylon.
- **Unity effect import** and the **quarks.art visual editor**.

Channels, in order of expected impact:

1. **Babylon.js forum** — the existing thread is the main reach; post a short update with a GIF for every release in "Demos and projects".
2. **Official Babylon docs** — get listed in the community/extensions section; PR to awesome-babylonjs.
3. **Playground snippets** (after the UMD build) — pasteable into forum answers; the main viral mechanism in the Babylon ecosystem.
4. Short videos/posts with effects — VFX is highly showable content.
5. Ecosystem sync — have quarks.art and three.quarks reference babylon.quarks as the official Babylon port.

## Suggested order

1. ~~README with previews and the quarks.art → `QuarksLoader` guide~~ (previews done; guide pending)
2. ~~UMD build + Playground examples~~ (done; Playground links pending a release)
3. ~~Benchmark page~~ (done; publish real-hardware numbers pending)
4. ~~WebGPU compatibility verification / statement~~ (done; real-hardware visual pass pending)
5. ~~TypeDoc on Pages~~ (done)
6. GPU simulation backend — strategic goal, a good reason for v1.0
