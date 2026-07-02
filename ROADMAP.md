# Roadmap

Improvement and promotion plan for `babylon.quarks`, based on a full repository review (July 2026).

## Where we are

- Publishable package `babylon.quarks` (~4.3k LOC) built on `quarks.core`, ESM + CJS + types, `@babylonjs/core >= 9` as peer dependency.
- Strong test culture: ~3.2k LOC of tests with 97% statement coverage threshold, CI validating build, tests and tarball contents, npm publish on release.
- Feature set already competitive: batched rendering (sprite/trail), all billboard modes + stretched + mesh + trail, soft particles, texture tiles, sub-emitters, mesh surface emitter plugin, `QuarksLoader` for quarks.art / Unity-exported JSON, adaptive performance budget.
- 18 interactive demos deployed to GitHub Pages with automated preview capture.

## Technical directions

### 1. WebGPU support (strategic priority)

All shaders are GLSL registered via `Effect.ShadersStore` and used through `ShaderMaterial`. Babylon.js is actively pushing WebGPU as the primary engine, and "does it run on WebGPU?" is the first question users will ask.

- Minimum: test the library under `WebGPUEngine` (Babylon transpiles GLSL to WGSL), fix what breaks, state support in the README.
- Maximum: native WGSL shader variants via `ShaderLanguage.WGSL`.

### 2. GPU particle simulation

Simulation is fully CPU-side (inherited from three.quarks). Babylon ships a built-in `GPUParticleSystem`, which is the main argument against this library in large scenes. The previously reverted "pluggable simulation backend API" idea is worth revisiting: a simulation backend abstraction with a compute-shader implementation on WebGPU would be the headline differentiator for a 1.0 release. Notably, Babylon's Node Particle Editor currently generates CPU-only systems — this is an open window.

### 3. Public benchmarks — page shipped

The examples app now has a benchmark page (`benchmark.html`, linked from the gallery toolbar) comparing `babylon.quarks` batched rendering against Babylon's native `ParticleSystem` and `GPUParticleSystem` on an equivalent scenario (cone emitters, additive billboards, color over life). It reports CPU frame ms, FPS, draw calls and active particle count, supports 1/4/16 emitters and 2k–50k particles, and has a "run full benchmark" sweep with copy-as-markdown results. Remaining: run the sweep on real hardware and publish the numbers in the README.

### 4. API cleanliness and tree-shaking

- `BatchedRenderer` bypasses typing in several places: `(ps as any).update(delta)`, `(ps as any).setQualityFactor?.()`, `system as unknown as ParticleSystem`. The `IParticleSystem` interface does not cover the actually-used contract; extend it.
- `package.json` has no `sideEffects` field while `index.ts` has real side effects (`registerShaderChunks()`, `loadPlugin(...)`). Either declare `sideEffects` precisely or move registration into an explicit `init()` so bundlers can tree-shake.
- Minor perf: `Array.from(Float32Array)` in `setupBuffers` copies typed arrays into plain arrays; Babylon accepts typed arrays directly.

### 5. UMD/CDN build for the Playground — done

The Babylon community lives in the Playground (playground.babylonjs.com). The package now ships `dist/babylon.quarks.umd.min.js` (global `BabylonQuarks`, `quarks.core` bundled, `@babylonjs/core` mapped to the `BABYLON` global) with `unpkg`/`jsdelivr` fields in `package.json`. A paste-ready Playground snippet lives in the package README. Remaining: publish a release, then share saved Playground links on the forum.

## Documentation & DX

- README previews: done — both READMEs now show the demo gallery (previews were already captured by `npm run capture:previews`).
- API documentation: generate TypeDoc and deploy next to the demos on GitHub Pages.
- Document the killer workflow front and center: author an effect in the [quarks.art](https://quarks.art/) editor (or export from Unity) → load the JSON with `QuarksLoader`. A step-by-step guide with screenshots.
- Add CHANGELOG.md, CONTRIBUTING.md, GitHub repo topics and a social preview image.
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
4. WebGPU compatibility verification / statement
5. TypeDoc on Pages
6. GPU simulation backend — strategic goal, a good reason for v1.0
