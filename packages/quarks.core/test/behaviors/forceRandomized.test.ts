import {
    Behavior,
    BehaviorFromJSON,
    BehaviorToJSON,
    Bezier,
    ConstantValue,
    createSeededRandom,
    ForceOverLife,
    ForceOverLifeJSON,
    IntervalValue,
    IParticleSystem,
    Matrix4,
    Particle,
    ParticleStore,
    PiecewiseBezier,
    planBehaviorFusion,
    Quaternion,
    RandomBetweenCurves,
    SpriteParticle,
    Vector3,
    withRandomSource,
} from '../../src';

const DELTA = 1 / 30;

const worldSystem = {
    worldSpace: true,
    motionScale: 1,
    emitter: {matrixWorld: new Matrix4()},
} as unknown as IParticleSystem;

function pool(count: number): SpriteParticle[] {
    const store = new ParticleStore(count);
    const particles: SpriteParticle[] = [];
    for (let i = 0; i < count; i++) {
        const particle = new SpriteParticle(store, i);
        particle.life = 4;
        particle.age = i * 0.2;
        particle.velocity.set(0, 0, 0);
        particles.push(particle);
    }
    return particles;
}

/** Torch sparks: x in [-3, 4], y and z in [-4, 3]. */
const sparks = (randomized: boolean, space: 'world' | 'local' = 'world') =>
    new ForceOverLife(new IntervalValue(-3, 4), new IntervalValue(-4, 3), new IntervalValue(-4, 3), space, randomized);

function initialize(behavior: Behavior, particles: Particle[], system: IParticleSystem, seed: number): void {
    withRandomSource(createSeededRandom(seed), () => {
        for (const p of particles) behavior.initialize(p, system);
    });
    for (let i = 0; i < particles.length; i++) {
        (particles[i] as SpriteParticle).store.recordMemory(i, particles[i].memory);
    }
}

/** The velocity change of one step of `behavior` alone on `particle`. */
function stepForce(behavior: Behavior, particle: Particle): Vector3 {
    const before = particle.velocity.clone();
    behavior.frameUpdate(DELTA);
    behavior.update(particle, DELTA);
    return particle.velocity.clone().sub(before).divideScalar(DELTA);
}

describe('ForceOverLife randomized', () => {
    it('picks a new force within the range every step', () => {
        const behavior = sparks(true);
        const [particle] = pool(1);
        initialize(behavior, [particle], worldSystem, 3);
        const xs = new Set<number>();
        withRandomSource(createSeededRandom(9), () => {
            for (let s = 0; s < 40; s++) {
                const force = stepForce(behavior, particle);
                expect(force.x).toBeGreaterThanOrEqual(-3 - 1e-4);
                expect(force.x).toBeLessThanOrEqual(4 + 1e-4);
                expect(force.y).toBeGreaterThanOrEqual(-4 - 1e-4);
                expect(force.y).toBeLessThanOrEqual(3 + 1e-4);
                expect(force.z).toBeGreaterThanOrEqual(-4 - 1e-4);
                expect(force.z).toBeLessThanOrEqual(3 + 1e-4);
                xs.add(Math.round(force.x * 1e4));
            }
        });
        expect(xs.size).toBeGreaterThan(30);
    });

    it('keeps one force per particle when not randomized, the default', () => {
        const behavior = sparks(false);
        expect(new ForceOverLife(new ConstantValue(0), new ConstantValue(0), new ConstantValue(0)).randomized).toBe(
            false
        );
        const [particle] = pool(1);
        initialize(behavior, [particle], worldSystem, 3);
        const first = stepForce(behavior, particle);
        for (let s = 0; s < 10; s++) {
            const force = stepForce(behavior, particle);
            expect(force.x).toBeCloseTo(first.x, 4);
            expect(force.y).toBeCloseTo(first.y, 4);
            expect(force.z).toBeCloseTo(first.z, 4);
        }
    });

    it('re-rolls random between curves, and leaves curves and constants as they are', () => {
        const curve = (a: number) => new PiecewiseBezier([[new Bezier(a, a, a, a), 0]]);
        const behavior = new ForceOverLife(
            new RandomBetweenCurves(curve(-1), curve(1)),
            curve(2),
            new ConstantValue(-5),
            'world',
            true
        );
        const [particle] = pool(1);
        initialize(behavior, [particle], worldSystem, 1);
        const xs = new Set<number>();
        withRandomSource(createSeededRandom(4), () => {
            for (let s = 0; s < 10; s++) {
                const force = stepForce(behavior, particle);
                expect(force.y).toBeCloseTo(2, 4);
                expect(force.z).toBeCloseTo(-5, 4);
                xs.add(Math.round(force.x * 1e4));
            }
        });
        expect(xs.size).toBeGreaterThan(5);
    });

    it('averages out over many steps instead of drifting each particle its own way', () => {
        const behavior = sparks(true);
        const [particle] = pool(1);
        particle.life = 1e6;
        initialize(behavior, [particle], worldSystem, 3);
        const steps = 3000;
        withRandomSource(createSeededRandom(11), () => {
            behavior.frameUpdate(DELTA);
            for (let s = 0; s < steps; s++) behavior.update(particle, DELTA);
        });
        const mean = particle.velocity.clone().divideScalar(steps * DELTA);
        // The middle of each range: 0.5, -0.5, -0.5.
        expect(mean.x).toBeCloseTo(0.5, 1);
        expect(mean.y).toBeCloseTo(-0.5, 1);
        expect(mean.z).toBeCloseTo(-0.5, 1);
    });

    it('replays the same under the same seed', () => {
        const runOnce = () => {
            const behavior = sparks(true);
            const particles = pool(4);
            initialize(behavior, particles, worldSystem, 5);
            withRandomSource(createSeededRandom(6), () => {
                for (let s = 0; s < 10; s++) {
                    behavior.frameUpdate(DELTA);
                    behavior.updateAll!(particles, particles.length, DELTA);
                }
            });
            return particles.map((p) => p.velocity.toArray());
        };
        expect(runOnce()).toEqual(runOnce());
    });

    it.each([
        ['world system, world force', true, 'world'],
        ['local system, world force', false, 'world'],
        ['world system, local force', true, 'local'],
    ] as const)(
        'gives the same velocities through update, updateAll and the fused pass (%s)',
        (_, worldSpace, space) => {
            const matrixWorld = new Matrix4().compose(
                new Vector3(1, 2, 3),
                new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.6),
                new Vector3(2, 1, 0.5)
            );
            const system = {worldSpace, motionScale: 1.5, emitter: {matrixWorld}} as unknown as IParticleSystem;
            const count = 6;
            const runWith = (mode: 'update' | 'updateAll' | 'fused') => {
                const behaviors = [sparks(true, space)];
                const particles = pool(count);
                initialize(behaviors[0], particles, system, 7);
                const plan = planBehaviorFusion(behaviors);
                if (mode === 'fused') expect(plan[0].run).toBeDefined();
                withRandomSource(createSeededRandom(8), () => {
                    for (let s = 0; s < 5; s++) {
                        behaviors[0].frameUpdate(DELTA);
                        if (mode === 'fused') plan[0].run!(behaviors, particles, count, DELTA);
                        else if (mode === 'updateAll') behaviors[0].updateAll!(particles, count, DELTA);
                        else for (const p of particles) behaviors[0].update(p, DELTA);
                    }
                });
                return particles;
            };
            const single = runWith('update');
            const all = runWith('updateAll');
            const fused = runWith('fused');
            for (let i = 0; i < count; i++) {
                for (const other of [all[i], fused[i]]) {
                    expect(other.velocity.x).toBeCloseTo(single[i].velocity.x, 5);
                    expect(other.velocity.y).toBeCloseTo(single[i].velocity.y, 5);
                    expect(other.velocity.z).toBeCloseTo(single[i].velocity.z, 5);
                }
                expect(single[i].velocity.length()).toBeGreaterThan(0);
            }
            // The fused pass keeps the memory column on what the particle holds.
            const store = fused[0].store;
            for (let i = 0; i < count; i++) {
                for (let j = 0; j < fused[i].memory.length; j++) {
                    expect(store.memory[i * store.memoryStride + j]).toBe(fused[i].memory[j]);
                }
            }
        }
    );

    it('rolls within the range in the fused pass without a random source, differently each step', () => {
        const behavior = sparks(true);
        const particles = pool(3);
        initialize(behavior, particles, worldSystem, 4);
        const plan = planBehaviorFusion([behavior]);
        const xs = new Set<number>();
        for (let s = 0; s < 20; s++) {
            const before = particles.map((p) => p.velocity.clone());
            behavior.frameUpdate(DELTA);
            plan[0].run!([behavior], particles, particles.length, DELTA);
            particles.forEach((p, i) => {
                const force = p.velocity.clone().sub(before[i]).divideScalar(DELTA);
                expect(force.x).toBeGreaterThanOrEqual(-3 - 1e-3);
                expect(force.x).toBeLessThanOrEqual(4 + 1e-3);
                expect(force.z).toBeGreaterThanOrEqual(-4 - 1e-3);
                expect(force.z).toBeLessThanOrEqual(3 + 1e-3);
                xs.add(Math.round(force.x * 1e3));
                // The rolls stay in [0, 1) and the column follows the particle.
                for (const roll of p.memory) {
                    expect(roll).toBeGreaterThanOrEqual(0);
                    expect(roll).toBeLessThan(1);
                }
                const store = p.store;
                expect(store.memory[i * store.memoryStride]).toBe(p.memory[0]);
            });
        }
        expect(xs.size).toBeGreaterThan(40);
    });

    it('turning randomized off in the fused pass goes on from the last roll', () => {
        const behavior = sparks(true);
        const behaviors = [behavior];
        const particles = pool(2);
        initialize(behavior, particles, worldSystem, 2);
        const plan = planBehaviorFusion(behaviors);
        withRandomSource(createSeededRandom(3), () => {
            behavior.frameUpdate(DELTA);
            plan[0].run!(behaviors, particles, 2, DELTA);
        });
        behavior.randomized = false;
        for (const p of particles) {
            const before = p.velocity.clone();
            const memory = p.memory;
            const wanted = new Vector3(
                behavior.x.genValue(memory, 0),
                behavior.y.genValue(memory, 0),
                behavior.z.genValue(memory, 0)
            );
            behavior.frameUpdate(DELTA);
            plan[0].run!(behaviors, [p], 1, DELTA, p.store);
            const force = p.velocity.clone().sub(before).divideScalar(DELTA);
            expect(force.x).toBeCloseTo(wanted.x, 3);
            expect(force.y).toBeCloseTo(wanted.y, 3);
            expect(force.z).toBeCloseTo(wanted.z, 3);
        }
    });

    it('writes randomized only when true, and keeps it through JSON and clone', () => {
        const on = sparks(true);
        const json = JSON.parse(JSON.stringify(on.toJSON())) as ForceOverLifeJSON;
        expect(json.randomized).toBe(true);
        expect((BehaviorFromJSON(json, {} as never) as ForceOverLife).randomized).toBe(true);
        expect((on.clone() as ForceOverLife).randomized).toBe(true);
        expect(BehaviorToJSON(on, {} as never)).toHaveProperty('randomized', true);
        const off = sparks(false);
        expect(off.toJSON()).not.toHaveProperty('randomized');
        expect((off.clone() as ForceOverLife).randomized).toBe(false);
        expect(
            (ForceOverLife.fromJSON({...off.toJSON(), randomized: 'yes'} as never) as ForceOverLife).randomized
        ).toBe(false);
    });
});

describe('reroll', () => {
    it('rolls an interval or a curve mix again in its own slot, and leaves a missing slot alone', () => {
        const interval = new IntervalValue(0, 1);
        const memory: number[] = [];
        interval.startGen(memory);
        withRandomSource(createSeededRandom(1), () => interval.reroll(memory));
        const rolled = memory[0];
        withRandomSource(createSeededRandom(2), () => interval.reroll(memory));
        expect(memory[0]).not.toBe(rolled);
        expect(memory).toHaveLength(1);
        interval.reroll([]);

        const curves = new RandomBetweenCurves(new PiecewiseBezier(), new PiecewiseBezier());
        const empty: number[] = [];
        curves.reroll(empty);
        expect(empty).toHaveLength(0);
        curves.startGen(memory);
        withRandomSource(createSeededRandom(5), () => curves.reroll(memory));
        expect(memory).toHaveLength(2);
        expect(memory[1]).toBeGreaterThanOrEqual(0);
        expect(memory[1]).toBeLessThan(1);
    });
});
