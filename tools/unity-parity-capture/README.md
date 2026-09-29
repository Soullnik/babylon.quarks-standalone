# Unity parity capture

A Unity Editor tool that collects, from Unity itself, everything needed to compare a folder of
particle effects with babylon.quarks — and packs it into one archive to hand over. It is the
data-gathering half of [`docs/UNITY_VISUAL_PARITY.md`](../../docs/UNITY_VISUAL_PARITY.md): the
reference frames, the per-frame particle data and the ground truth about materials that the static
[audit](../unity-effect-audit) can only reconstruct from YAML.

## Install

It uses the exporter, so both go into the Unity project:

1. **Remove any older copy of the Quarks exporter** from the project first — two copies define the
   same assembly and Unity refuses to compile.
2. Copy `tools/unity-quarks-exporter/Editor/` and `tools/unity-parity-capture/Editor/` anywhere under
   `Assets/` (e.g. `Assets/BabylonQuarks/Exporter/Editor/` and `Assets/BabylonQuarks/ParityCapture/Editor/`).

Editor-only (assembly definitions restricted to the Editor platform); nothing ships in a build.
Tested for compilation against the Unity 2021.1 API with Roslyn at C# 7.3; not yet run inside Unity.

## Run

**From the menu:** select the folder holding the effect prefabs in the Project window, then
**Tools → Quarks → Capture Parity Data (selected folder)…** and choose where to write the result.
Unsaved scenes are offered for saving first; the open scenes are restored afterwards. Cancel is
safe — whatever was captured so far is still written.

**Headless:**

```
Unity -batchmode -projectPath <project> -executeMethod BabylonQuarks.ParityCapture.ParityCaptureTool.RunBatch
      -quarksParityFolder "Assets/<effects folder>" -quarksParityOut "<output dir>"
      [-quarksParityResolution 512] [-quarksParityFrames 24] -logFile -
```

Do **not** pass `-nographics`: frames and the blend probe need a GPU. Close the editor on that
project first (Unity locks an open project).

The result is `QuarksParity_<date>_<time>.zip` (or the folder, if the editor's scripting profile
has no zip support — compress it yourself then).

## What is in the archive

| Path                                             | Contents                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`                                  | settings, prefabs, render variants, per-step status/timings, the camera render path used                                                                                                                                                                                                      |
| `log.txt`                                        | every console message during the capture, with the step it happened in                                                                                                                                                                                                                        |
| `environment.json`                               | Unity version, GPU, player/active colour space, render pipeline asset + its renderer assets, quality, every Volume / Post-processing profile with all components                                                                                                                              |
| `ProjectSettings/`                               | the raw project settings files and `Packages/manifest.json`                                                                                                                                                                                                                                   |
| `assets/`                                        | the prefabs and their dependencies with `.meta` (materials, shaders, textures) — scripts excluded                                                                                                                                                                                             |
| `materials/<id>.json`                            | per material: shader-declared properties with values, defaults, flags (HDR, Gamma…) and texture importer settings; keywords; tags; passes; the compiled per-pass render state if Unity exposes it; the exporter's `DetectBlend` verdict; the **measured blend**                               |
| `effects/<name>/effect.json`                     | the exporter's output for that prefab, and `export-log.txt` with its warnings                                                                                                                                                                                                                 |
| `effects/<name>/renderers.json`                  | per system: render mode, material ids, active vertex streams, the renderer's full serialized state                                                                                                                                                                                            |
| `effects/<name>/simulation.*`                    | seeds and settings, and a CSV of per-system aggregates (count, bounds, size, colour, speed, age) sampled at 30 Hz                                                                                                                                                                             |
| `effects/<name>/snapshots.json`                  | every particle (position, size, colour, velocity, rotation, age) at 25 / 50 / 100 % of the timeline                                                                                                                                                                                           |
| `effects/<name>/camera.json`                     | the exact camera, light and ambient used for the frames, frame times, and per-frame coverage                                                                                                                                                                                                  |
| `effects/<name>/frames/<variant>/NNN.png`        | the frames; `contact_<variant>.png` has them all on one sheet                                                                                                                                                                                                                                 |
| `effects/<name>/solo/<system>/<variant>/NNN.png` | each system on its own — every other renderer off, the simulation untouched, the same camera — 12 frames a second over black and a few keyframes over grey (`-quarksParitySoloFps`, 0 to leave out); `camera.json` → `solo` lists the systems (by their index in `simulation.json`) and times |

### Render variants

- `raw_black` — no post-processing, no HDR, black background: the conditions babylon.quarks renders
  under today, so the honest first comparison.
- `raw_gray` — the same on mid-grey, keyframes only: exposes premultiplication and dark-halo issues
  black hides.
- `post_<n>` — HDR plus each Volume profile found in the project (up to two): what the effect looks
  like with the project's bloom and grading.

The camera, light direction and ambient match what babylon.quarks hard-codes for mesh particles,
and are all written to `camera.json` so the Babylon side can reproduce the view exactly.

### Determinism

Every system gets a fixed random seed and every sample is `ParticleSystem.Simulate(t, withChildren,
restart: true, fixedTimeStep: true)` from the start, so the same time always yields the same
particles — for the CSV, the snapshots and the frames alike.

### The measured blend

For each material a quad is rendered into a float target over black, mid-grey and white. Whatever
the shader does, `out = src + k · dst`, so the three backgrounds give the destination factor and the
source term per pixel — the blend Unity really performs, including premultiplication inside the
shader. A second run swaps the main texture for a white alpha ramp so the factors can be fitted
against a known alpha. This is what settles blend modes the exporter cannot read (built-in shaders
with a hard-coded blend).

Nothing in the tool identifies anything by its name; the only names read are property and
serialized field names, which is how Unity addresses that data.
