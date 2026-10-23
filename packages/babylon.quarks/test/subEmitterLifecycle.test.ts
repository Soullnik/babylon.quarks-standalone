import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {
    Bezier,
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    EmitSubParticleSystem,
    Gradient,
    Matrix4,
    PiecewiseBezier,
    PointEmitter,
    SpriteParticle,
    SubParticleEmitMode,
    Vector3,
    Vector4,
} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem} from '../src/ParticleSystem';

let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
});

afterEach(() => {
    scene.dispose();
    engine.dispose();
});

const STEP = 1 / 60;

function system(parameters: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}): ParticleSystem {
    return new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        worldSpace: true,
        startLife: new ConstantValue(1),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [],
        shape: new PointEmitter(),
        ...parameters,
    });
}

/** A parent whose particles fly along +X and die at x = 10, emitting into `child`. */
function parentOf(
    child: ParticleSystem,
    mode: SubParticleEmitMode,
    inherit: Array<'color' | 'lifetime'> = []
): ParticleSystem {
    const parent = system({
        startLife: new ConstantValue(0.5),
        startSpeed: new ConstantValue(20),
        startColor: new ConstantColor(new Vector4(1, 0, 0, 1)),
        emissionOverTime: new ConstantValue(60),
        shape: new PointEmitter(),
    });
    parent.emitter.rotation.y = Math.PI / 2; // the point shape emits along +Z; turn it to +X
    parent.emitter.computeWorldMatrix(true);
    parent.addBehavior(new EmitSubParticleSystem(parent, false, child.emitter as ParticleEmitter, mode, 1, inherit));
    return parent;
}

describe('a non-looping rate curve that starts at 0', () => {
    test('emits once the curve rises, and finishes only after that', () => {
        // 0 for the first half, 50 after.
        const rate = new PiecewiseBezier([
            [new Bezier(0, 0, 0, 0), 0],
            [new Bezier(50, 50, 50, 50), 0.5],
        ]);
        const ps = system({looping: false, duration: 2, emissionOverTime: rate});
        let finishedAt: number | undefined;
        ps.addEventListener('finished', () => (finishedAt ??= ps.time));
        let peak = 0;
        for (let i = 0; i < 4 * 60; i++) {
            ps.update(STEP);
            peak = Math.max(peak, ps.particleNum);
        }
        expect(peak).toBeGreaterThan(20);
        expect(finishedAt).toBeGreaterThanOrEqual(2);
    });

    test('a short pulse late in a long cycle still counts', () => {
        // 0, then 500/s for 0.05 s at t = 5 s of a 10 s cycle.
        const rate = new PiecewiseBezier([
            [new Bezier(0, 0, 0, 0), 0],
            [new Bezier(500, 500, 500, 500), 0.5],
            [new Bezier(0, 0, 0, 0), 0.505],
        ]);
        const ps = system({looping: false, duration: 10, emissionOverTime: rate});
        let peak = 0;
        for (let i = 0; i < 6 * 60; i++) {
            ps.update(STEP);
            peak = Math.max(peak, ps.particleNum);
        }
        expect(peak).toBeGreaterThan(10);
    });

    test('a rate that stays 0 still finishes at once', () => {
        const ps = system({looping: false, duration: 2, emissionOverTime: new ConstantValue(0)});
        let finished = false;
        ps.addEventListener('finished', () => (finished = true));
        ps.update(STEP);
        ps.update(STEP);
        expect(finished).toBe(true);
    });

    test('a looping system has nothing pending after endEmit', () => {
        const ps = system({emissionOverTime: new ConstantValue(10)});
        ps.update(STEP);
        ps.endEmit();
        expect(ps.hasPendingEmission()).toBe(false);
    });
});

describe('a disposed sub emitter target', () => {
    test('takes no more particles, and its store stops growing', () => {
        const renderer = new BatchedRenderer('dispose', scene);
        const child = system({onlyUsedByOther: true, emissionOverTime: new ConstantValue(60)});
        const parent = parentOf(child, SubParticleEmitMode.Frame);
        renderer.addSystem(parent);
        renderer.addSystem(child);
        for (let i = 0; i < 30; i++) renderer.update(STEP);
        expect(child.particleNum).toBeGreaterThan(0);

        child.dispose();
        expect(child.isDisposed).toBe(true);
        expect(child.particleNum).toBe(0);
        const capacity = child.particles.length;
        for (let i = 0; i < 120; i++) renderer.update(STEP);
        expect(child.particleNum).toBe(0);
        expect(child.particles.length).toBe(capacity);
    });

    test('disposed from a particleDied listener, drops its particles there and then', () => {
        const ps = system({startLife: new ConstantValue(0.2), emissionOverTime: new ConstantValue(60)});
        ps.addEventListener('particleDied', () => ps.dispose());
        for (let i = 0; i < 30; i++) ps.update(STEP);
        expect(ps.isDisposed).toBe(true);
        expect(ps.particleNum).toBe(0);
    });

    test('cannot be restarted back to life', () => {
        const ps = system({emissionOverTime: new ConstantValue(60)});
        ps.dispose();
        ps.restart();
        ps.update(STEP);
        ps.emit(STEP, (ps as any).emissionState, ps.emitter.getWorldMatrix() as never);
        expect(ps.particleNum).toBe(0);
    });
});

describe('a Death sub emission', () => {
    test('stays where its parent died, not where the next particle was born', () => {
        const renderer = new BatchedRenderer('death', scene);
        const child = system({onlyUsedByOther: true, duration: 1, emissionOverTime: new ConstantValue(120)});
        const parent = parentOf(child, SubParticleEmitMode.Death);
        const deaths: Vector3[] = [];
        parent.addEventListener('particleDied', (event: any) => deaths.push(event.particle.position.clone()));
        renderer.addSystem(parent);
        renderer.addSystem(child);
        for (let i = 0; i < 90; i++) renderer.update(STEP);

        expect(child.particleNum).toBeGreaterThan(100);
        // The child's particles do not move, so each one sits where some parent died.
        for (let i = 0; i < child.particleNum; i++) {
            const position = child.particles[i].position;
            const nearest = Math.min(...deaths.map((death) => death.distanceTo(position)));
            expect(nearest).toBeLessThan(0.5);
        }
    });

    test('inherits the colour the parent died with', () => {
        const renderer = new BatchedRenderer('inherit', scene);
        const child = system({onlyUsedByOther: true, duration: 1, emissionOverTime: new ConstantValue(120)});
        const parent = parentOf(child, SubParticleEmitMode.Death, ['color']);
        // Its red start colour, black at birth and full by the time it dies.
        parent.addBehavior(
            new ColorOverLife(
                new Gradient([
                    [new Vector3(0, 0, 0), 0],
                    [new Vector3(1, 1, 1), 1],
                ])
            )
        );
        renderer.addSystem(parent);
        renderer.addSystem(child);
        for (let i = 0; i < 90; i++) renderer.update(STEP);
        expect(child.particleNum).toBeGreaterThan(0);
        for (let i = 0; i < child.particleNum; i++) {
            expect(child.particles[i].startColor.x).toBeGreaterThan(0.8);
        }
    });
});

describe('a Death sub emitter across a restart', () => {
    test('drops the emissions of the last play', () => {
        const renderer = new BatchedRenderer('restart', scene);
        const child = system({onlyUsedByOther: true, duration: 1, emissionOverTime: new ConstantValue(120)});
        const parent = parentOf(child, SubParticleEmitMode.Death);
        renderer.addSystem(parent);
        renderer.addSystem(child);
        for (let i = 0; i < 60; i++) renderer.update(STEP);
        expect(child.particleNum).toBeGreaterThan(0);

        parent.stop();
        child.stop();
        parent.play();
        child.play();
        // Too soon for any parent of the new play to have died.
        for (let i = 0; i < 5; i++) renderer.update(STEP);
        expect(child.particleNum).toBe(0);
    });

    test('ignores lifetime inheritance, so its particles live their own life', () => {
        const renderer = new BatchedRenderer('lifetime', scene);
        const child = system({onlyUsedByOther: true, duration: 1, emissionOverTime: new ConstantValue(120)});
        const parent = parentOf(child, SubParticleEmitMode.Death, ['lifetime']);
        renderer.addSystem(parent);
        renderer.addSystem(child);
        for (let i = 0; i < 90; i++) renderer.update(STEP);
        expect(child.particleNum).toBeGreaterThan(100);
        for (let i = 0; i < child.particleNum; i++) {
            expect(child.particles[i].life).toBe(1);
        }
    });
});

describe('a sub emitter that turns with the parent velocity', () => {
    const basis = (velocity: Vector3) => {
        const ps = {worldSpace: true, emitter: {matrixWorld: new Matrix4()}} as never;
        const behavior = new EmitSubParticleSystem(ps, true, undefined);
        const particle = new SpriteParticle();
        particle.position.set(1, 2, 3);
        particle.velocity.copy(velocity);
        const m = new Matrix4();
        (behavior as any).setMatrixFromParticle(m, particle);
        return m;
    };

    test.each([
        [new Vector3(0, 0, 5)],
        [new Vector3(0, 0, -5)],
        [new Vector3(0, 0, 2)],
        [new Vector3(3, 0, 0)],
        [new Vector3(1, 2, 3)],
        [new Vector3(0, 0, 0)],
    ])('is orthonormal for velocity %p, Z along it, at the particle', (velocity) => {
        const m = basis(velocity);
        const e = m.elements;
        const columns = [0, 4, 8].map((o) => new Vector3(e[o], e[o + 1], e[o + 2]));
        for (const column of columns) {
            expect(column.length()).toBeCloseTo(1, 6);
        }
        expect(columns[0].dot(columns[1])).toBeCloseTo(0, 6);
        expect(columns[0].clone().cross(columns[1]).dot(columns[2])).toBeCloseTo(1, 6);
        if (velocity.length() > 0) {
            expect(columns[2].dot(velocity.clone().normalize())).toBeCloseTo(1, 6);
        }
        expect([e[12], e[13], e[14]]).toEqual([1, 2, 3]);
    });

    test('moving along +Z keeps the sub emitter unturned', () => {
        const e = basis(new Vector3(0, 0, 4)).elements;
        expect(Array.from(e.slice(0, 11))).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    });
});

describe('a local-space sub emission', () => {
    test('keeps its particles where they were born after the emission state is reused', () => {
        const renderer = new BatchedRenderer('alias', scene);
        // The child's emission lasts 0.1 s but its particles live 5 s, so the emission state (and
        // its matrix) is recycled for the next death while the first particles are still alive.
        const child = system({
            onlyUsedByOther: true,
            worldSpace: false,
            duration: 0.1,
            startLife: new ConstantValue(5),
            emissionOverTime: new ConstantValue(60),
        });
        const parent = parentOf(child, SubParticleEmitMode.Death);
        renderer.addSystem(parent);
        renderer.addSystem(child);
        renderer.update(STEP);
        for (let i = 0; i < 40 && child.particleNum === 0; i++) renderer.update(STEP);
        expect(child.particleNum).toBeGreaterThan(0);
        const first = child.particles[0];
        const bornAt = first.parentMatrix!.clone();
        for (let i = 0; i < 60; i++) renderer.update(STEP);
        expect(child.particleNum).toBeGreaterThan(1);
        expect(first.parentMatrix!.elements).toEqual(bornAt.elements);
    });

    test('follows the parent particle while it lives', () => {
        const renderer = new BatchedRenderer('follow', scene);
        const child = system({
            onlyUsedByOther: true,
            worldSpace: false,
            duration: 5,
            startLife: new ConstantValue(5),
            emissionOverTime: new ConstantValue(60),
        });
        const parent = parentOf(child, SubParticleEmitMode.Frame);
        renderer.addSystem(parent);
        renderer.addSystem(child);
        for (let i = 0; i < 10 && child.particleNum === 0; i++) renderer.update(STEP);
        expect(child.particleNum).toBeGreaterThan(0);
        const first = child.particles[0];
        const bornAt = first.parentMatrix!.clone();
        for (let i = 0; i < 10; i++) renderer.update(STEP);
        expect(first.parentMatrix!.elements).not.toEqual(bornAt.elements);
    });

    test('ends when the parent system is cleared', () => {
        const renderer = new BatchedRenderer('cleared', scene);
        const child = system({
            onlyUsedByOther: true,
            worldSpace: false,
            duration: 5,
            startLife: new ConstantValue(0.2),
            emissionOverTime: new ConstantValue(60),
        });
        const parent = parentOf(child, SubParticleEmitMode.Frame);
        renderer.addSystem(parent);
        renderer.addSystem(child);
        for (let i = 0; i < 10; i++) renderer.update(STEP);
        expect(child.particleNum).toBeGreaterThan(0);
        parent.clear();
        parent.pause();
        for (let i = 0; i < 20; i++) renderer.update(STEP);
        expect(child.particleNum).toBe(0);
    });
});
