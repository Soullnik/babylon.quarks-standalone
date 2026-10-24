# Unity Shuriken parity checklist

Gap analysis of the effect editor + runtime against Unity's Particle System (Shuriken).
Three tiers: ✅ shipped · 🟡 runtime supports it, editor UI missing · 🔴 needs quarks.core work.

## Main
- ✅ duration, looping, start lifetime/speed/size (constant/random/curve), start color, world space
- ✅ prewarm with a warm-up time (`prewarmTime`, Niagara's Warmup Time; 0 = whole cycle as Unity), start rotation (constant/random angle, 3D random), start color random-between-two
- ✅ start delay (constant/random, ignored with prewarm, re-armed by restart)
- ✅ Random Between Two Curves for any curve (`RandomBetweenCurves`)
- ✅ 3D start size (uniform / per-axis `Vector3Function`), gradient start color (single `Gradient` and random-between-two-gradients `RandomColorBetweenGradient`)
- ✅ max particles (`maxParticles`), simulation speed (`playbackSpeed`), culling mode (`cullingMode`: always / pause / pause and catch up), random seed (`seed`)
- ✅ scaling mode (`scalingMode`: local / hierarchy / shape with Unity's meaning, world and local space)
- ✅ stop action (`stopAction`: none / disable / destroy; Callback is the `finished` event), ring buffer (`ringBufferMode`: pause / loop until replaced, `ringBufferLoopRange`)

## Emission
- ✅ rate over time (constant/random/curve), bursts (time/count)
- ✅ burst cycles/interval/probability
- ✅ rate over distance

## Shape
- ✅ cone/sphere/hemisphere/circle/donut/rectangle/point/grid/mesh-surface with base params
- ✅ cone tilt as Unity (`atan(r · tan(angle))`), Emit from Base / Volume with Length (`ConeEmitter.emitFrom`, `length`)
- ✅ grid cells at random or in turn (`GridEmitter.sampling`, as Niagara's Grid Location)
- ✅ emitter mode (random/loop/ping-pong/burst) + spread per shape
- ✅ randomize direction (`ChangeEmitDirection`, angle generator)
- 🟡 per-shape speed generator
- ✅ edge shape (`EdgeEmitter`), align-to-direction (`alignToDirection`)
- 🔴 texture-based emission

## Velocity / forces
- ✅ Speed over Lifetime (curve), Limit Speed over Lifetime (curve + dampen; separate axes per axis in local or world space), Force over Lifetime (XYZ), Gravity
- ✅ Orbit over Lifetime
- ✅ Velocity over Lifetime (linear XYZ local/world + orbital XYZ, orbital offset, radial), Inherit Velocity (initial/current)
- 🔴 Lifetime by Emitter Speed

## Color / size / rotation
- ✅ Color over Lifetime (gradient), Size over Lifetime (curve), Rotation over Lifetime (billboards in their plane, meshes about their local Z; separate axes → `Rotation3DOverLife`)
- ✅ Color by Speed, Size by Speed (separate axes → `Vector3Function`), Rotation by Speed

## Noise
- ✅ frequency + strength, position/rotation amounts as separate fields
- ✅ Turbulence field as its own module (scale XYZ, octaves, strength XYZ, time scale) — multi-octave curl noise
- ✅ Noise scroll speed (`scrollSpeed`), remap (`remap`)
- 🔴 Noise quality (octaves per axis)

## Collision / triggers / external forces / lights / custom data
- ✅ Collision module — bounce off a ground plane (editor-supplied `GroundPlaneResolver`; hosts can register their own via `setPhysicsResolver`)
- 🟡 external forces — point/directional `ApplyForce` (Gravity) + Turbulence shipped; no Unity "External Forces" multiplier UI
- 🔴 collision triggers, arbitrary collider shapes (plane only), lights, custom data

## Sub Emitters
- ✅ death/birth/frame triggers, probability, velocity basis, target edited via hierarchy, inherit properties (`inherit`: color / size / rotation / lifetime)
- 🔴 collision/trigger/manual triggers

## Texture Sheet Animation
- ✅ tiles U/V, start tile, frame-over-life curve, atlas preview with tile grid + start-tile highlight
- ✅ tile blending
- ✅ cycles, FPS time mode, frame count / start frame, loop, random frame (`FrameOverLife` options)
- 🔴 sprites mode, single-row mode

## Trails (Unity Trails module = ribbons attached to particles)
- ✅ Trail *render mode* (whole system renders as trails) with length/follow-origin
- ✅ Width over Trail
- ✅ trail flags (`uvFromHead`, `colorFromParticle`, `dieWithParticle`, `recordWorldSpace`), swept trails (`sideAxis`), smoothing (`tessellation`, `curveTension`)
- 🔴 per-particle ribbon trails on billboard systems (different architecture)

## Renderer
- ✅ render modes (billboard ×4, trail, beam, mesh), blend mode, texture picker (presets/URL/file), render order, mesh geometry presets
- ✅ host-provided mesh assets (`geometryOptions`) + load-your-own GLB/glTF (`resolveGeometry` host loader)
- ✅ texture thumbnail + mesh wireframe previews in the inspector
- ✅ soft particles (+near/far fade), alpha test, depth write/test
- ✅ layer mask (`layerMask`)
- ✅ texture layout (UV channel, Tiling / Offset, scroll as Unreal's Panner), flip, gradient map, alpha erosion, UV distortion, rim on mesh particles
- ✅ render face (`renderFace`: both / front / back, mesh particles)
- ✅ sort mode (`sortMode`: distance / oldest in front / youngest in front), min/max particle size (`minParticleSize` / `maxParticleSize`, billboards and stretched), pivot (`pivot`)
- 🔴 shadows

## Editor UX (Particle Effect panel)
- ✅ restart, undo/redo, import/export, example presets, hierarchy panel
- ✅ pause / step / playback speed / elapsed time
- ✅ multi-segment curves (add key: dbl-click curve, remove: dbl-click key, drag keys/handles, numeric value for selected key)
- ✅ playback time scrubbing (timeline panel)
- ✅ texture/mesh previews + texture-sheet start-tile highlight

## Suggested order
1. ~~Playback panel~~ / ~~Main upgrades~~ (done)
2. ~~"by Speed" trio + Orbit + Width over Trail~~ / ~~full burst editing~~ (done)
3. ~~Shape mode/spread~~ / ~~Renderer extras~~ (done)
4. ~~Multi-segment curves~~ (done)
5. ~~Core (vendored fork): startDelay, rate over distance UI, Velocity over Lifetime, Inherit Velocity~~ (done)
6. ~~Collision module + Turbulence + Noise position/rotation amounts~~ (done)
7. ~~3D start size + gradient start color + Randomize Direction + host mesh assets (`geometryOptions`)~~ (done)
8. ~~Noise scroll/remap, radial/orbital-offset velocity, align-to-direction, sub emitter inherit~~ (done)
9. Remaining core work: collision triggers/shapes → noise quality → texture-based emission
