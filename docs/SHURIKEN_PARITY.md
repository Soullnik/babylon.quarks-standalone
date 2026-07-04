# Unity Shuriken parity checklist

Gap analysis of the effect editor + runtime against Unity's Particle System (Shuriken).
Three tiers: ✅ shipped · 🟡 runtime supports it, editor UI missing · 🔴 needs quarks.core work.

## Main
- ✅ duration, looping, start lifetime/speed/size (constant/random/curve), start color, world space
- ✅ prewarm, start rotation (constant/random angle, 3D random), start color random-between-two
- 🟡 3D start size (`Vector3Generator`), gradient start color (`RandomColorBetweenGradient`)
- 🔴 start delay, simulation speed persistence, max particles, stop action, culling, ring buffer

## Emission
- ✅ rate over time (constant/random/curve), bursts (time/count)
- ✅ burst cycles/interval/probability
- 🔴 rate over distance

## Shape
- ✅ cone/sphere/hemisphere/circle/donut/rectangle/point with base params
- ✅ emitter mode (random/loop/ping-pong/burst) + spread per shape
- 🟡 per-shape speed generator, grid emitter, mesh surface emitter (Shape=Mesh)
- 🔴 edge shape, texture-based emission, align/randomize direction options

## Velocity / forces
- ✅ Speed over Lifetime (curve), Limit Speed over Lifetime (curve + dampen), Force over Lifetime (XYZ), Gravity
- ✅ Orbit over Lifetime
- 🔴 Velocity over Lifetime (direct linear XYZ + radial), Inherit Velocity, Lifetime by Emitter Speed

## Color / size / rotation
- ✅ Color over Lifetime (gradient), Size over Lifetime (curve), Rotation over Lifetime
- ✅ Color by Speed, Size by Speed, Rotation by Speed

## Noise
- ✅ frequency + strength (position amount fixed)
- 🟡 position/rotation amounts as separate fields
- 🔴 octaves, scroll speed, remap, quality

## Collision / triggers / external forces / lights / custom data
- 🔴 not present in quarks.core

## Sub Emitters
- ✅ death/birth/frame triggers, probability, velocity basis, target edited via hierarchy
- 🔴 collision/trigger/manual triggers, inherit properties

## Texture Sheet Animation
- ✅ tiles U/V, start tile, frame-over-life curve, atlas preview with tile grid
- ✅ tile blending
- 🔴 sprites mode, single-row mode, cycles

## Trails (Unity Trails module = ribbons attached to particles)
- ✅ Trail *render mode* (whole system renders as trails) with length/follow-origin
- ✅ Width over Trail
- 🔴 per-particle ribbon trails on billboard systems (different architecture)

## Renderer
- ✅ render modes (billboard ×4, trail, mesh), blend mode, texture picker (presets/URL/file), render order, mesh geometry presets
- ✅ soft particles (+near/far fade), alpha test, depth write/test
- 🟡 layer mask, host-provided mesh assets
- 🔴 sort mode, min/max particle size, pivot, shadows

## Editor UX (Particle Effect panel)
- ✅ restart, undo/redo, import/export, example presets, hierarchy panel
- ✅ pause / step / playback speed / elapsed time
- ✅ multi-segment curves (add key: dbl-click curve, remove: dbl-click key, drag keys/handles, numeric value for selected key)
- 🔴 playback time scrubbing

## Suggested order
1. ~~Playback panel~~ / ~~Main upgrades~~ (done)
2. ~~"by Speed" trio + Orbit + Width over Trail~~ / ~~full burst editing~~ (done)
3. ~~Shape mode/spread~~ / ~~Renderer extras~~ (done)
4. ~~Multi-segment curves~~ (done)
5. Core contributions: startDelay → rate over distance → collision
