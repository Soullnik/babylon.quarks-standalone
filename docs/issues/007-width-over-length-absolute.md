# `WidthOverLength` writes the curve as the trail's width, ignoring the particle's size

**Kind:** bug · **Package:** `quarks.core` (`WidthOverLength`) · **Version:** 0.21.0 (`0a3331c`)

**Status:** fixed in `6c0d094` — the curve multiplies each sample's recorded size (`TrailParticle.historyBaseSizes`) and the head gets `curve(0)`. New `absolute` flag (constructor arg / JSON field) keeps the old reading; JSON without the field loads as `absolute: true`, so existing effects are unchanged, while `new WidthOverLength(curve)` in code gets the new behaviour. Test: `packages/babylon.quarks/test/widthOverLength.test.ts`.

## Summary

`WidthOverLength` overwrites every recorded sample's width with the curve's value itself, not
the curve times the particle's size. The newest sample keeps `particle.size.x` (it is written
after the behaviour runs), so a trail with `startSize: 0.1` and a curve from 1 to 0 is ten times
wider than its particle along its body and snaps back to 0.1 at the head: a wedge flaring out
behind the head instead of a strip tapering away from it. Unity's "Width over Trail" is a
multiplier on the trail's width; the gallery's own trails only look right because their curves
happen to be in the scene's units.

## Reproduction

```ts
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, TrailParticle, Vector4, WidthOverLength} from 'quarks.core';
import {ParticleSystem} from '../src/ParticleSystem';
import {RenderMode} from '../src/VFXBatch';

test('WidthOverLength scales the particle size', () => {
    const scene = new Scene(new NullEngine());
    const system = new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        worldSpace: true,
        startLife: new ConstantValue(5),
        startSpeed: new ConstantValue(1),
        startSize: new ConstantValue(0.1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionOverDistance: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), probability: 1, interval: 0.01, cycle: 1}],
        shape: new PointEmitter(),
        renderMode: RenderMode.Trail,
        rendererEmitterSettings: {startLength: new ConstantValue(20), followLocalOrigin: false},
    });
    system.addBehavior(new WidthOverLength(new ConstantValue(1) as never));
    system.play();
    for (let t = 0; t < 0.2; t += 1 / 60) system.update(1 / 60);
    const trail = system.particles[0] as TrailParticle;
    for (let i = 0; i < trail.historyCount; i++) {
        expect(trail.historySizes[trail.getHistoryIndex(i)]).toBeCloseTo(0.1);
    }
});
```

**Expected:** every sample 0.1 (size × curve 1).
**Actual:** `sizes [1,1,1,1,1,1,1,1,1,1,1,1,0.1]`.

## Cause

`packages/quarks.core/src/behaviors/WidthOverLength.ts`:

```ts
sizes[slot] = this.width.genValue(memory, (count - i) * invLength);
```

and `TrailParticle.update` (`Particle.ts`) records the new head as `this.size.x` after it.

## Suggested fix

Multiply by the size the sample was recorded with (or by `particle.size.x`, the trail's width):
`sizes[slot] = recordedSize[slot] * this.width.genValue(...)` — keeping the recorded size in its
own buffer so the factor is not compounded every step — and apply the same factor to the head
sample, so the strip has no step at the tip. This changes how existing effects with absolute
curves look; a `JSON` version bump or a one-time migration (divide the curve by the start size)
would keep authored effects as they were.

## Workaround (Greedbound)

The ribbon's curve is written in cells (`width × 1.15 … width × 0.06`), so it is right however
the library ends up reading it today.
