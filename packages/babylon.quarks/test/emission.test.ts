import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Bezier, ConstantValue, Gradient, PiecewiseBezier, PointEmitter, Vector3} from 'quarks.core';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';

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

function system(parameters: Partial<ParticleSystemParameters> = {}): ParticleSystem {
    return new ParticleSystem({
        scene,
        looping: false,
        duration: 1,
        startLife: new ConstantValue(100),
        startSpeed: new ConstantValue(0),
        emissionOverTime: new ConstantValue(0),
        shape: new PointEmitter(),
        ...parameters,
    });
}

/** Moves the emitter `metres` along x over `frames` steps of 1/60 s. */
function travel(ps: ParticleSystem, metres: number, frames: number): void {
    const from = ps.emitter.position.x;
    for (let i = 1; i <= frames; i++) {
        ps.emitter.position.x = from + (metres * i) / frames;
        ps.emitter.computeWorldMatrix(true);
        ps.update(1 / 60);
    }
}

describe('emission over distance', () => {
    it('spawns one particle per metre moved', () => {
        const ps = system({worldSpace: true, emissionOverDistance: new ConstantValue(1), duration: 10});
        // The first step only records where the emitter is.
        ps.update(1 / 60);
        travel(ps, 12, 30);
        expect(ps.particleNum).toBe(12);
        ps.dispose();
    });

    it('forgets the distance covered while the rate was 0', () => {
        // Looping, so a system with nothing to emit yet does not count as finished.
        const ps = system({worldSpace: true, emissionOverDistance: new ConstantValue(0), looping: true});
        ps.update(1 / 60);
        travel(ps, 59, 30);
        expect(ps.particleNum).toBe(0);
        ps.emissionOverDistance = new ConstantValue(1);
        travel(ps, 2, 6);
        // Only the 2 m since the rate came on, not the 59 m before.
        expect(ps.particleNum).toBeLessThanOrEqual(2);
        expect(ps.particleNum).toBeGreaterThanOrEqual(1);
        ps.dispose();
    });
});

describe('start values over the cycle', () => {
    it('samples the start colour at the normalised time of the cycle', () => {
        const ps = system({
            duration: 4,
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 2, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
            startColor: new Gradient(
                [
                    [new Vector3(0, 0, 0), 0],
                    [new Vector3(1, 1, 1), 1],
                ],
                [
                    [1, 0],
                    [1, 1],
                ]
            ),
        });
        // A burst fires on the step after its time is reached.
        for (let i = 0; i < 2 * 60 + 2; i++) ps.update(1 / 60);
        expect(ps.particleNum).toBe(1);
        // Born at 2 s of a 4 s cycle: half way up the gradient, not at 2 on a 0..1 ramp.
        expect(ps.particles[0].startColor.x).toBeCloseTo(0.5, 1);
        ps.dispose();
    });

    it('samples a burst count curve at the normalised time of the cycle', () => {
        const ps = system({
            duration: 10,
            emissionBursts: [
                {
                    time: 5,
                    count: new PiecewiseBezier([[new Bezier(0, 10 / 3, 20 / 3, 10), 0]]),
                    cycle: 1,
                    interval: 0,
                    probability: 1,
                },
            ],
        });
        for (let i = 0; i < 5 * 60 + 2; i++) ps.update(1 / 60);
        // A 0 to 10 ramp over the cycle, read just past 5 s of 10: about 5, not the curve's end.
        expect(ps.particleNum).toBeGreaterThanOrEqual(5);
        expect(ps.particleNum).toBeLessThanOrEqual(6);
        ps.dispose();
    });
});
