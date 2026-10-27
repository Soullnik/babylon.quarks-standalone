# Upgrading to 1.0

This guide takes a project from babylon.quarks 0.28 to 1.0, in one pass. Most of the work is in
code, and in TypeScript the compiler finds it. The rest is how effects look after 0.29 brought
their behaviour in line with Unity, and which runtimes can read the files you save.

From an older release, first follow the "Upgrading from" sections of the
[changelog](../packages/babylon.quarks/CHANGELOG.md) up to 0.28. Each release's changelog lists
everything in detail; this page gathers what a project has to do.

## 1. Versions

Upgrade the packages together. While 1.0 is a release candidate, install `babylon.quarks@next`
and `babylon.quarks-editor@next` instead.

```bash
npm install babylon.quarks@^1.0.0 @babylonjs/core@^9.24.0
npm install babylon.quarks-editor@^0.31.0 @babylonjs/materials@^9.24.0   # if you embed the editor
```

- **Babylon.js 9.24 or later.** 0.30 already needed it; 1.0's peer range now says so. Keep
  `@babylonjs/materials` on the same version as `@babylonjs/core`.
- **The editor stays on 0.x.** `babylon.quarks-editor` 0.31 goes with babylon.quarks 1.0. Its peer
  is the library's minor line, so upgrade the two together from now on.
- **The Unity exporter** takes the library's version. Export with the 1.0 exporter, which writes
  format 3; files from older exporters load as they are.

## 2. Math and colours (0.30)

quarks' own math (`Vector2`, `Vector3`, `Vector4`, `Quaternion`, `Matrix3`, `Matrix4`) is no
longer exported. The API takes Babylon's types, or any object of the same shape:

```ts
// Before
import {ConstantColor, Vector4} from 'babylon.quarks';
new ConstantColor(new Vector4(1, 0.5, 0, 1));

// After
import {Color3, Color4} from '@babylonjs/core/Maths/math';
import {ConstantColor, Gradient} from 'babylon.quarks';
new ConstantColor(new Color4(1, 0.5, 0, 1));
new Gradient([[new Color3(1, 1, 1), 0], [new Color3(1, 0, 0), 1]], [[1, 0], [0, 1]]);
```

- Import `Vector2`, `Vector3`, `Quaternion`, `Color3`, `Color4` and `Matrix` from
  `@babylonjs/core`.
- Colours are `{r, g, b, a}`: `ConstantColor`, `ColorRange`, `RandomColor` and
  `ParticleSystem.tint` take a `Color4`, and `Gradient` colour keys a `Color3`. Code that read a
  colour's `x` or `w` reads `r` or `a`.
- A colour read back, such as `ConstantColor.color`, has its fields as accessors: copy it field by
  field (`new Color4(c.r, c.g, c.b, c.a)`) rather than spreading it or passing it to
  `JSON.stringify`.
- `pivot`, `flip`, `ringBufferLoopRange` and `TrailSettings.sideAxis` read back as plain
  `{x, y, z}` objects, without vector methods.
- `getWorldBounds(min, max)` and `getBeamEnd(out)` fill any `{x, y, z}`, such as a Babylon
  `Vector3`.

Custom behaviors, shapes and generators still receive quarks' vectors in `initialize`, `update`
and `genValue`, as before. See [Extending babylon.quarks](EXTENDING.md).

## 3. Removed and renamed API (0.29 and 0.30)

| Before | Now |
| --- | --- |
| `autoDestroy: true` (parameter and property), `QuarksUtil.setAutoDestroy` | `stopAction: 'destroy'`, `QuarksUtil.setStopAction` |
| `speedFactor` constructor parameter | `rendererEmitterSettings.speedFactor` |
| `EulerGenerator.eular` | `euler` |
| `QuarksPrefab.addThreeAnimation`, track type `'three'` | `addClipAnimation`, `'clip'` |
| `MeshSettings.startRotationX/Y/Z` (never read) | the system's `startRotation`, an `EulerGenerator` |
| `TrailParticle.previous`, `RecordState` (no longer filled) | the trail's own history; nothing to read |
| `ParticleSystem.fromJSON(json, meta, scene, dependencies)` | `fromJSON(json, meta, scene)` |
| `toJSON(options)` | `toJSON()` |
| writing `particleNum`, `particles` or `emissionState` | read only; call `restart()` to clear a system |
| `PhysicsResolver.resolve`: `normal.set(x, y, z)` | write `normal.x`, `normal.y`, `normal.z` |
| editor: `importGallery` | `importAssets` |
| editor: `rgbaToVector4` | pass `{r, g, b, a}` |

Files keep loading: a file's `autoDestroy: true`, top-level `speedFactor` and `'three'` track are
still read. In code they are not: in JavaScript, where no compiler points at them, an
`autoDestroy` or `speedFactor` passed to the constructor is now ignored. Search your code for
`autoDestroy`, `speedFactor`, `eular`, `addThreeAnimation`, `importGallery` and `Vector4`.

Two type changes need a guard where you read the value:

- `LimitSpeedOverLife.speed` can be a `Vector3Function` (Separate Axes). Narrow it before calling
  `genValue`: `if (!(speed instanceof Vector3Function)) speed.genValue(memory, t)`.
- A custom behavior that reads `emitter.matrixWorld` gets the matrix with the Scaling Mode's
  scale.

## 4. Custom behaviors (0.30)

Built-in behaviors run as compiled passes, recognised by their class. A subclass of a built-in,
or a custom behavior whose `type` names a built-in, now always runs its own methods: it is called
as you wrote it, and can be slower than the built-in. A subclass that overrides `update` has it
called. Give a custom behavior its own `type`, prefixed so a later built-in cannot take it
(`'my.Drag'`), and register it as [Extending babylon.quarks](EXTENDING.md) shows so files can
store it.

## 5. How effects look (0.29)

0.29 made the remaining differences from Unity behave like Unity, before the look of effects was
frozen. An effect in a scene without image processing, at scale 1 and without cones looks as it
did. Otherwise, check these:

- **Image processing:** particles take the scene's image processing (tone mapping, exposure,
  contrast, vignette, grading), as Babylon's own materials do. That includes what
  `createDefaultEnvironment()` and `DefaultRenderingPipeline` set up. Re-tune colours that were
  authored without it, or set `applyImageProcessing: false` on a system to keep the old look.
- **Scaling Mode** works as Unity's and defaults to `'local'`: only the emitter's own `scaling`
  reaches the effect. Set `scalingMode: 'hierarchy'` where a parent's scale should reach it.
  `'shape'` now scales only the emission shape, no longer the particles' size. Files saved before
  0.29 read as `'hierarchy'` and keep their look, with three exceptions that apply to code too:
  a world-space system's speed now scales with the emitter, negative scales mirror the start
  velocity as well as the position, and a sub emission's speed takes its parent particle's frame.
- **Cones** tilt particles between the centre and the rim by `atan(r · tan(angle))`, as Unity
  does, so they lean out more than before. Re-tune an effect that relied on the narrower middle.
- **Smaller fixes you may see:** the changelog's **Fixed** sections for 0.29, 0.30 and 1.0 list
  them. For example, a Death sub emitter now emits for particles that die on a non-looping
  system's last step, `ApplySequences` lands each particle on its point when a move ends, and
  Color by Speed blends a stepped key over 1/256 of its speed range.

## 6. Effect files (1.0)

- **Loading:** files from every earlier release, from three.quarks and from the Unity exporter
  load as they are. Each is upgraded as it is read, keeping what it meant when it was written.
- **Saving:** 1.0 writes format 3. Hand those files to babylon.quarks 1.0 or later. 0.30 reads
  them after a warning. 0.29 skips a prefab's clip tracks, 0.28 reads Scaling Mode with its old
  meaning, and three.quarks and 0.27 or earlier do not read them.
- **Schema:** for completion and checks in your editor, name the format's schema in a file's
  `$schema`: `https://soullnik.github.io/babylon.quarks-standalone/schema/effect-3.schema.json`.
  The package ships the same schema as `babylon.quarks/schema/effect.schema.json`. See
  [FORMAT.md](FORMAT.md).

## 7. Check

- `tsc` compiles, with no imports of math from `babylon.quarks`.
- Your effects load without warnings in the console.
- Effects in scenes with image processing, scaled parents or cones look as you want them.
- Saved files are format 3 (`metadata.quarksFormat: 3`), and every runtime that reads them is 1.0
  or later.

What 1.x promises from here on, for the API, the files and the look, is in
[STABILITY.md](../STABILITY.md).
