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
loads the node disabled. `children` holds its child nodes.

| `type` | Reads | Writes |
| --- | --- | --- |
| `Group` (and three.js object types) | a `TransformNode` | any other node |
| `ParticleEmitter` | `ps`: a particle system (`ParticleSystem.toJSON`) | a `ParticleEmitter` |
| `Mesh` | `geometry` and `material` uuids | a `Mesh`: its positions, indices, uvs, uvs2 and normals |
| `QuarksPrefab` | `animationData`, `timeScale` | a `QuarksPrefab` |

Links between nodes use the target's `uuid`: a sub emitter's `subParticleSystem`, a mesh surface
shape's `mesh` and a prefab animation's `targetUUID`. `quarksNodeId(node)` gives the id a node is
written under: the uuid it was loaded with, or one given once to a node made in code. A loaded
effect saved again writes the same ids.

A mesh node's material is written only for a `StandardMaterial`, and only what the loader rebuilds:
`alphaMode`, `side` (0 culls back faces, 2 draws both), `alphaTest`, `depthWrite` and the diffuse
texture as `map`.

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

## Reading bad or partial files

- A document with no `object` throws `QuarksFormatError`.
- A part the loader cannot read warns and takes its default, and the rest of the effect loads:
  - an unknown emitter shape: a point emitter;
  - an unknown behavior: skipped;
  - an unknown curve or colour type: 0, white, a random rotation or a zero vector;
  - a setting left out (a system's `startLife`, a behavior's `bounce`): the constructor's default.
- A sub emitter or mesh surface shape whose target is not in the effect warns and emits nothing.

`loadFromJSON` and `loadFromJSONAll` leave the document they are given as it was, so one document
can be loaded many times. `resolveResources` and `QuarksLoader.resolveLinkedResources` rewrite
their document in place.
