import {
    ApplyForce,
    Behavior,
    Bezier,
    ColorOverLife,
    ConstantValue,
    FrameOverLife,
    Gradient,
    GravityForce,
    LimitSpeedOverLife,
    OrbitOverLife,
    ColorBySpeed,
    SizeBySpeed,
    RotationBySpeed,
    ForceOverLife,
    IntervalValue,
    IParticleSystem,
    Matrix4,
    Noise,
    Particle,
    ParticleStore,
    PiecewiseBezier,
    RotationOverLife,
    SizeOverLife,
    SpeedOverLife,
    SpriteParticle,
    Vector3,
    Vector3Function,
    planBehaviorFusion,
} from '../../src';

const system = {
    worldSpace: false,
    emitter: {matrixWorld: new Matrix4()},
} as unknown as IParticleSystem;

function makePool(count: number): SpriteParticle[] {
    const store = new ParticleStore(count);
    const particles: SpriteParticle[] = [];
    for (let i = 0; i < count; i++) {
        const particle = new SpriteParticle(store, i);
        particle.life = 2;
        particle.age = (i / count) * 2;
        particle.position.set(i * 0.5 - 2, i * -0.25 + 1, i * 0.125);
        particle.velocity.set(1 + i * 0.5, -2 + i * 0.25, 0.5 * i);
        particle.startSize.set(1 + i * 0.1, 1, 1);
        particle.startColor.set(1, 0.5, 0.25, 1);
        particle.color.set(1, 1, 1, 1);
        particle.rotation = i * 0.1;
        particles.push(particle);
    }
    return particles;
}

function snapshot(particles: Particle[]): number[] {
    const values: number[] = [];
    for (const p of particles) {
        values.push(
            p.position.x, p.position.y, p.position.z,
            p.velocity.x, p.velocity.y, p.velocity.z,
            p.size.x, p.size.y, p.size.z,
            p.color.x, p.color.y, p.color.z, p.color.w,
            p.uvTile, p.speedModifier,
            typeof p.rotation === 'number' ? p.rotation : 0
        );
    }
    return values;
}

const DELTA = 1 / 60;
const COUNT = 8;

/** The behaviors this suite expects to be merged into one loop. */
const makeFusable = (): Behavior[] => [
    new ColorOverLife(new Gradient()),
    new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.8, 0.4, 0), 0]])),
    new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(9.8)),
    new RotationOverLife(new ConstantValue(1.5)),
    new FrameOverLife(new PiecewiseBezier([[new Bezier(0, 1, 2, 3), 0]])),
    new SpeedOverLife(new PiecewiseBezier([[new Bezier(1, 0.7, 0.4, 0.2), 0]])),
];

/** Applies a plan the way ParticleSystem.simulateStep does. */
function runPlan(behaviors: Behavior[], particles: Particle[], delta: number): void {
    for (const step of planBehaviorFusion(behaviors)) {
        for (const behavior of step.behaviors) behavior.frameUpdate(delta);
        if (step.run !== undefined) {
            step.run(behaviors, particles, particles.length, delta);
            continue;
        }
        const behavior = step.behaviors[0];
        if (behavior.updateAll !== undefined) {
            behavior.updateAll(particles, particles.length, delta);
        } else {
            for (const particle of particles) {
                if (particle.age < particle.life) behavior.update(particle, delta);
            }
        }
    }
}

/** Applies every behavior as its own pass, which is what fusion replaces. */
function runSeparately(behaviors: Behavior[], particles: Particle[], delta: number): void {
    for (const behavior of behaviors) {
        behavior.frameUpdate(delta);
        if (behavior.updateAll !== undefined) {
            behavior.updateAll(particles, particles.length, delta);
        } else {
            for (const particle of particles) {
                if (particle.age < particle.life) behavior.update(particle, delta);
            }
        }
    }
}

describe('behavior fusion', () => {
    it('merges a consecutive run into a single compiled pass', () => {
        const steps = planBehaviorFusion(makeFusable());
        expect(steps).toHaveLength(1);
        expect(steps[0].run).toBeDefined();
        expect(steps[0].behaviors).toHaveLength(6);
    });

    it('produces the same result as running each behavior separately', () => {
        const fusedBehaviors = makeFusable();
        const separateBehaviors = makeFusable();
        const fused = makePool(COUNT);
        const separate = makePool(COUNT);
        for (const p of fused) for (const b of fusedBehaviors) b.initialize(p, system);
        for (const p of separate) for (const b of separateBehaviors) b.initialize(p, system);

        for (let frame = 0; frame < 3; frame++) {
            runPlan(fusedBehaviors, fused, DELTA);
            runSeparately(separateBehaviors, separate, DELTA);
            for (let i = 0; i < COUNT; i++) {
                fused[i].age += DELTA;
                separate[i].age += DELTA;
            }
        }

        const expected = snapshot(separate);
        const actual = snapshot(fused);
        for (let i = 0; i < expected.length; i++) {
            expect(actual[i]).toBeCloseTo(expected[i], 6);
        }
    });

    it('keeps an unknown behavior on its own pass, in its original place', () => {
        const before = new ColorOverLife(new Gradient());
        const middle = new OrbitOverLife(new ConstantValue(1), new Vector3(0, 1, 0)); // not fusable
        const afterA = new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(9.8));
        const afterB = new SpeedOverLife(new PiecewiseBezier([[new Bezier(1, 1, 1, 1), 0]]));

        const steps = planBehaviorFusion([before, middle, afterA, afterB]);
        expect(steps).toHaveLength(3);
        // A lone recognised behavior is not worth wrapping in generated code.
        expect(steps[0].behaviors).toEqual([before]);
        expect(steps[0].run).toBeUndefined();
        expect(steps[1].behaviors).toEqual([middle]);
        expect(steps[1].run).toBeUndefined();
        expect(steps[2].behaviors).toEqual([afterA, afterB]);
        expect(steps[2].run).toBeDefined();
    });

    it('matches the separate path when an unknown behavior splits the run', () => {
        const build = (): Behavior[] => [
            new ColorOverLife(new Gradient()),
            new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.8, 0.4, 0), 0]])),
            new Noise(new ConstantValue(0), new ConstantValue(0)), // not fusable, and inert here
            new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(9.8)),
            new SpeedOverLife(new PiecewiseBezier([[new Bezier(1, 0.7, 0.4, 0.2), 0]])),
        ];
        const fusedBehaviors = build();
        const separateBehaviors = build();
        const fused = makePool(COUNT);
        const separate = makePool(COUNT);
        for (const p of fused) for (const b of fusedBehaviors) b.initialize(p, system);
        for (const p of separate) for (const b of separateBehaviors) b.initialize(p, system);

        runPlan(fusedBehaviors, fused, DELTA);
        runSeparately(separateBehaviors, separate, DELTA);

        const expected = snapshot(separate);
        const actual = snapshot(fused);
        for (let i = 0; i < expected.length; i++) {
            expect(actual[i]).toBeCloseTo(expected[i], 6);
        }
    });

    it('handles a vector-valued SizeOverLife inside a fused run', () => {
        const build = (): Behavior[] => [
            new ColorOverLife(new Gradient()),
            new SizeOverLife(
                new Vector3Function(new ConstantValue(0.5), new ConstantValue(2), new ConstantValue(3))
            ),
        ];
        const fusedBehaviors = build();
        const separateBehaviors = build();
        const fused = makePool(COUNT);
        const separate = makePool(COUNT);
        for (const p of fused) for (const b of fusedBehaviors) b.initialize(p, system);
        for (const p of separate) for (const b of separateBehaviors) b.initialize(p, system);

        runPlan(fusedBehaviors, fused, DELTA);
        runSeparately(separateBehaviors, separate, DELTA);

        expect(snapshot(fused)).toEqual(snapshot(separate));
        expect(fused[0].size.y).toBeCloseTo(separate[0].size.y, 6);
    });

    it('skips dead particles', () => {
        const behaviors = makeFusable();
        const particles = makePool(4);
        for (const p of particles) for (const b of behaviors) b.initialize(p, system);
        particles[1].age = particles[1].life;
        const frozen = particles[1].velocity.y;
        runPlan(behaviors, particles, DELTA);
        expect(particles[1].velocity.y).toBe(frozen);
        expect(particles[0].velocity.y).not.toBe(frozen);
    });

    it('picks up a generator swapped after the plan was built', () => {
        const size = new SizeOverLife(new PiecewiseBezier([[new Bezier(0, 0, 0, 0), 0]]));
        const behaviors: Behavior[] = [new ColorOverLife(new Gradient()), size];
        const particles = makePool(2);
        for (const p of particles) for (const b of behaviors) b.initialize(p, system);

        runPlan(behaviors, particles, DELTA);
        expect(particles[0].size.x).toBeCloseTo(0, 6);

        size.size = new PiecewiseBezier([[new Bezier(1, 1, 1, 1), 0]]);
        for (const p of particles) size.initialize(p);
        runPlan(behaviors, particles, DELTA);
        expect(particles[0].size.x).toBeCloseTo(particles[0].startSize.x, 6);
    });
    it('matches the separate path for the force and by-speed behaviors', () => {
        const build = (): Behavior[] => [
            new ForceOverLife(new ConstantValue(1), new ConstantValue(-2), new ConstantValue(0.5)),
            new LimitSpeedOverLife(new PiecewiseBezier([[new Bezier(2, 2, 2, 2), 0]]), 0.5),
            new GravityForce(new Vector3(0, 5, 0), 4),
            new ColorBySpeed(new Gradient(), new IntervalValue(0, 5)),
            new SizeBySpeed(new PiecewiseBezier([[new Bezier(1, 0.8, 0.4, 0), 0]]), new IntervalValue(0, 5)),
            new RotationBySpeed(new ConstantValue(2), new IntervalValue(0, 5)),
        ];
        const fusedBehaviors = build();
        const separateBehaviors = build();
        const fused = makePool(COUNT);
        const separate = makePool(COUNT);
        for (const p of [...fused, ...separate]) p.startSpeed = 1 + p.position.x * 0.3;
        for (const p of fused) for (const b of fusedBehaviors) b.initialize(p, system);
        for (const p of separate) for (const b of separateBehaviors) b.initialize(p, system);

        expect(planBehaviorFusion(fusedBehaviors)).toHaveLength(1);

        for (let frame = 0; frame < 3; frame++) {
            runPlan(fusedBehaviors, fused, DELTA);
            runSeparately(separateBehaviors, separate, DELTA);
            for (let i = 0; i < COUNT; i++) {
                fused[i].age += DELTA;
                separate[i].age += DELTA;
            }
        }

        const expected = snapshot(separate);
        const actual = snapshot(fused);
        for (let i = 0; i < expected.length; i++) {
            expect(actual[i]).toBeCloseTo(expected[i], 6);
        }
    });
});
