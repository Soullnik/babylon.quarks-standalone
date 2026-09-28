# First Unity parity audit — a 15-effect aura pack

Results of running [`tools/unity-effect-audit`](../tools/unity-effect-audit) over a commercial
Unity aura pack: **51 particle systems across 15 prefabs**, audited straight from the prefab,
material, shader-graph and texture-importer YAML without opening Unity.

The asset itself is third-party paid content and is **not** committed here. Everything below is
derived analysis of our own exporter's behaviour; re-run the tool against your own copy to
reproduce it.

## Measured against Unity

The static audit below was written from the files alone. A later run of
[`tools/unity-parity-capture`](../tools/unity-parity-capture) in the pack's own project (Unity 6,
URP, Linear colour space) gave Unity's frames, simulation and a measured blend per material, and
[`tools/unity-parity-compare`](../tools/unity-parity-compare) rendered the same exports through
babylon.quarks with the same camera. That settled which causes matter and turned up several the
static audit could not see.

**Energy** is the summed brightness over the frame (babylon.quarks ÷ Unity, mean over 24 frames);
1.00 is a match. "Before": the exporter and runtime as they were. "After": every fix below, the
scene blending in linear space.

| effect | before | after | | effect | before | after |
| --- | ---: | ---: | --- | --- | ---: | ---: |
| Fire | 0.28 | 1.06 | | Meteor | 0.12 | 0.99 |
| Gold | 0.03 | 1.05 | | Soap | 0.15 | 1.02 |
| Healing | 0.21 | 1.00 | | Acid | 0.90 | 1.01 |
| Darkness | 0.02 | 1.13 | | Shine | 0.09 | 1.07 |
| Lightning | 0.32 | 1.19 | | Smoke | 0.25 | 1.24 |
| Blood | 0.45 | 1.29 | | Sleep | 0.75 | 1.31 |
| White | 0.29 | 1.33 | | Freeze | 0.62 | 1.50 |
| Water | 0.06 | 4.50 | | | | |

Particle counts now match Unity's within a few percent (they were 13–60 % short on seven
effects), as do per-system positions, sizes and colours, and the centre of each effect sits within
a few pixels of Unity's (up to 130 px off before). Water, Shine, White and Freeze bind the Shader
Graph's `_Noise` / `_Flow` / `_Mask` textures — a mask on Water's wave layer, noise distortion —
which quarks does not have. Blood and Sleep (~1.3) bind none of them; what still lifts them is not
identified yet. The two simulations draw different random numbers, so an effect made of a few
large particles (Smoke, Sleep) moves by ±20 % from run to run.

What the measurement showed, in order of how much it moved:

1. **Texture alpha comes from the importer, not the file.** 25 of the 31 textures are imported with
   Alpha Source = From Gray Scale from files with no alpha. Embedded as files, they drew as opaque
   squares. _Exporter: embed the alpha Unity uses._
2. **Shape transforms** — as the static audit said: 49 of 51 systems. Without them cones fired at
   the camera, and every stretched glow (whose speed of 0.001 exists only to point it up) drew as
   a line. _Exporter + runtime: `shapeTransform`._
3. **Material gain** — the `_Emission` × HDR `_Color` the static audit found, confirmed by the
   measured blend probe (source = gain × alpha exactly) and ranging 2–18×. _Exporter: measured by
   rendering the material, exported as `tint`; runtime: applied in linear space._
4. **Unity does not linearise particle colours.** In a Linear project the particle colour reaches
   the shader unconverted; only the texture is decoded. Treating it as gamma made reds too deep
   and yellows orange. _Exporter: `vertexColorSpace: "linear"`; runtime: honours it._
5. **Blending happens in linear space.** In a gamma-space Babylon scene soft glows come out at
   0.4–0.9 of Unity's energy even with everything else fixed. _Runtime: particle colour leaves the
   shaders linear when the scene's image processing runs as a post-process._
6. **Burst cycles were ignored by the runtime** — 16 of 51 systems emit through repeating bursts
   (20 × 0.05 s, say) and emitted once per loop.
7. **Stretched billboards**: the direction ignored speeds under 1e-6 (the 0.001-speed glows), and
   ignored motion from VelocityOverLife; and Unity 6's **Freeform Stretching** — used by every
   Water glow — centres the quad instead of trailing it. All fixed in the runtime.
8. **Default-Particle** (a Legacy premultiply shader) cannot be read statically and exported as
   alpha blend; the measured blend is premultiplied. _Exporter: measured blend when unreadable;
   runtime: premultiplied mode premultiplies the particle colour._
9. **Systems Unity draws nothing for** — Acid's trail system has Render Mode None and draws only
   its Trails — exported as untextured billboards: white squares. _Exporter: such a system goes on
   no layer (still simulated, not drawn), or is drawn as quarks trails when it has trails;
   runtime: `layers` now reaches the batch mesh — it was stored and never applied._

And what it ruled out: **bloom and grading barely matter at this distance.** The pack's volume
(Bloom threshold 1, intensity 5) changes Unity's frames by a few percent — little of any effect
goes over 1 once it is drawn at a normal size. The dullness was data, not post-processing.

## Static audit: headline

Most of the gap is **not** in the particle simulation, and not where
[`UNITY_VISUAL_PARITY.md`](./UNITY_VISUAL_PARITY.md) guessed it would be. Three causes dominate,
and two of them live outside the particle system entirely:

1. **The effects are authored for an HDR + bloom pipeline.** Every particle material carries an
   `_Emission` multiplier between **2 and 10**, and the demo scene's volume profile runs
   **Bloom at threshold 1 / intensity 5** plus **ColorAdjustments contrast +3, saturation +15**.
   The exporter reads none of it and we render into an LDR target with no post stack. An effect
   meant to sit at 10× over white, bloom hard and then get a heavy grade arrives as a plain 1×
   sprite. This alone accounts for "it looks dull".
2. **Emitter shapes are transformed, and neither the exporter nor `quarks.core` has the concept.**
   All 15 cone shapes carry a −90° X rotation (Unity's standard "point the cone up" setup) and 26
   spheres are scaled non-uniformly on Y (1.4× to 3×). Exported, every cone emits along the wrong
   axis and every tall aura column becomes a round blob.
3. **The particle shader is a custom Shader Graph, and we only carry its main texture.** It does
   time-based UV scrolling, flow-map distortion, a mask channel, a depth-fade and an opacity term.
   Our fragment shader is `vColor * texture2D(map, vUV)`. Even with a perfect simulation port the
   textures will sit still where Unity's scroll and distort.

## Ranked findings

| systems | prefabs | kind | cause |
| ---: | ---: | --- | --- |
| 41 | 15 | hdr | material `_Emission` multiplier (2–10×) never read by the exporter |
| 41 | 15 | dropped | material `_Depthpower` (soft particles) not exported |
| 39 | 15 | colorspace | main texture is sRGB; Unity samples it into linear, the quarks shader does not |
| 28 | 14 | dropped | shape scale — no shape transform in `BuildShape` or `quarks.core` |
| 22 | 11 | dropped | shape rotation — same |
| 10 | 6 | dropped | shape offset — same |
| 9 | 9 | partial | renderer uses a Unity built-in material, not an authored one |
| 6 | 6 | partial | Noise: only frequency and strength survive |
| 6 | 5 | shader | `_Flow` texture slot bound (distortion) |
| 5 | 5 | partial | Texture Sheet Animation exported as a linear sweep |
| 5 | 4 | shader | `_Noise` texture slot bound |
| 4 | 4 | partial | Rotation over Lifetime, Z axis only |
| 6 | 6 | dropped | renderer Sort Mode (Distance / OldestInFront / YoungestInFront) |
| 1 | 1 | dropped | Trail module + Render Mode None — that system draws **nothing** once exported |
| 1 | 1 | shader | `_Mask` texture slot bound |
| 1 | 1 | dropped | Main Scaling Mode |
| 1 | 1 | dropped | material `_Opacity` |

## Hypotheses the data killed

Worth recording, because three of the ranked guesses in `UNITY_VISUAL_PARITY.md` turned out not to
apply to this pack at all. Measuring first saved the work.

- **Blend-mode detection lands correctly here** — 23 additive, 18 alpha across the 41 systems with
  an authored material. It used to get there by luck: `DetectBlend` matched the shader *name*
  first and only fell through to `_SrcBlend`/`_DstBlend` because "Shader Graphs/HS_Blend_CG"
  happens to contain none of its keywords. The exporter no longer consults names at all — blend
  comes from the shader source, the blend properties or the surface option — and the same 41
  systems resolve from data.
- **There is no HDR in the particle system.** Every `startColor` and every Color-over-Lifetime
  gradient peaks at exactly 1.0. The planned "grep the exported JSON for channels > 1" check would
  have found nothing and concluded, wrongly, that bloom did not matter. All of the HDR lives in the
  material's `_Emission` float instead.
- **Box and Edge shapes are a non-issue.** 33 Sphere, 15 Cone, and a single Box whose scale is
  (0,0,0) — a degenerate point, which is exactly what `BuildShape`'s `default:` branch produces.
- **Max Particle Size does not bite.** Every value is at or above Unity's 0.5 default, so Unity is
  not clamping either; not exporting it changes nothing.

## Fix list

Ordered by systems affected per unit of work. Exporter and package work are separated because they
ship independently.

### Tier 1

1. **Carry the material's HDR multiplier.** *(exporter)* Read the emission/tint scalar off the
   material and fold it into the exported start colour, or add an explicit intensity to the
   material meta. On its own this clips at 1.0 — it only pays off together with item 2, so land
   them as a pair or the effects get brighter-but-flat.
2. **HDR target + bloom.** *(package / host)* The demo host needs an HDR pipeline and a bloom pass
   before any of these effects can read as authored. Decide deliberately whether this is a library
   feature or a documented host recipe; either way the parity target is unreachable without it.
3. **Emitter shape transform.** *(exporter + `quarks.core`)* Position, rotation and scale on
   `EmitterShape`, then export Unity's `m_Position` / `m_Rotation` / `m_Scale`. Nothing else on
   this list changes as many effects' silhouettes.
4. **Colour space.** *(package)* The runtime does no sRGB↔linear conversion anywhere. See
   §4.1 of [`UNITY_VISUAL_PARITY.md`](./UNITY_VISUAL_PARITY.md) — the experiment there is still the
   right one, and 39 sRGB textures say it is worth running.
5. **Soft particles.** *(exporter)* `_Depthpower` maps onto the soft-particle support the runtime
   already has; it is currently dropped on 41 of 51 systems.

### Tier 2

6. **Shader feature parity** — UV scroll, flow distortion, mask. *(package)* The largest piece of
   work here and the one with no partial credit: without it, six effects stay visibly static.
   Worth scoping as its own shader-feature epic rather than a parity fix.
7. **Sort mode** — 6 systems ask for it; `quarks` has no particle sort at all.
8. **Noise fidelity** — scroll speed, remap, octaves, quality.
9. **Texture Sheet Animation** — honour `frameOverTime` and cycles instead of a linear sweep.
10. **Rotation over Lifetime on all three axes.**
11. **Trail module** — one system renders nothing at all today. At minimum the exporter should
    *warn* rather than emit a silently empty system.

### Cheap and worth doing regardless

The exporter drops all of the above without saying so. A warning list printed at export time —
"these 6 things in this effect did not survive" — costs little and turns every future surprise
into a known limitation at the moment of export.

## Reproducing

```bash
python3 tools/unity-effect-audit/audit.py /path/to/unzipped/pack
```
