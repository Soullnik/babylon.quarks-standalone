# Unity Shuriken parity checklist

Gap analysis of the effect editor + runtime against Unity's Particle System (Shuriken), as of
1.0.0-rc.1 (October 2026).
Three tiers: ✅ shipped · 🟡 runtime supports it, editor UI missing · 🔴 needs quarks.core work.

## Main
- ✅ duration, looping, start lifetime/speed/size (constant/random/curve), start color, world space
- ✅ prewarm with a warm-up time (`prewarmTime`, Niagara's Warmup Time; 0 = whole cycle as Unity), start rotation (constant/random angle, 3D random), start color random-between-two
- ✅ start delay (constant/random, ignored with prewarm, re-armed by restart)
- ✅ Random Between Two Curves for any curve (`RandomBetweenCurves`)
- ✅ a curve holds its first key's value before it and its last key's value after it (the exporter writes flat pieces there)
- ✅ 3D start size (uniform / per-axis `Vector3Function`), gradient start color (single `Gradient` and random-between-two-gradients `RandomColorBetweenGradient`)
- ✅ max particles (`maxParticles`), simulation speed (`playbackSpeed`), culling mode (`cullingMode`: always / pause / pause and catch up), random seed (`seed`)
- ✅ scaling mode (`scalingMode`: local / hierarchy / shape with Unity's meaning, world and local space; a world-space particle's start velocity scaled along each axis by the mode's scale as Unity's, its speed limit not, measured in Unity 6; under a mirrored parent turned by Unity's `transform.rotation`, which stays a rotation, `'local'` leaving the parent's mirror out and `'shape'` mirroring the shape by the signed lossy scale, measured in Unity 6; under a skewed hierarchy turned by Unity's `transform.rotation` and scaled by its `lossyScale`, and under a parent scaled to 0 still turned by `transform.rotation`; `'shape'` also turns the start direction by the scale, keeping the speed)
- ✅ stop action (`stopAction`: none / disable / destroy; Callback is the `finished` event), ring buffer (`ringBufferMode`: pause / loop until replaced, `ringBufferLoopRange`)

## Emission
- ✅ rate over time (constant/random/curve), bursts (time/count); a moving world-space emitter spreads it along its path within a step
- ✅ burst cycles/interval/probability
- ✅ rate over distance

## Shape
- ✅ cone/sphere/hemisphere/circle/donut/rectangle/point/grid/mesh-surface with base params
- ✅ cone tilt as Unity (`atan(r · tan(angle))`), Emit from Base / Volume with Length (`ConeEmitter.emitFrom`, `length`)
- ✅ grid cells at random or in turn (`GridEmitter.sampling`, as Niagara's Grid Location)
- ✅ emitter mode (random/loop/ping-pong/burst) + spread per shape
- ✅ no shape (module off, or a mesh / renderer / sprite shape without its source): from the origin along +Z, turning about Z, as Unity; the exporter writes a cone with no radius and no opening
- ✅ Randomize Direction (`RandomizeDirection`, the same 0..1 blend toward a random direction); a turn by a set angle is `ChangeEmitDirection`; Unity ignores it on a Cone emitting from its base, and the exporter leaves it out there
- ❌ Spherize Direction
- ✅ per-shape speed of the emitter point in loop / ping-pong mode (`speed`; the editor sets a constant)
- ✅ edge shape (`EdgeEmitter`), align-to-direction (`alignToDirection`)
- 🔴 texture-based emission

## Velocity / forces
- ✅ Speed over Lifetime (curve), Limit Speed over Lifetime (curve + dampen; separate axes per axis in local or world space), Force over Lifetime (XYZ, Space, Randomize → `randomized`; scaled with the emitter in either simulation space, as Unity does), Gravity (never scaled by the emitter → `scaleWithEmitter: false`)
- ✅ Orbit over Lifetime
- ✅ Velocity over Lifetime (linear XYZ local/world + orbital XYZ, orbital offset, radial; part of the particle's animated velocity, so a stretched billboard is drawn along it as Unity draws along `totalVelocity`), Inherit Velocity (initial/current; the exporter leaves it out where Unity ignores it: in Local space, and in Custom space in Current mode)
- 🔴 Lifetime by Emitter Speed, Limit Velocity drag (`Drag`, multiply by size / velocity)

## Color / size / rotation
- ✅ over-life curves (frame, colour, size, rotation, forces, …) read at the age the particle is drawn at, after the step ages it, as Unity reads them (`stepEndAge`)
- ✅ Color over Lifetime (gradient), Size over Lifetime (curve), Rotation over Lifetime (billboards in their plane, meshes about their rotation axis, picked from the emission as Unity's `axisOfRotation` with `rotationAxis: 'emission'`; separate axes → `Rotation3DOverLife` with `integration: 'angles'`, Unity's Euler-angle integration; Unity then rotates the mesh in 3D, a 2D start rotation as its Z angle, so it keeps the default `rotationAxis`, as with separate axes on Rotation by Speed)
- ✅ Color by Speed, Size by Speed (separate axes → `Vector3Function`), Rotation by Speed

## Noise
- ✅ frequency + strength, position/rotation amounts as separate fields
- ✅ Turbulence field as its own module (scale XYZ, octaves, strength XYZ, time scale) — multi-octave curl noise
- ✅ Noise scroll speed (`scrollSpeed`), remap (`remap`)
- 🔴 Noise quality (octaves per axis)

## Collision / triggers / external forces / lights / custom data
- ✅ Collision module — Planes mode (`planes` in the emitter's space, bounce, dampen, lifetime loss, radius scale); World mode through a host resolver (editor-supplied `GroundPlaneResolver`; hosts register their own via `setPhysicsResolver`)
- ❌ collision Min / Max Kill Speed
- ✅ Trail Renderer (as a one-particle trail system: Time → `lifetime`, Min Vertex Distance, width curve → `WidthOverLength`, Color → `ColorOverLength`)
- 🟡 external forces — point/directional `ApplyForce` (Gravity) + Turbulence shipped; no Unity "External Forces" multiplier UI
- 🔴 collision triggers, arbitrary collider shapes (plane only), lights, custom data

## Sub Emitters
- ✅ death/birth/frame triggers (a Birth emission lasts as long as its parent, looping target included), probability, velocity basis, target edited via hierarchy, inherit properties (`inherit`: color / size / rotation / lifetime)
- 🔴 collision/trigger/manual triggers

## Texture Sheet Animation
- ✅ tiles U/V, start tile, frame-over-life curve, atlas preview with tile grid + start-tile highlight
- ✅ tile blending
- ✅ cycles, FPS time mode, frame count / start frame, loop, random frame (`FrameOverLife` options)
- ✅ single-row mode, custom or random row (`FrameOverLife` `rowLength`, `rowCount`, `row`, `randomRow`)
- 🔴 sprites mode, row from mesh index

## Trails (Unity Trails module = ribbons attached to particles)
- ✅ Trail *render mode* (whole system renders as trails) with length/follow-origin
- ✅ Width over Trail
- ✅ trail flags (`uvFromHead`, `colorFromParticle`, `dieWithParticle`, `recordWorldSpace`), swept trails (`sideAxis`), smoothing (`tessellation`, `curveTension`)
- 🔴 per-particle ribbon trails on billboard systems (different architecture)

## Renderer
- ✅ render modes (billboard ×4, trail, beam, mesh), blend mode, texture picker (presets/URL/file), render order, mesh geometry presets
- 🟡 stretched billboard: Speed Scale and Length Scale (`speedFactor`, `lengthFactor`) draw the length Unity draws, `size × Length Scale + speed × Speed Scale`, each along the particle's own way whatever the other's sign, a streak reaching ahead of the particle turned round with its texture, measured in Unity 6; Camera Scale and Freeform Stretching not yet
- ✅ host-provided mesh assets (`geometryOptions`) + load-your-own GLB/glTF (`resolveGeometry` host loader)
- ✅ texture thumbnail + mesh wireframe previews in the inspector
- ✅ soft particles (+near/far fade), alpha test, depth write/test, layer mask (`layerMask`)
- ✅ texture layout (UV channel, Tiling / Offset, scroll as Unreal's Panner), flip, gradient map, alpha erosion, UV distortion, rim on mesh particles
- ✅ render face (`renderFace`: both / front / back, mesh particles)
- 🟡 materials of Unity's mesh shaders (exported from Unity): an opaque or cutout shader (RenderType Opaque / TransparentCutout: the legacy Diffuse and Transparent/Cutout/*, Unlit/Texture, Mobile/Diffuse, Standard's Opaque and Cutout modes) is an opaque surface that writes depth, draws before the transparent systems, clips at its `_Cutoff` and culls its back faces, and a lit one (Diffuse, Specular, Standard) is lit by quarks' Lambert mesh lighting, which matches Unity's legacy Diffuse under the same light and ambient (measured in Unity 6); not yet: quarks lights mesh particles only, where Unity lights a lit shader's billboards too; an opaque surface still discards its fragments of alpha 0, which Unity draws; and a transparent mesh shader without `_Cull` (Transparent/Diffuse, Standard's Fade) draws both faces where Unity culls the back ones
- ✅ particle colour on or off (`particleColor`: off, a particle draws in its texture and material colour alone, alpha included, as Unity's mesh shaders (Legacy Diffuse and its family, Mobile, Unlit, Standard) draw one, measured in Unity 6; exported from Unity)
- ✅ mesh vertex colours (`instancingColors`: the particle colour times the mesh's vertex colours, which Unity takes as they are while it converts the particle colour into a Linear project's space; measured in Unity 6; exported from Unity)
- ✅ material colour (`materialColor` and `materialColorScale`: the material's Color / Tint Color, the legacy shaders' doubling a scale of 2 in linear space)
- ✅ a mesh particle's scale: the emitter's scale applied after the particle's rotation, along the render alignment's axes (Local: the emitter's world matrix, skew and all; World and View: `lossyScale` along the world's or the camera's axes), measured in Unity 6; a world-space system's meshes take the scale at birth, inside their rotation
- 🟡 render alignment (`renderAlignment`: view / world / local, mesh particles and billboards, a `'world'` / `'local'` billboard lying in those axes' XY plane as Unity's, measured in Unity 6; exported from Unity); Facing and Velocity alignments not yet, nor a billboard's 3D rotation (Unity turns an aligned or camera-facing billboard by all three axes of a 3D start rotation; quarks by Z); Unity scales a `'local'` billboard by the emitter's scale along the world axes, quarks along the emitter's, which differs only for an emitter scaled unevenly and turned; a negative scale mirrors a mesh that turns with the emitter as Unity's (by the world scale in Hierarchy, the node's own in Local, never in Shape; measured in Unity 6), but not yet a billboard, which Unity mirrors too, nor a view- or world-aligned mesh
- ✅ the scene's image processing (`applyImageProcessing`, on by default as on Babylon's own materials); under it every colour comes into linear space on its own as in Unity's Linear colour space, with the exact sRGB curve when the engine's `useExactSrgbConversions` is on, and sRGB textures (`gammaSpace` false, `colorSpace: 'srgb'` in the effect file) are decoded and filtered in linear space
- ✅ sort mode (`sortMode`: distance / oldest in front / youngest in front), min/max particle size (`minParticleSize` / `maxParticleSize`, billboards and stretched), pivot (`pivot`)
- ✅ renderer order: every transparent system sorts back to front by the centre of its bounds plus its Sorting Fudge, as Unity's renderers do, and a batch draws once per run of its systems that come one after another, so systems of different batches interleave by depth; where Unity ties (systems at the same place) and picks by internal ids, the system whose meshes are drawn farther goes first
- ✅ Sorting Fudge (`sortingFudge`: added to the distance transparent systems sort by, as Unity adds it)
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
9. ~~Cone tilt and volume, Scaling Mode, Random Between Two Curves, Limit Velocity separate axes, Stop Action, Ring Buffer~~ (done in 0.29)
10. After 1.0, in minors: collision triggers and collider shapes → Limit Velocity drag → noise quality → texture-based emission → lights and custom data
