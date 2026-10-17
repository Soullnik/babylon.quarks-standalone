# Issues found while building Greedbound's battle VFX

Reported against `babylon.quarks` **0.21.0** (repository at `0a3331c`), `@babylonjs/core` 9.11.0.
Each bug was reproduced with a jest test in `packages/babylon.quarks/test` (code included in
the issue) before it was written down; the output quoted is that test's.

| #   | Kind    | Title                                                                      | Package       | Status |
| --- | ------- | -------------------------------------------------------------------------- | ------------- | ------ |
| 001 | bug     | [Burst `cycle` / `interval` are ignored at runtime](001-burst-cycle-ignored.md) | babylon.quarks | fixed `1213255` |
| 002 | bug     | [Emission over distance spawns every particle at the emitter's current position](002-emission-over-distance-clumps.md) | babylon.quarks | fixed `dba1626` |
| 003 | bug     | [A sub-emitter whose target uuid is missing crashes every frame](003-dangling-sub-emitter-crash.md) | quarks.core + loader | fixed `9eff806` |
| 004 | feature | [Mesh particles: unlit / scene lighting instead of a hard-coded light](004-mesh-particle-lighting.md) | babylon.quarks | done `d4ac371` |
| 005 | DX      | [`RotationOverLife` is silently ignored on mesh particles](005-rotation-over-life-on-mesh.md) | quarks.core + loader | fixed `dd7badb` |
| 006 | feature | [Mesh particles: a rim (Fresnel) term for outlines and glowing edges](006-mesh-particle-rim.md) | babylon.quarks | done `fe0a523` |
| 007 | bug     | [`WidthOverLength` writes the curve as the trail's width, ignoring the particle's size](007-width-over-length-absolute.md) | quarks.core | fixed `6c0d094` (behaviour change) |

Things checked and **not** reported, because the library already covers them:

- Removing a system's particles at once (a projectile's body vanishing on impact): `ParticleSystem.stop()` (restart + pause) does it.
- Spinning a mesh particle about a chosen axis: `Rotation3DOverLife` with an `AxisAngle` generator.
- `TransformNode.lookAt` writing Euler `rotation` while `rotationQuaternion` is null is Babylon's documented behaviour, not a Quarks concern.
