# Mesh particles: unlit / scene lighting instead of a hard-coded light

**Kind:** feature · **Package:** `babylon.quarks` · **Version:** 0.21.0 (`0a3331c`)

**Status:** implemented in `d4ac371` — `ParticleSystem.lighting: 'fixed' | 'unlit' | 'scene'` (default `'fixed'`, JSON: `lighting` on the QuarksMaterial), `BatchedRenderer.setMeshLighting({direction, color, ambient})`, `MESH_UNLIT` define, editor Renderer module. Test: `packages/babylon.quarks/test/meshLighting.test.ts`.

## Summary

Mesh particles (`RenderMode.Mesh`) are lit by a light fixed in `SpriteBatch`:

```ts
// packages/babylon.quarks/src/SpriteBatch.ts
mat.setVector3('lightDirection', new BVector3(0.4, -1, 0.6));
mat.setVector3('lightColor', new BVector3(1, 1, 1));
mat.setVector3('ambientColor', new BVector3(0.35, 0.35, 0.35));
```

and the fragment shader multiplies the texture by `ambientColor + lightColor * NdotL`. There is
no way to change it or to switch it off. Two common cases suffer:

- **Emissive meshes** — a comet of fire, a glowing blade, an energy shell. Their far side drops
  to 35 % and reads as a solid object in shadow. Making them additive hides it, at the cost of
  never being able to draw them alpha-blended.
- **Solid meshes in a lit scene** — rocks, arrows, ice shards — are lit from a direction and in a
  colour that have nothing to do with the scene's lights, so they stand apart from the meshes
  around them (in our case figures under warm tavern lamps).

## Proposal

1. A per-material switch, carried in the effect JSON and the editor:
   `QuarksMaterial.lighting: 'unlit' | 'fixed' | 'scene'` (default `fixed`, today's behaviour).
   `unlit` drops the `NdotL` term (`MESH_UNLIT` define); the batch key already separates
   materials, so no batching change.
2. Renderer-level settings for `fixed`:
   `BatchedRenderer.setMeshLighting({direction, color, ambient})`, applied to every mesh batch
   (and to batches created later).
3. Optionally `scene`: take the first enabled `DirectionalLight` / `HemisphericLight` of the
   scene each frame (direction, diffuse × intensity, `scene.ambientColor`), so mesh particles
   follow the scene's key light without wiring.

## Notes

Mesh batches already disable back-face culling, so double-sided effect geometry needs no extra
work; only the lighting term is missing a switch.
