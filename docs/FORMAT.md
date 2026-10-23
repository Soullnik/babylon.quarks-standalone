# Effect file format

`serializeEffect(root)` writes an effect and `QuarksLoader` reads it. The document is JSON in the
three.js object layout the format grew from, with quarks' own entries inside it.

```jsonc
{
  "metadata": {"version": 4.5, "type": "Object3D", "generator": "babylon.quarks", "quarksFormat": 1},
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

- A file **without** `quarksFormat` was written before the field existed (babylon.quarks 0.27 and
  earlier, three.quarks, the Unity exporter). The loader reads it.
- A file with an **older** version loads. The readers keep accepting every older form: a burst's
  `cycleCount`, a numeric burst `count` or `startTileIndex`, a Gradient's `functions`, a texture
  sequencer's `{x, y, z}` position, `map` for `texture` on a material, `uv1`/`uv2` attributes.
- A file with a **newer** version loads with a warning. Settings this version does not know are
  left out.

| Version | Release | Change |
| --- | --- | --- |
| 1 | 0.28 | First numbered version. `serializeEffect` writes whole documents. |

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
| `QuarksPrefab` | `animationData`, `timeScale` | a `QuarksPrefab` |

A particle system (`ps`) writes each setting only when it differs from the default its constructor
gives a system that leaves the setting out, and a missing field reads as that default. Its shape, its start
and emission curves (`startLife`, `startSpeed`, `startRotation`, `startSize`, `startColor`,
`emissionOverTime`, `emissionOverDistance`, `startTileIndex`), `instancingGeometry`, `material` and
`behaviors` are always written, because loaders from 0.27 and earlier, and three.quarks, fail on a
file without them. A curve written as a bare number reads as a constant; a flag written as a number
reads as true unless it is 0. Files that write every setting, as earlier
releases did, still load.

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
`fx/`), and the loader joins the base again on the next load. To save a file next to the one it was
loaded from, pass `imageUrl` to write each image's url relative to it.

## Reading bad or partial files

- A document with no `object` throws `QuarksFormatError`.
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
