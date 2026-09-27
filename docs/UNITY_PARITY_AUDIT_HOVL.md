# First Unity parity audit — a 15-effect aura pack

Results of running [`tools/unity-effect-audit`](../tools/unity-effect-audit) over a commercial
Unity aura pack: **51 particle systems across 15 prefabs**, audited straight from the prefab,
material, shader-graph and texture-importer YAML without opening Unity.

The asset itself is third-party paid content and is **not** committed here. Everything below is
derived analysis of our own exporter's behaviour; re-run the tool against your own copy to
reproduce it.

## Headline

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
