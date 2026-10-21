import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Bezier, ConstantColor, ConstantValue, IntervalValue, PiecewiseBezier, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';

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

const STEP = 1 / 60;

function system(parameters: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}): ParticleSystem {
    return new ParticleSystem({
        scene,
        duration: 5,
        looping: true,
        worldSpace: true,
        seed: 7,
        startLife: new ConstantValue(10),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [],
        shape: new PointEmitter(),
        ...parameters,
    });
}

function run(ps: ParticleSystem, seconds: number): number {
    for (let t = 0; t < seconds - 1e-9; t += STEP) {
        ps.update(STEP);
    }
    return ps.particleNum;
}

function moveTo(ps: ParticleSystem, x: number): void {
    ps.emitter.position.x = x;
    ps.emitter.computeWorldMatrix(true);
}

describe('restart()', () => {
    const rates: Array<[string, () => ConstantValue | IntervalValue | PiecewiseBezier]> = [
        ['ConstantValue', () => new ConstantValue(50)],
        ['IntervalValue', () => new IntervalValue(50, 60)],
        ['PiecewiseBezier', () => new PiecewiseBezier([[new Bezier(50, 50, 50, 50), 0]])],
    ];

    it.each(rates)('emits the same over time with a %s rate after a restart', (_name, rate) => {
        const ps = system({emissionOverTime: rate()});
        const first = run(ps, 0.5);
        expect(first).toBeGreaterThan(0);
        ps.restart();
        expect(run(ps, 0.5)).toBe(first);
        ps.dispose();
    });

    it.each(rates)('emits the same over distance with a %s rate after a restart', (_name, rate) => {
        const ps = system({emissionOverDistance: rate()});
        const travel = () => {
            for (let i = 1; i <= 30; i++) {
                moveTo(ps, i * 0.1);
                ps.update(STEP);
            }
            return ps.particleNum;
        };
        moveTo(ps, 0);
        ps.update(STEP);
        const first = travel();
        expect(first).toBeGreaterThan(0);
        moveTo(ps, 0);
        ps.restart();
        ps.update(STEP);
        expect(travel()).toBe(first);
        ps.dispose();
    });

    it('emits the same random burst count after a restart', () => {
        const ps = system({
            looping: false,
            emissionBursts: [{time: 0, count: new IntervalValue(10, 20), cycle: 1, interval: 0, probability: 1}],
        });
        const first = run(ps, 0.2);
        expect(first).toBeGreaterThanOrEqual(10);
        ps.restart();
        expect(run(ps, 0.2)).toBe(first);
        ps.dispose();
    });

    it('does not spawn a line of distance particles when the emitter moved before the restart', () => {
        const ps = system({emissionOverDistance: new ConstantValue(1)});
        moveTo(ps, 0);
        run(ps, 0.1);
        expect(ps.particleNum).toBe(0);

        // A pooled effect is placed somewhere else, then restarted.
        moveTo(ps, 100);
        ps.restart();
        ps.update(STEP);
        expect(ps.particleNum).toBe(0);

        // Moving on from there still emits along the new path only.
        for (let i = 1; i <= 10; i++) {
            moveTo(ps, 100 + i);
            ps.update(STEP);
        }
        expect(ps.particleNum).toBe(10);
        for (let i = 0; i < ps.particleNum; i++) {
            expect(ps.particles[i].position.x).toBeGreaterThanOrEqual(100);
        }
        ps.dispose();
    });
});

describe('disposing the emitter node', () => {
    it('removes the system from its renderer', () => {
        const renderer = new BatchedRenderer('dispose-emitter', scene);
        const ps = system({emissionOverTime: new ConstantValue(10)});
        renderer.addSystem(ps);
        expect(renderer['systems']).toContain(ps);

        ps.emitter.dispose();
        expect(renderer['systems']).not.toContain(ps);
        // Disposing again, from either side, is harmless.
        ps.emitter.dispose();
        ps.dispose();
        expect(renderer['systems']).not.toContain(ps);
        renderer.dispose();
    });

    it('removes every system of an effect tree when its root is disposed', () => {
        const renderer = new BatchedRenderer('dispose-root', scene);
        const parent = system();
        const child = system();
        child.emitter.parent = parent.emitter;
        renderer.addSystem(parent);
        renderer.addSystem(child);

        parent.emitter.dispose();
        expect(renderer['systems']).toHaveLength(0);
        expect(child.emitter.isDisposed()).toBe(true);
        renderer.dispose();
    });

    it('still disposes the emitter when the system is disposed first', () => {
        const ps = system();
        ps.dispose();
        expect(ps.emitter.isDisposed()).toBe(true);
    });
});
