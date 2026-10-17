# A sub-emitter whose target uuid is missing crashes every frame

**Kind:** bug · **Packages:** `quarks.core` (`EmitSubParticleSystem`), `babylon.quarks` (`QuarksLoader`)
· **Version:** 0.21.0 (`0a3331c`)

## Summary

When an `EmitSubParticleSystem` behaviour names a sub-system uuid that is not in the file — an
export that dropped the target emitter, or a tool that keeps only some emitters of a prefab —
`QuarksLoader.linkReferences` leaves the uuid **string** in `subParticleSystem`. The behaviour
treats any truthy value as a resolved emitter, queues sub-emissions, and on the next
`frameUpdate` reads `.system.duration` of a string: a `TypeError` every frame, which takes the
whole batched renderer's update down with it.

## Reproduction

```ts
import {EmitSubParticleSystem, SubParticleEmitMode} from 'quarks.core';

test('a dangling sub-emitter reference is skipped, not thrown on', () => {
    const scene = new Scene(new NullEngine());
    const system = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new ConstantValue(0.1),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(20),
        emissionOverDistance: new ConstantValue(0),
        emissionBursts: [],
        shape: new PointEmitter(),
    });
    // What QuarksLoader leaves when the uuid names no node in the file.
    system.addBehavior(
        new EmitSubParticleSystem(system, false, 'no-such-uuid' as never, SubParticleEmitMode.Death, 1)
    );
    system.play();
    expect(() => {
        for (let t = 0; t < 0.5; t += 1 / 60) system.update(1 / 60);
    }).not.toThrow();
});
```

**Expected:** no error; the behaviour does nothing (and the loader warns once).
**Actual:** `TypeError: Cannot read properties of undefined (reading 'duration')`.

## Cause

- `QuarksLoader.linkReferences` (`packages/babylon.quarks/src/QuarksLoader.ts`) only replaces
  the string when `nodesMap[targetUUID]` exists; otherwise the string stays.
- `EmitSubParticleSystem.emit` / `frameUpdate` (`packages/quarks.core/src/behaviors/EmitSubParticleSystem.ts`)
  guard with `if (!this.subParticleSystem) return;`, which a string passes, then use
  `this.subParticleSystem.system`.

## Suggested fix

1. In `linkReferences`, set `subParticleSystem = undefined` when the uuid does not resolve, with
   a `console.warn` naming the emitter and the missing uuid.
2. In `EmitSubParticleSystem`, guard on the resolved shape (`this.subParticleSystem?.system`),
   so a bad value from any source is skipped rather than thrown on.

## Workaround (Greedbound)

The brick importer removes `EmitSubParticleSystem` behaviours whose target is not among the
emitters it keeps.
