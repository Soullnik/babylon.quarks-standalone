# Emission over distance spawns every particle at the emitter's current position

**Kind:** bug · **Package:** `babylon.quarks` · **Version:** 0.21.0 (`0a3331c`)

## Summary

`emissionOverDistance` counts correctly how many particles the emitter's travel this frame is
worth, but spawns all of them at the emitter's **current** position. On a fast emitter — a
projectile, a blade tip, anything that moves more than the particle spacing per frame — a trail
that should be continuous comes out as one clump per frame: a dotted line. Unity's
rate-over-distance spreads them along the path travelled.

## Reproduction

```ts
test('particles emitted over distance are spread along the path', () => {
    const scene = new Scene(new NullEngine());
    const system = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        worldSpace: true,
        startLife: new ConstantValue(5),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionOverDistance: new ConstantValue(10),
        emissionBursts: [],
        shape: new PointEmitter(),
    });
    system.play();
    system.update(1 / 60);
    // In one frame the emitter jumps a whole unit: ten particles' worth.
    system.emitter.position.x = 1;
    system.emitter.computeWorldMatrix(true);
    system.update(1 / 60);
    const xs = system.particles.slice(0, system.particleNum).map(p => p.position.x);
    expect(Math.min(...xs)).toBeLessThan(0.5);
});
```

**Expected:** x positions spread over (0, 1].
**Actual:** `spawned x = [1,1,1,1,1,1,1,1,1,1]`.

## Cause

In `ParticleSystem.emit` the distance step only adds to `waitEmiting`:

```ts
emissionState.travelDistance += previousWorldPos.distanceTo(this.temp);
const count = Math.floor(emissionState.travelDistance * emitPerMeter);
emissionState.travelDistance -= count / emitPerMeter;
emissionState.waitEmiting += count;
...
this.spawn(totalSpawn, emissionState, emitterMatrix);   // one matrix for all of them
```

`spawn` places every new particle through the same `emitterMatrix`.

## Suggested fix

Spawn the distance-driven particles separately from the time-driven ones, each at its point
along the segment `previousWorldPos → current`: particle `k` of `count` at
`lerp(previous, current, (k + 1 - carried) / (count))` (or by the exact metre marks, using the
carried remainder), and ideally with the emitter's rotation slerped the same way. Spawning them
with a matching fraction of the frame's age already elapsed (`age = (1 - f) * delta`) keeps the
trail's fade continuous too. The same applies to sub-emitters driven by distance.

## Workaround (Greedbound)

None in general. For a weapon swing (a 170 ms sweep, ~10 frames) the smear is a mesh crescent
riding the blade instead of a particle trail.
