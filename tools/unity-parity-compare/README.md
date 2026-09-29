# Unity parity compare

The Babylon half of the parity check. [`unity-parity-capture`](../unity-parity-capture) records,
in Unity, what a folder of effects looks like and does; this renders the same exported effects
with babylon.quarks — through the camera Unity used, at the frame times Unity used — and compares
the two.

```sh
# the capture, unzipped
npx tsx tools/unity-parity-compare/compare.mts QuarksParity_20260928_104449 out --linear
# one or two effects only
npx tsx tools/unity-parity-compare/compare.mts QuarksParity_… out --linear --only "Fire ayra,Water aura"
```

By default the scene is Babylon's default gamma-space one — what babylon.quarks is made to look
right in, with nothing to set up. `--linear` instead renders the way the capture did in a Linear
project (check `environment.json` → `activeColorSpace`), to separate what the engines' blending
contributes from everything else: into an 8-bit sRGB target, as the capture renders into an 8-bit
sRGB render texture — URP takes an offscreen camera's colour format from its target, so every
variant of the capture, `allowHDR` or not, clamps each fragment to 1 before blending and blends in
linear space.

It needs a Chromium: Playwright's own, or any other through `PARITY_CHROMIUM=/path/to/chrome`.
WebGL runs on SwiftShader when there is no GPU, which is fine at 512².

babylon.quarks and quarks.core are bundled from their sources on every run, so a change to either
shows up without a build.

## What it writes

```
out/report.md                 one row per effect: babylon.quarks relative to Unity
out/report.json               everything below, for every effect
out/<effect>/compare_raw_black.png   Unity (with and without the project's post-processing) above babylon.quarks
out/<effect>/compare_raw_gray.png    the same over mid-grey — dark fringes and premultiplication show here
out/<effect>/quarks/<variant>/NNN.png the babylon.quarks frames, numbered as Unity's
out/<effect>/compare.json     per frame: image statistics for both, and per system Unity's
                              simulation.csv row beside babylon.quarks' own aggregates
```

The report's columns, all babylon.quarks ÷ Unity and averaged over the frames unless noted:

| column         | what it is                                                                 |
| -------------- | -------------------------------------------------------------------------- |
| energy         | summed difference from the background — overall brightness × area          |
| coverage       | share of pixels that differ from the background by more than 2 %           |
| clipped        | share of pixels at full brightness, Unity / babylon.quarks                 |
| extent         | 5th–95th percentile spread of the energy, horizontally and vertically      |
| centroid Δ     | distance between the two energy centroids, in pixels                       |
| covered colour | mean colour of covered pixels, Unity → babylon.quarks, on the middle frame |
| count          | live particles, summed over systems                                        |

The two simulations use different random numbers, so frames never match pixel for pixel; these
statistics, the per-system aggregates and the side-by-side sheets are what to compare. babylon.quarks
draws from a seeded generator, so a run repeats exactly and two exports of one effect compare like
for like; an effect made of a few large particles (Smoke, Sleep) can still sit ±20 % off Unity's
single sample.

## How the view is reproduced

The exporter writes Unity's coordinates unchanged, and Babylon's default handedness is Unity's, so
the scene stays left-handed and the camera takes `camera.json`'s position, rotation, vertical field
of view and clip planes as they are. Each frame is reached by stepping the loaded effect from the
start with Unity's fixed time step (`simulation.json` → `fixedDeltaTime`).
