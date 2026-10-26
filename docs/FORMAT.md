# Effect file format

`serializeEffect(root)` writes an effect and `QuarksLoader` reads it. The document is JSON in the
three.js object layout the format grew from, with quarks' own entries inside it.

```jsonc
{
  "metadata": {"version": 4.5, "type": "Object3D", "generator": "babylon.quarks", "quarksFormat": 3},
  "geometries": [],   // QuarksGeometry (inline arrays), BufferGeometry, PlaneGeometry, SphereGeometry
  "materials": [],    // QuarksMaterial for particle systems, MeshBasicMaterial for mesh nodes
  "textures": [],     // a texture: its image and sampler state
  "images": [],       // {uuid, url}: a file url, a root-relative path or a data: URI
  "object": {}        // the root node
}
```

## Versions

`metadata.quarksFormat` is the format version, `QUARKS_FORMAT_VERSION` in code. It goes up when a
release writes something an older loader would read wrongly, and the change is listed in the
changelog.

- A file **without** `quarksFormat` was written before the field existed (babylon.quarks before
  0.27, three.quarks, the Unity exporter). The loader reads it.
- A file with an **older** version loads, and means what it meant when it was written. As it is
  read, it goes through one upgrade step for each later version that changed what a file means
  (`formatMigrations.ts`), so a file of any version reaches today's meaning, as Unity upgrades an
  asset an older version wrote. Older ways of writing the same thing are accepted by the readers
  themselves, since a system's or a behavior's JSON can be read on its own: a burst's
  `cycleCount`, a numeric burst `count` or `startTileIndex`, a Gradient's `functions`, a texture
  sequencer's `{x, y, z}` position, `map` for `texture` on a material, `uv1`/`uv2` attributes.
- A file with a **newer** version loads with a warning. Settings this version does not know are
  left out.

| Version | Release | Change |
| --- | --- | --- |
| 1 | 0.27 | First numbered version. `serializeEffect` writes whole documents. |
| 2 | 0.29 | `scalingMode` defaults to `'local'` with Unity's meaning. A system in an older file reads as `'hierarchy'`, which keeps its look. |
| 3 | 1.0 | Nothing is written for three.quarks: no `ps.version`, and the start and emission curves and `behaviors` only when they differ from their defaults. A prefab's clip track is `'clip'`; an older file's `'three'` track reads as `'clip'`. babylon.quarks 0.30 reads these files as they are meant, after a newer-format warning; 0.29 also skips a prefab's clip tracks, and 0.28 reads Scaling Mode with its older meaning. |

What older writers produced is checked against real files in `packages/babylon.quarks/test/fixtures`:
effects written by three.quarks, by the Unity exporter, and by each published babylon.quarks from
0.27.0 on, one save of the same effects per release. Each must load and save to the format its
snapshot holds, and each release's save must load as the file it was written from.

## Schema

`packages/babylon.quarks/schema/effect.schema.json` is a JSON Schema (draft 2020-12) of the
files this release writes, shipped in the package as `babylon.quarks/schema/effect.schema.json`
and published at its `$id`,
<https://soullnik.github.io/babylon.quarks-standalone/schema/effect-3.schema.json>. A file can
name it in a top-level `$schema` for an editor's completion and checks; the loader ignores it.

The schema describes what a current writer produces, not everything the loader accepts: a file of
an older format, three.quarks' fields or an older way of writing a setting is valid to the loader
and not to the schema. Documents, nodes, systems, materials, textures and curves are closed, so a
misspelt setting is an error. Shapes and behaviors only need a `type`, since plugins add their
own. Every file saved by `serializeEffect`, the editor or the Unity exporter must validate; the
tests check the golden fixtures, the example effects and the exporter's golden output.

## Nodes

Every node has a `uuid`, a `type`, a `name` and a local `matrix` (column-major, as Babylon's
`Matrix.asArray()`; `position`, `quaternion`/`rotation` and `scale` are read too). `visible: false`
loads the node disabled, with everything under it. `isVisible: false` on a mesh loads it undrawn,
and leaves its children drawn, as a mesh surface shape's source that also parents emitters needs.
`children` holds its child nodes. The matrix is the node's position, rotation and scale; a pivot
matrix is not written.

| `type` | Reads | Writes |
| --- | --- | --- |
| `Group` (and three.js object types) | a `TransformNode` | any other node |
| `ParticleEmitter` | `ps`: a particle system (`ParticleSystem.toJSON`) | a `ParticleEmitter` |
| `Mesh` | `geometry` and `material` uuids | a `Mesh`: its positions, indices, uvs, uvs2 and normals; an unindexed mesh gets its vertices in order; clones share one geometry |
| `QuarksPrefab` | `animationData` (each track's `type` is `'ps'`, a particle system, or `'clip'`, a timeline clip; `'three'`, as three.quarks and babylon.quarks before 0.30 write a clip track, reads as `'clip'`), `timeScale` | a `QuarksPrefab` |

A particle system (`ps`) writes each setting only when it differs from the default its constructor
gives a system that leaves the setting out, and a missing field reads as that default. Its shape,
`instancingGeometry` and `material` are always written; `behaviors` only when there are any. A curve
written as a bare number reads as a constant; a flag written as a number reads as true unless it is
0. Files that write every setting, as earlier releases did, still load.

The shape and each behavior write their `type` and each field only when it differs from the default
the type reads a missing field as (`EmitterToJSON`, `BehaviorToJSON`); a field the type needs, such
as a behavior's curve, is always written. A shape's or behavior's own `toJSON()` still writes every
field.

Writing for three.quarks, and for babylon.quarks before 0.28, is not a goal of the format: they read
some fields without a default, and three.quarks skips a `'clip'` track, as babylon.quarks 0.29 does.
Reading their files is.

A system's blend mode is its material entry's `alphaMode`, which babylon.quarks always writes. A
material entry without one, as three.js writes, reads its three.js `blending`, and alpha blending
(`ALPHA_COMBINE`) when it has neither, as for a mesh node's material. A system with no material
entry reads its own `blendMode`, and additive (`ALPHA_ADD`) when it has none.

Links between nodes use the target's `uuid`: a sub emitter's `subParticleSystem`, a mesh surface
shape's `mesh` and a prefab animation's `targetUUID`. `quarksNodeId(node)` gives the id a node is
written under: the uuid it was loaded with, or one given once to a node made in code. A loaded
effect saved again writes the same ids. `serializeEffect` warns about a link to a node it does not
write, since it loads unresolved. An `InstancedMesh` is written as a group, with a warning.

A mesh node's material is written only for a `StandardMaterial`, and only what the loader rebuilds,
each field when it differs from the loader's default: `alphaMode` (default combine), `side` (default
2, both faces; 0 culls back faces), `alphaTest` (default 0), `depthWrite` (default false) and the
diffuse texture as `map`. Its alpha and colours are not written; `serializeEffect` warns when they
are not opaque white.

## Textures

| Field | Default | Babylon |
| --- | --- | --- |
| `image` | none: loads as no texture | `url` |
| `invertY` | `true` | `invertY` |
| `noMipmap` | `false` | `noMipmap` |
| `samplingMode` | trilinear | `samplingMode` |
| `wrap` | `[1000, 1000]` (repeat) | `wrapU`, `wrapV`; 1001 clamp, 1002 mirror |
| `repeat` | `[1, 1]` | `uScale`, `vScale` |
| `offset` | `[0, 0]` | `uOffset`, `vOffset` |
| `rotation` | `0` | `wAng` |

`serializeEffect` writes each field only when it differs from the default. A texture with no url a
file can point at (made in code, a `blob:` url, an image embedded in a glTF) is written without an
image and reported through `onWarning`; give it a file url or a `data:` URI before saving.

A texture loaded with a base url holds the joined url (`fx/tex/a.png` for `tex/a.png` loaded from
`fx/`), but `serializeEffect` writes the url the file had (`tex/a.png`, see `textureSourceUrl`), so a
file saved next to the one it was loaded from loads the same images. To save it elsewhere, pass
`imageUrl` to write each image's url relative to the new place. A texture whose image was inlined
by a resolver (`data:`), or whose `url` was changed after loading, writes its `url`; a texture
shared between effects (`shareResources`) keeps the url of the first effect that loaded it.

## Reading bad or partial files

- A document with no `object` throws `QuarksFormatError`.
- Each warning names the JSON path of the part it is about, such as
  `object.children[2].ps.behaviors[3]`. The loader's `onFormatWarning` option takes them instead of
  the console, and its `strict` option makes a load throw `QuarksFormatError` for them, after reading
  the whole effect and freeing what it built, for checks that a set of assets loads cleanly.
- A part the loader cannot read warns and takes its default, and the rest of the effect loads:
  - an unknown emitter shape: a point emitter;
  - an unknown behavior: skipped;
  - an unknown or missing sequencer in `ApplySequences`: skipped;
  - an unknown or missing curve or colour: 0, white, a random rotation or a zero vector. A burst
    without a `count` therefore emits nothing; a burst without an `interval` fires its waves 0.1 s
    apart, without a `probability` always, without a `cycle` once, and bursts are kept in time
    order;
  - a setting left out that has a default: that default. A system's curves and shape take the
    constructor's; a behavior's plain numbers and vectors take a fixed one where the constructor
    has none (`bounce` 1, `dampen` 1, a force's `direction` and `magnitude` 0, turbulence `scale`,
    `velocityMultiplier` and `timeScale` 1, a speed range of 0 to 1).
- A sub emitter or mesh surface shape whose target is not in the effect warns and emits nothing.

`loadFromJSON` and `loadFromJSONAll` leave the document they are given as it was, so one document
can be loaded many times. `resolveResources` and `QuarksLoader.resolveLinkedResources` rewrite
their document in place.

## Loading and freeing

A load resolves when the nodes are built; with the loader option `waitForTextures` it resolves once
every texture has loaded or failed. A geometry file or image that fails is reported through
`onResourceError` and the rest of the effect loads. Pass a `signal` to cancel a load: it rejects
with the signal's reason and leaves nothing of the effect in the scene.

Textures are shared per scene between effects that use the same image and sampler state. Disposing
a loaded effect's root (`QuarksLoader.disposeEffect(root)`, `root.dispose()`, or a parent's or the
scene's dispose) frees its nodes, the materials made for it and each texture once no other loaded
effect, or `QuarksUtil.instantiate` copy, still uses it. `EffectPool` copies work the same way.
