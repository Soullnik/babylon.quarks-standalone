import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BurstParameters, ParticleSystem} from '../src/ParticleSystem';

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
});

afterAll(() => {
    scene.dispose();
    engine.dispose();
});

function burstSystem(bursts: Array<BurstParameters>, options: {duration?: number; looping?: boolean} = {}) {
    return new ParticleSystem({
        scene,
        duration: options.duration ?? 1,
        looping: options.looping ?? false,
        startLife: new ConstantValue(5),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionOverDistance: new ConstantValue(0),
        emissionBursts: bursts,
        shape: new PointEmitter(),
    });
}

function run(system: ParticleSystem, seconds: number): void {
    for (let t = 0; t < seconds; t += 1 / 60) system.update(1 / 60);
}

describe('burst cycle / interval', () => {
    it('fires `cycle` waves, `interval` apart', () => {
        const system = burstSystem([{time: 0, count: new ConstantValue(5), probability: 1, interval: 0.1, cycle: 3}]);
        system.play();
        run(system, 0.5);
        expect(system.particleNum).toBe(15);
    });

    it('spaces the waves by `interval`', () => {
        const system = burstSystem([{time: 0, count: new ConstantValue(5), probability: 1, interval: 0.1, cycle: 3}]);
        system.play();
        run(system, 0.05);
        expect(system.particleNum).toBe(5);
        run(system, 0.1);
        expect(system.particleNum).toBe(10);
    });

    it('does not hold a later burst back behind an earlier one still repeating', () => {
        const system = burstSystem([
            {time: 0, count: new ConstantValue(1), probability: 1, interval: 0.2, cycle: 3},
            {time: 0.1, count: new ConstantValue(10), probability: 1, interval: 0.1, cycle: 1},
        ]);
        system.play();
        run(system, 0.15);
        // Wave 0 of the first burst and the whole second burst; the first
        // burst's next wave is due at 0.2.
        expect(system.particleNum).toBe(11);
    });

    it('drops waves that fall past the duration', () => {
        const system = burstSystem([{time: 0, count: new ConstantValue(1), probability: 1, interval: 0.4, cycle: 5}], {
            duration: 1,
        });
        system.play();
        run(system, 3);
        // Waves at 0, 0.4 and 0.8; the ones at 1.2 and 1.6 are past the end.
        expect(system.particleNum).toBe(3);
    });

    it('treats a cycle below one as a single wave', () => {
        const system = burstSystem([{time: 0, count: new ConstantValue(4), probability: 1, interval: 0.1, cycle: 0}]);
        system.play();
        run(system, 0.5);
        expect(system.particleNum).toBe(4);
    });

    it('fires every wave at once when the interval is zero', () => {
        const system = burstSystem([{time: 0, count: new ConstantValue(2), probability: 1, interval: 0, cycle: 3}]);
        system.play();
        system.update(1 / 60);
        expect(system.particleNum).toBe(6);
    });

    it('rolls the probability per wave', () => {
        // Rolled once per burst, every system would get all three waves or
        // none (and with the cycle ignored, one or none); rolled per wave,
        // some get exactly two. Counted over many
        // systems rather than by mocking Math.random, which other code (the
        // source-map support behind stack traces) also calls.
        const counts = new Set<number>();
        for (let i = 0; i < 200; i++) {
            const system = burstSystem([
                {time: 0, count: new ConstantValue(1), probability: 0.5, interval: 0.1, cycle: 3},
            ]);
            system.play();
            run(system, 0.5);
            counts.add(system.particleNum);
            system.dispose();
        }
        expect(counts.has(2)).toBe(true);
        for (const count of counts) expect(count).toBeLessThanOrEqual(3);
    });

    it('restarts the waves every loop of a looping system', () => {
        const system = burstSystem([{time: 0, count: new ConstantValue(1), probability: 1, interval: 0.1, cycle: 2}], {
            duration: 0.5,
            looping: true,
        });
        system.play();
        run(system, 1.2);
        // Three loops started (t = 0, 0.5, 1.0), two waves each.
        expect(system.particleNum).toBe(6);
    });

    it('keeps a one-shot system pending until its last wave has fired', () => {
        const system = burstSystem([{time: 0, count: new ConstantValue(1), probability: 1, interval: 0.3, cycle: 2}], {
            duration: 1,
        });
        system.startLife = new ConstantValue(0.1);
        system.play();
        run(system, 0.2);
        // The first wave's particle is gone, the second wave has not fired yet.
        expect(system.particleNum).toBe(0);
        expect(system.isFinished()).toBe(false);
        run(system, 0.12);
        expect(system.particleNum).toBe(1);
    });

    it('starts over on restart', () => {
        const system = burstSystem([{time: 0, count: new ConstantValue(2), probability: 1, interval: 0.1, cycle: 2}]);
        system.play();
        run(system, 0.3);
        expect(system.particleNum).toBe(4);
        system.restart();
        run(system, 0.3);
        expect(system.particleNum).toBe(4);
    });
});
