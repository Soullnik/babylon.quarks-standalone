import {
    ConstantColor,
    ConstantValue,
    IntervalValue,
    PointEmitter,
    SphereEmitter,
    Vector4,
} from 'quarks.core';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {QuarksUtil} from '../src/QuarksUtil';

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

/** Steps systems from t=0 without restart. */
function simulate(systems: ParticleSystem[], seconds: number): void {
    const step = 1 / 60;
    let t = 0;
    while (t + step <= seconds) {
        for (const system of systems) {
            system.update(step);
        }
        t += step;
    }
    const remainder = seconds - t;
    if (remainder > 0) {
        for (const system of systems) {
            system.update(remainder);
        }
    }
}

/**
 * Burst-only one-shot with a short-lived root splat and a longer droplet tail —
 * same emission pattern as exported blood explosion prefabs, built inline.
 */
function createBurstExplosionEffect(): {root: TransformNode; systems: ParticleSystem[]} {
    const root = new TransformNode('burstExplosion', scene);

    const splat = new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        startLife: new IntervalValue(0.25, 0.4),
        startSpeed: new ConstantValue(0.1),
        startSize: new IntervalValue(2, 2.6),
        startColor: new ConstantColor(new Vector4(0.44, 1, 0.39, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionOverDistance: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(3), probability: 1, interval: 0.01, cycle: 1}],
        shape: new SphereEmitter(),
    });
    splat.emitter.parent = root;
    splat.emitter.name = 'Splat';

    const droplets = new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        startLife: new IntervalValue(0.2, 0.6),
        startSpeed: new IntervalValue(4, 12),
        startSize: new IntervalValue(0.02, 0.1),
        startColor: new ConstantColor(new Vector4(0.44, 1, 0.39, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionOverDistance: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(45), probability: 1, interval: 0.01, cycle: 1}],
        shape: new SphereEmitter(),
    });
    droplets.emitter.parent = root;
    droplets.emitter.name = 'Droplets';

    return {root, systems: [splat, droplets]};
}

/** Single-burst billboard splat — shorter tail variant. */
function createSingleBurstSplat(): {root: TransformNode; systems: ParticleSystem[]} {
    const root = new TransformNode('singleBurstSplat', scene);
    const splat = new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        startLife: new ConstantValue(0.2),
        startSpeed: new ConstantValue(0.1),
        startSize: new ConstantValue(1.5),
        startColor: new ConstantColor(new Vector4(0.44, 1, 0.39, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionOverDistance: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), probability: 1, interval: 0.01, cycle: 1}],
        shape: new PointEmitter(),
    });
    splat.emitter.parent = root;
    splat.emitter.name = 'Splat';
    return {root, systems: [splat]};
}

describe('burst one-shot effect finished', () => {
    it('marks multi-emitter burst explosion finished once the tail dies', () => {
        const {root, systems} = createBurstExplosionEffect();
        const renderer = new BatchedRenderer('test', scene);
        for (const system of systems) {
            renderer.addSystem(system);
        }

        simulate(systems, 0.6);

        expect(QuarksUtil.isEffectFinished(root)).toBe(true);
        for (const system of systems) {
            expect(system.isFinished()).toBe(true);
            expect(system.particleNum).toBe(0);
        }

        renderer.refreshBatches();
        renderer.dispose();
    });

    it('marks a single-burst splat finished before duration elapses', () => {
        const {root, systems} = createSingleBurstSplat();
        simulate(systems, 0.6);

        expect(QuarksUtil.isEffectFinished(root)).toBe(true);
        expect(systems[0].isFinished()).toBe(true);
        expect(systems[0].particleNum).toBe(0);
        expect(systems[0].isEmitEnded).toBe(false);
    });
});
