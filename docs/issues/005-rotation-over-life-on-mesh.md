# `RotationOverLife` is silently ignored on mesh particles

**Kind:** developer experience · **Packages:** `quarks.core`, `babylon.quarks` (`QuarksLoader`)
· **Version:** 0.21.0 (`0a3331c`)

**Status:** fixed in `dd7badb` (proposal 2) — `RotationOverLife` turns quaternion rotations about the particle's local Z, in update, updateAll and the fused pass; no load-time warning needed. Tests: `packages/quarks.core/test/behaviors/RotationOverLife.test.ts`, `packages/babylon.quarks/test/meshRotationOverLife.test.ts`.

## Summary

`RotationOverLife` only turns particles whose `rotation` is a number (billboards):

```ts
// packages/quarks.core/src/behaviors/RotationOverLife.ts
update(particle, delta) {
    if (typeof particle.rotation === 'number') { ... }
}
```

On a mesh particle (`rotation` is a `Quaternion`) it does nothing, with no warning. A
hand-written or tool-generated mesh effect that spins with `RotationOverLife` — the natural first
guess, and what Unity's "Rotation over Lifetime" maps to for most effects — simply does not spin,
and nothing says why. `Rotation3DOverLife` with an `AxisAngle` generator is the right behaviour,
but nothing points there.

## Proposal (any of)

1. **Warn once** in `QuarksLoader` (and in the editor) when a system with `renderMode: Mesh`
   carries `RotationOverLife`: "has no effect on mesh particles; use Rotation3DOverLife".
2. **Make it work**: for quaternion rotations, apply the angular velocity about the particle's
   local Z (the mesh's forward/up by convention, matching Unity's Z-only mode), via
   `quat.multiply(axisAngle(Z, rate * delta))`.
3. At least a note in the `RotationOverLife` doc comment and in the parity checklist.

Option 2 matches Unity's behaviour for a non-separate-axes Rotation over Lifetime on mesh
particles and keeps imported effects working.
