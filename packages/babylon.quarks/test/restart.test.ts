import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Bezier, ConstantColor, ConstantValue, IntervalValue, PiecewiseBezier, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {EffectPool} from '../src/EffectPool';
import {ParticleEmitter} from '../src/ParticleEmitter';
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

    it('keeps emitting with an unseeded random rate after a restart', () => {
        const ps = system({seed: undefined, emissionOverTime: new IntervalValue(50, 60)});
        expect(run(ps, 0.5)).toBeGreaterThan(20);
        ps.restart();
        expect(run(ps, 0.5)).toBeGreaterThan(20);
        ps.dispose();
    });

    it('plays a random-rate effect from an EffectPool more than once', () => {
        const renderer = new BatchedRenderer('pool-restart', scene);
        const template = system({
            seed: undefined,
            looping: false,
            duration: 0.5,
            emissionOverTime: new IntervalValue(50, 60),
        });
        renderer.addSystem(template);
        const pool = new EffectPool(template.emitter, {renderer});
        for (let play = 0; play < 3; play++) {
            const copy = pool.acquire()!;
            const copySystem = (copy as ParticleEmitter).system as ParticleSystem;
            expect(run(copySystem, 0.3)).toBeGreaterThan(10);
            pool.release(copy);
        }
        pool.dispose();
        renderer.dispose();
    });

    it('replays its first play when the seed is set after construction', () => {
        const ps = system({seed: undefined, emissionOverTime: new IntervalValue(50, 60)});
        ps.seed = 11;
        const first = run(ps, 0.5);
        ps.restart();
        expect(run(ps, 0.5)).toBe(first);
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

    it('keeps a child system playing when its autoDestroy parent finishes first', () => {
        const renderer = new BatchedRenderer('dispose-auto', scene);
        const parent = system({
            looping: false,
            duration: 0.1,
            startLife: new ConstantValue(0.2),
            emissionOverTime: new ConstantValue(60),
        });
        const child = system({
            looping: false,
            duration: 2,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(30),
        });
        child.emitter.parent = parent.emitter;
        renderer.addSystem(parent);
        renderer.addSystem(child);
        QuarksUtil.setStopAction(parent.emitter, 'destroy');
        let childFramesAfterParent = 0;
        for (let i = 0; i < 120; i++) {
            renderer.update(STEP);
            if (parent.emitter.isDisposed() && renderer['systems'].includes(child) && child.particleNum > 0) {
                childFramesAfterParent++;
            }
        }
        expect(parent.emitter.isDisposed()).toBe(true);
        expect(childFramesAfterParent).toBeGreaterThan(30);
        renderer.dispose();
        child.dispose();
    });

    it('still disposes the emitter when the system is disposed first', () => {
        const ps = system();
        ps.dispose();
        expect(ps.emitter.isDisposed()).toBe(true);
    });
});

describe('restart() and a sweeping shape', () => {
    it('starts the arc over, so a seeded Loop shape replays the same positions', () => {
        const {CircleEmitter, EmitterMode} = jest.requireActual<typeof import('quarks.core')>('quarks.core');
        const ps = system({
            emissionOverTime: new ConstantValue(60),
            startSpeed: new ConstantValue(0),
            shape: new CircleEmitter({radius: 1, thickness: 0, mode: EmitterMode.Loop, speed: new ConstantValue(1)}),
        });
        const angles = () => {
            const out: number[] = [];
            for (let i = 0; i < ps.particleNum; i++) {
                const p = ps.particles[i];
                out.push(Math.round(Math.atan2(p.position.y, p.position.x) * 1000) / 1000);
            }
            return out;
        };
        run(ps, 0.5);
        const first = angles();
        expect(first.length).toBeGreaterThan(10);
        ps.restart();
        run(ps, 0.5);
        expect(angles()).toEqual(first);
        // The first particle after a restart is at the arc's start, not where the sweep stopped.
        ps.restart();
        ps.update(STEP);
        expect(Math.abs(Math.atan2(ps.particles[0].position.y, ps.particles[0].position.x))).toBeLessThan(0.2);
        ps.dispose();
    });
});
