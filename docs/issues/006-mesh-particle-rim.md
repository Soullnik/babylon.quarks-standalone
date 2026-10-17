# Mesh particles: a rim (Fresnel) term for outlines and glowing edges

**Kind:** feature · **Package:** `babylon.quarks` · **Version:** 0.21.0 (`0a3331c`)

## Summary

Stylised games draw volume effects with a bright or dark edge where the surface turns away from
the camera: a glowing rim on an energy shell or a shockwave sphere, a dark ink line round a toon
rock or crystal. On mesh particles today this can only be faked by baking it into the texture
per face, which breaks as soon as the mesh turns, or by giving up the mesh for a camera-facing
card with a ring texture (what we do for a shockwave sphere now).

## Proposal

An optional rim term in the mesh-particle shader, per material:

```ts
rim?: {
    color: [r, g, b];   // the edge colour
    power: number;      // falloff, pow(1 - |dot(N, V)|, power)
    strength: number;   // 0 … 1
    mode: 'add' | 'mix'; // 'add' — a glowing edge; 'mix' — an outline toward `color`
}
```

`N` and the view direction are already available in the mesh path (`vNormal`, `vWorldPos`,
`eyePosition` for the env-atlas reflection). Compiled in behind a define (`MESH_RIM`) only when
set, carried in the effect JSON and exposed in the editor's renderer module. Combined with
issue 004's `unlit` mode, this covers both an energy sphere that reads as a sphere (bright rim,
clear middle) and toon-shaded solid props (dark rim) without per-effect shaders.
