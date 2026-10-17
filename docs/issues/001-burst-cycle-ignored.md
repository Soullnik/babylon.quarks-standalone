# Burst `cycle` / `interval` are ignored at runtime

**Kind:** bug · **Package:** `babylon.quarks` · **Version:** 0.21.0 (`0a3331c`)

## Summary

A burst with `cycle: N` and `interval: t` fires once. `cycle` and `interval` are parsed,
serialised and carried by `clone()`, but the emission loop never reads them, so every burst
is a single wave. `docs/SHURIKEN_PARITY.md` lists "burst cycles/interval/probability" as
shipped (✅), and Unity-exported effects that rely on repeated bursts (a slash smeared three
times, a stutter of sparks) silently lose all waves but the first.

## Reproduction

```ts
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {ParticleSystem} from '../src/ParticleSystem';

test('a burst fires `cycle` waves, `interval` apart', () => {
    const scene = new Scene(new NullEngine());
    const system = new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        startLife: new ConstantValue(5),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionOverDistance: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(5), probability: 1, interval: 0.1, cycle: 3}],
        shape: new PointEmitter(),
    });
    system.play();
    for (let t = 0; t < 0.5; t += 1 / 60) system.update(1 / 60);
    expect(system.particleNum).toBe(15);
});
```

**Expected:** 15 particles (three waves of 5 at t = 0, 0.1, 0.2).
**Actual:** `particles after 0.5 s = 5`.

## Cause

`ParticleSystem.emit` (`packages/babylon.quarks/src/ParticleSystem.ts`, the burst `while`
loop) advances `emissionState.burstIndex` after spawning one wave:

```ts
while (burstIndex < emissionBurstCount && emissionBursts[burstIndex].time <= emissionState.time) {
    const burst = emissionBursts[burstIndex];
    if (Math.random() < burst.probability) { /* spawn burst.count once */ }
    emissionState.burstIndex++;
}
```

`EmissionState.burstWaveIndex` exists (it is reset in `restart()` and created in the
constructor) but nothing reads or advances it.

## Suggested fix

Track waves per burst with `burstWaveIndex`: fire wave `w` when
`emissionState.time >= burst.time + w * burst.interval`, and move to the next burst only once
`w === burst.cycle`, rolling `probability` per wave. Worth deciding against Unity what happens to
waves that fall past `duration` on a non-looping system, and on a looping one whether waves
restart each loop. A test like the one above belongs next to `burstOneShotEffectFinished.test.ts`.

## Workaround (Greedbound)

The brick importer expands a repeat into separate bursts at `time + i * interval`, each with
`cycle: 1`.
