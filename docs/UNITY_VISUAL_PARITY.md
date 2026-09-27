# Unity → babylon.quarks visual parity: research plan

Effects authored in Unity look right in Unity and worse after export. This document is the plan
for finding out *why*, with measurements rather than eyeballing, and for turning the answer into a
regression gate.

It is a research plan, not a fix list. The hypotheses in [§4](#4-hypotheses-ranked) are ranked by
expected impact and each one comes with the cheapest experiment that confirms or kills it.

---

## 1. Split the pipeline before looking at pixels

Three independent stages sit between the Unity inspector and our canvas. Each can be checked on
its own, and "it looks worse" almost never says which one is at fault:

| Stage | What it does | Fails as |
| --- | --- | --- |
| **A — Export** | Unity `ParticleSystem` → Quarks JSON (`tools/unity-quarks-exporter`) | modules silently dropped, curves resampled, shapes downgraded |
| **B — Simulation** | JSON → per-particle state per frame (`quarks.core` + `ParticleSystem`) | particles are in the wrong place / wrong size / wrong count |
| **C — Rendering** | particle state → pixels (`SpriteBatch`, `TrailBatch`, shaders) | the right particles, composited wrong: colour, blending, sorting, glow |

The whole plan is: **bisect A/B/C first, then dig**. A single pixel diff cannot tell them apart —
but a per-frame *state* dump (stage B output) compared against Unity's own
`ParticleSystem.GetParticles()` can, and that is the highest-value tool described here (§3.2).

Working hypothesis from the code read below: most of the visible loss is in **C**, the rest in
**A**. Stage B is the best-tested part of the repo (`npm run check:smoothness`, 97% coverage).

---

## 2. Phase 0 — build the reference corpus

Nothing here is automatable from this side: Claude cannot open Unity. This is the manual part, and
everything downstream depends on it being captured *once*, properly.

### 2.1 Pick the corpus

6–10 effects that actually show the problem, spread across the feature surface — otherwise we fix
one effect and learn nothing. Suggested spread:

- soft alpha-blended smoke (worst case for colour space + sorting)
- additive fire / flame sheet (texture sheet animation)
- magic aura / portal (HDR colours, bloom-dependent)
- muzzle flash (single-frame, burst, stretched billboard)
- sparks (trails, high count, small particles)
- a mesh-particle effect (lighting, env reflection)
- one effect with Noise enabled
- one effect using a Box or Edge shape (see §4.8 — expected to be badly broken)

### 2.2 Capture from Unity, per effect

Into `fixtures/unity-parity/<effectName>/`:

- **`effect.json`** — the exporter output, unmodified.
- **`unity-frames/####.png`** — a PNG sequence from Unity Recorder. Fixed camera, fixed
  `Time.captureFramerate = 30`, 90 frames, effect restarted at frame 0. Two backgrounds: pure
  black and mid-grey `#808080` (grey exposes premultiply and halo bugs that black hides).
- **`unity-frames-nopost/####.png`** — the same capture with **all post-processing disabled**
  (no bloom, no tonemapper, no colour grading) and camera HDR off.
  This is the honest apples-to-apples target for our renderer today. The post-processed capture is
  the target we eventually want to reach, not the one to debug against first.
- **`unity-settings.json`** — hand-written or dumped: project **Color Space (Linear or Gamma)**,
  camera HDR on/off, bloom threshold/intensity/scatter, the renderer's **Sort Mode** and
  Sorting Fudge, camera FOV / position / near / far, and the texture importer settings of every
  particle texture (sRGB checkbox, Alpha Is Transparency, mipmaps, compression).
- **`modules.png`** — a screenshot of the full expanded inspector, so a later session can see what
  the effect was *supposed* to do without opening Unity.

> The single most valuable field in that whole list is **Color Space**. See §4.1 — it likely
> explains a large fraction of the difference on its own, and it is one dropdown.

### 2.3 Commit it

Checked into the repo (the PNG sequences are the bulk; downscale to 640×360 if size becomes a
problem — the bugs we are hunting are not sub-pixel). Without a committed corpus every session
starts from zero and no result is reproducible.

---

## 3. Phase 1 — the harness Claude builds

Three scripts, modelled on what the repo already does
(`scripts/capture-demo-previews.mts` for Playwright capture, `scripts/smoothness-sweep.mts` for
headless hypothesis-driven sweeps). Each is an independent session / PR.

### 3.1 Frame capture + diff (`scripts/unity-parity-capture.mts`, `…-diff.mts`)

Capture: load `effect.json` into a headless Babylon scene configured from `unity-settings.json`
(same camera, same background, same 90 frames), drive the simulation with a **fixed** `1/30` step —
never `getDeltaTime()` — and write `quarks-frames/####.png`.

Diff: per frame produce side-by-side, absolute difference, and a heatmap; plus numeric series over
the 90 frames:

- mean absolute error and per-channel error
- mean luminance over time (energy curve — catches "too dim / no glow")
- covered-pixel count over time (proxy for particle count × size)
- effect bounding box and centroid over time (proxy for velocity and shape)

Output one self-contained HTML report with a frame slider. That report is the actual deliverable —
it is what a human looks at to decide which hypothesis to chase.

**Determinism caveat, and it is a real one:** `quarks.core` calls `Math.random()` in 58 places
(`packages/quarks.core/src/`) and `SimplexNoise` is constructed unseeded. A `seededRandom` exists
in `MathUtils` and is exported but **used nowhere**. So frame-exact diffing is impossible today.
Two consequences:

- Wiring the existing `seededRandom` through the generators (behind an opt-in seed) is a
  prerequisite for exact diffs and is worth doing early — it is small and it also makes the diff
  usable as a CI gate later.
- Until then, and permanently for noise-driven effects (Unity's curl noise is a different
  implementation and will never match sample-for-sample), compare the **statistical** series
  above rather than per-pixel error. Those series are enough to catch every hypothesis in §4.

### 3.2 State-level comparison — the bisector

This is the tool that separates B from C, and it is worth building before chasing any pixel.

- **Unity side** (small C# script the user runs once per effect): each frame, call
  `ParticleSystem.GetParticles()` and write a CSV row of aggregates — alive count, min/mean/max of
  size, position bbox, mean speed, mean colour RGBA, mean rotation. No per-particle rows needed;
  aggregates are what we compare and they survive the RNG mismatch.
- **Our side**: the same aggregates from a `NullEngine` run at a fixed `1/60` step — exactly the
  shape of `scripts/smoothness-sweep.mts`, which already does headless stepping and attribute
  inspection and can be lifted almost wholesale.
- **Compare**: overlay the two CSVs per metric.

Reading the result:

- curves agree, pixels differ → **stage C**, go to §4.1–§4.7
- curves disagree → **stage A or B**, go to §4.8–§4.11, and the metric that diverges tells you
  which module (alive count → emission/lifetime; bbox → shape/velocity; size → size-over-life)

### 3.3 Export audit — shipped as `tools/unity-effect-audit`

**Built, and it needs no Unity at all.** Unity serializes prefabs, materials, shader graphs and
texture importers as YAML, so the audit reads the effect description straight off disk and applies
the exporter's decision table to it. See the [tool](../tools/unity-effect-audit) and the
[first results](./UNITY_PARITY_AUDIT_HOVL.md). The original plan, for reference:

Walk the Unity `ParticleSystem` and the JSON it produced, and print **every module Unity had
enabled that produced nothing in the output**. Today the exporter drops things silently
(`ParticleConverter.BuildShape` returns a point emitter from its `default:` branch; Lights, ribbon
Trails, Custom Data and collision triggers are skipped by design). A single "these 6 things did not
survive the export" report per effect will probably explain several of the corpus effects outright,
for a fraction of the cost of the pixel work.

Extend it to value fidelity: sample each Unity `AnimationCurve` / `Gradient` at 32 points in C#,
sample the exported quarks generator at the same 32 points in TS, diff. That turns curve conversion
from "looks preserved" into a number.

---

## 4. Hypotheses, ranked

Each is stated as a claim about this codebase, with the experiment that settles it. Ordered by
expected visual impact × number of effects affected.

> **Since measured.** [`UNITY_PARITY_AUDIT_HOVL.md`](./UNITY_PARITY_AUDIT_HOVL.md) ran the
> [export audit](../tools/unity-effect-audit) (§3.3) over a real 51-system pack and settled
> several of these. §4.2 is confirmed and is the top cause, but through the *material's* HDR
> multiplier rather than gradient colours; §4.4 and §4.8 did not apply at all; and the audit found
> a cause not listed here — emitter shape transforms, which neither the exporter nor `quarks.core`
> supports. Read that document before spending time on the ranking below.

### 4.1 No colour-space management anywhere — *top suspect*

`packages/babylon.quarks/src/shaders/particle_frag.glsl.ts` samples the texture, multiplies by the
vertex colour, and writes `gl_FragColor` — no sRGB→linear on input, no linear→sRGB on output. The
materials are raw `ShaderMaterial`s, so Babylon's `imageProcessingConfiguration` never touches
them. Grepping the whole repo for `gammaSpace` / `toLinearSpace` / `sRGB` returns hits only in the
Unity exporter's cubemap bake — nothing in the runtime.

Unity in **Linear** colour space samples an sRGB texture into linear, multiplies in linear, blends
in a linear framebuffer, then tonemaps and gamma-encodes. We do all of that in gamma space. Same
numbers, different result: mid-tones shift, additive falloff gets harsh and dirty, soft smoke edges
go too dark, and gradients bend in the middle.

**Experiment (cheap, decisive):** ask for one corpus effect captured from a Unity project switched
to **Gamma** colour space. If our render matches the Gamma capture but not the Linear one, this is
confirmed and quantified in one comparison.

**Experiment (exact):** a static quad with a known gradient texture and a known vertex colour in
both engines; read back pixels; compare against the analytic linear and gamma answers. This gives a
number, not an impression.

### 4.2 No HDR and no bloom

Unity effects lean on HDR gradient colours (intensity > 1 in the colour picker) plus a Bloom
post-process. We render into an LDR target with no bloom, so everything above 1.0 clips flat to
white instead of blooming. This is the usual cause of "it looks flat / not juicy".

**Experiment:** grep the exported JSON for any colour channel > 1. Then re-render our side with a
`DefaultRenderingPipeline` bloom roughly matched to the Unity settings from `unity-settings.json`
and re-diff. Note this is a *host* concern as much as a library one — the outcome may be a
documented recipe rather than a code change.

### 4.3 No per-particle sorting

`SHURIKEN_PARITY.md` lists sort mode as 🔴, and grepping the renderer confirms there is no
distance sort — particles are drawn in pool order. Unity sorts per `ParticleSystemRenderer.sortMode`.
On alpha-blended smoke this shows as popping and wrong overlaps; on additive it is invisible
(additive is order-independent).

**Experiment:** compare an additive effect and an alpha-blended effect from the corpus. If additive
matches and alpha-blended does not, sorting is implicated — and the diff heatmap will show the
error concentrated where particles overlap.

### 4.4 Blend mode is guessed, not read

`ExportContext` infers the blend mode from the material's shader name and `_SrcBlend`/`_DstBlend`;
anything unusual falls back to alpha blend, and Premultiply is folded into alpha blend
(see the exporter README caveats). One wrong guess changes the whole look of an effect.

**Experiment:** dump the resolved `alphaMode` per system on our side, put it next to the Unity
material's actual blend setup. A table of 10 effects will show immediately whether the inference is
holding.

### 4.5 Texture pipeline mismatches

Candidates, in order of how often they bite: Unity's **Alpha Is Transparency** (which dilates RGB
into fully transparent texels — without it, bilinear filtering pulls black in and gives dark halos
on soft particles), the sRGB import flag, mipmap generation, and premultiplied vs straight alpha.
`QuarksLoader` defaults to `invertY: true` and mipmaps on, with no notion of any of the above.

**Experiment:** dark fringes around soft particles on the grey-background capture are the tell.
Compare a single quad with one particle texture, both engines, grey background.

### 4.6 Soft particles silently inactive

Soft particles need a depth texture supplied by the host (`BatchedRenderer.setDepthTexture`). If the
host never sets one, the feature does nothing and particles cut hard against geometry, where Unity
faded them.

**Experiment:** check whether the demo/host scene sets a depth texture at all; assert in the harness.

### 4.7 Mesh-particle lighting is hardcoded

`SpriteBatch` sets a fixed light direction `(0.4, -1, 0.6)`, white light and `0.35` ambient for mesh
render mode. Unity lights mesh particles with the scene's actual lighting. Any mesh-particle effect
will differ in a way no amount of export fidelity can fix.

**Experiment:** relevant only if the corpus mesh effect diverges in brightness rather than shape.

### 4.8 Box and Edge shapes silently become point emitters

`ParticleConverter.BuildShape` has a `default:` branch returning `{"type": "point"}` for everything
outside Cone / Sphere / Hemisphere / Circle / Donut / Mesh. Box and Edge are common in Unity. Worse:
the runtime *does* ship a `rectangle` emitter (per `SHURIKEN_PARITY.md`) that Box could map onto —
so this is a gap in the exporter, not the engine.

**Experiment:** the export audit in §3.3 reports it for free. An effect hit by this looks
catastrophically wrong (everything from one point), so it is easy to spot and easy to fix.

### 4.9 Shape arc mode and spread are hardcoded to zero

`ShapeBase` always writes `"mode": 0, "spread": 0`, even though the runtime supports Unity's
Loop / Ping-Pong / Burst-Spread arc modes. Any effect relying on arc mode emits randomly instead of
sweeping.

### 4.10 Texture Sheet Animation is a linear sweep

Documented in the exporter README: the frame animation is exported as a full linear sweep over the
sheet, ignoring Unity's `frameOverTime` curve and cycle count. Flipbook fire and explosions play at
the wrong speed or wrong range.

**Experiment:** the curve-fidelity comparison in §3.3 covers it; visually it shows up as the
flipbook finishing early or late in the frame-by-frame diff.

### 4.11 Known module gaps from `SHURIKEN_PARITY.md`

Worth cross-checking against the corpus before spending time elsewhere — each is a silent no-op if
the effect used it: Noise scroll speed / remap / quality, radial and orbital-offset velocity,
`maxParticles`, simulation speed, ring buffer, collision triggers and non-plane colliders,
per-particle ribbon Trails, Lights, Custom Data, align-to-direction, pivot, min/max particle size.

Also: rotation-over-lifetime exports the Z axis only, and Unity's left-handed vs Babylon's
right-handed space means off-origin child offsets can be mirrored (exporter README caveat).

---

## 5. Phase 3 — fix, then lock it in

Rank confirmed causes by (visual impact × effects affected) ÷ cost. Fix one at a time, re-running
the harness after each so the report shows the delta attributable to that change alone.

Then wire the parity diff into `npm run check` alongside `check:smoothness`, with a tolerance per
metric. Once a Unity effect matches, it should stay matching — that is the real payoff of building
the corpus, and it is why Phase 0 is worth doing carefully.

---

## 6. How to run this with Claude

The work splits into independent sessions because the pieces do not depend on each other. Keeping
them separate also keeps each PR reviewable.

**What only the user can do (Unity side):** everything in Phase 0 — capture frames, dump settings,
run the exporter, run the C# aggregate dumper once it exists, drop the files into
`fixtures/unity-parity/`.

**Suggested session breakdown:**

| # | Session | Depends on |
| --- | --- | --- |
| 1 | Seed the RNG: route `seededRandom` through the generators behind an opt-in seed | — |
| 2 | Capture + diff harness and the HTML report (§3.1) | corpus for 1 effect |
| 3 | State-level comparison: C# aggregate dumper + `NullEngine` dumper + overlay (§3.2) | — |
| 4 | Export audit: dropped-module report + curve fidelity (§3.3) | — |
| 5 | The colour-space experiment (§4.1) — quantify before changing anything | 2 |
| 6+ | One session per confirmed cause | 5 |

Sessions 1, 3 and 4 need no corpus and can start immediately.

**What to paste into a session so it is useful:** the effect JSON, 3–4 key PNG frames from both
sides, the inspector screenshot, and the colour space / HDR / bloom settings. A session without the
Unity-side settings will guess, and guessing is what this plan exists to replace.

---

## 7. Triage checklist — before any of the above

Eight questions, answerable in half an hour without writing a line of code. Several of them may
close the whole investigation.

1. Is the Unity project in **Linear** or **Gamma** colour space? (§4.1)
2. Is camera HDR on, and is there a **Bloom** post-process? (§4.2)
3. Does the exported JSON contain any colour channel **> 1**? (§4.2)
4. What blend mode did each system resolve to, and does it match Unity? (§4.4)
5. Does any effect use a **Box or Edge** shape? (§4.8 — silently a point emitter)
6. Does any effect use shape **arc mode** other than Random? (§4.9 — silently ignored)
7. Does any effect use the **Trails** module, **Lights**, or **Custom Data**? (skipped entirely)
8. Does any flipbook use a non-linear **frameOverTime** curve or cycles > 1? (§4.10)
