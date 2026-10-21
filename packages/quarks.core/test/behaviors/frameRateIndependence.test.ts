import {
    ApplyForce,
    AxisAngleGenerator,
    Behavior,
    BehaviorTypes,
    Bezier,
    ColorBySpeed,
    ColorOverLife,
    ConstantValue,
    createSeededRandom,
    ForceOverLife,
    FrameOverLife,
    Gradient,
    GravityForce,
    InheritVelocity,
    IntervalValue,
    IParticleSystem,
    LimitSpeedOverLife,
    Matrix4,
    Noise,
    OrbitOverLife,
    PiecewiseBezier,
    Quaternion,
    Rotation3DOverLife,
    RotationBySpeed,
    RotationOverLife,
    SizeBySpeed,
    SizeOverLife,
    SpeedOverLife,
    SpriteParticle,
    TurbulenceField,
    Vector3,
    VelocityOverLife,
    withRandomSource,
} from '../../src';

/**
 * quarks.core does not fix the step: an engine may call `update` at 30, 60 or 144 Hz. A behavior
 * that changes something over time must reach the same state after one second whatever the step,
 * up to the error of a first-order step. Each case runs one particle for {@link SECONDS} at every
 * rate in {@link RATES}, through `update` and through `updateAll` (which ParticleSystem calls when
 * a behavior has it), and compares the result with a fine-stepped reference.
 */
const SECONDS = 1;
const LIFE = 2;
const RATES = [30, 60, 120, 144];
const REFERENCE_RATE = 960;

const system = {
    worldSpace: false,
    emitter: {matrixWorld: new Matrix4()},
    emitterVelocity: new Vector3(0, 0, 2),
} as unknown as IParticleSystem;

/** Behaviors with nothing that runs over time, or that need a whole system to run. */
const EXEMPT: Record<string, string> = {
    ApplyCollision: 'bounces off what the host resolver reports; nothing integrates over time',
    ApplySequences: 'places particles from a texture at emission',
    ChangeEmitDirection: 'turns the velocity once, at emission',
    EmitSubParticleSystem: 'emits into another system; the sub-emitter tests cover its timing',
    WidthOverLength: 'shapes a trail along its length, not over time',
};

/** A linear ramp over the particle's life, from `from` to `to`. */
const ramp = (from: number, to: number) =>
    new PiecewiseBezier([[new Bezier(from, from + (to - from) / 3, from + ((to - from) * 2) / 3, to), 0]]);

interface Case {
    behavior: () => Behavior;
    /** The state this behavior changes, read after the run. */
    read: (particle: SpriteParticle) => number[];
    /**
     * How far a coarse step may land from the reference, per value, relative to it. Default 2%, and
     * never under 1e-3. Values read off the particle's life fraction lag one step behind its age,
     * which at 30 Hz is 1/60 of a 2 s life, so those cases allow 5%.
     */
    tolerance?: number;
    /** How long to run, for a behavior whose state settles within the default second. */
    seconds?: number;
    /** A behavior run first that drives the input this one reads, such as the speed. */
    companion?: () => Behavior;
    /** Rotate the particle by quaternion, as a mesh particle does, instead of by an angle. */
    quaternion?: boolean;
}

type Path = 'update' | 'updateAll';

const velocity = (p: SpriteParticle) => [p.velocity.x, p.velocity.y, p.velocity.z];
const position = (p: SpriteParticle) => [p.position.x, p.position.y, p.position.z];

const CASES: Record<string, Case> = {
    ApplyForce: {
        behavior: () => new ApplyForce(new Vector3(1, 2, 0), new ConstantValue(3)),
        read: velocity,
    },
    GravityForce: {
        behavior: () => new GravityForce(new Vector3(0, 0, 0), 4),
        read: velocity,
        tolerance: 0.05,
    },
    ForceOverLife: {
        behavior: () => new ForceOverLife(ramp(0, 4), new ConstantValue(-2), ramp(1, -1)),
        read: velocity,
        tolerance: 0.05,
    },
    VelocityOverLife: {
        behavior: () => new VelocityOverLife(ramp(0, 3), new ConstantValue(1), new ConstantValue(0)),
        read: position,
        tolerance: 0.01,
    },
    OrbitOverLife: {
        behavior: () => new OrbitOverLife(ramp(1, 3), new Vector3(0, 1, 0)),
        read: position,
        tolerance: 0.05,
    },
    RotationOverLife: {
        behavior: () => new RotationOverLife(new ConstantValue(2)),
        read: (p) => [p.rotation as number],
    },
    Rotation3DOverLife: {
        behavior: () => new Rotation3DOverLife(new AxisAngleGenerator(new Vector3(0, 0, 1), new ConstantValue(2))),
        read: (p) => {
            const q = p.rotation as Quaternion;
            return [q.x, q.y, q.z, q.w];
        },
        quaternion: true,
    },
    InheritVelocity: {
        behavior: () => new InheritVelocity(new ConstantValue(0.5), 'current'),
        read: position,
    },
    Noise: {
        behavior: () =>
            new Noise(new ConstantValue(1), new ConstantValue(1), new ConstantValue(1), new ConstantValue(1)),
        read: (p) => [...position(p), p.rotation as number],
        // The field moves fast, so the one-step lag of a coarse step shows most here.
        tolerance: 0.25,
    },
    TurbulenceField: {
        behavior: () => new TurbulenceField(new Vector3(1, 1, 1), 2, new Vector3(2, 2, 2), new Vector3(0.5, 0.5, 0.5)),
        read: velocity,
        tolerance: 0.15,
    },
    ColorBySpeed: {
        behavior: () =>
            new ColorBySpeed(
                new Gradient([
                    [new Vector3(1, 0, 0), 0],
                    [new Vector3(0, 0, 1), 1],
                ]),
                new IntervalValue(0, 8)
            ),
        read: (p) => [p.color.x, p.color.z],
        // The speed comes from a force run first.
        companion: () => new ApplyForce(new Vector3(1, 0, 0), new ConstantValue(2)),
    },
    SizeBySpeed: {
        behavior: () => new SizeBySpeed(ramp(1, 3), new IntervalValue(0, 8)),
        read: (p) => [p.size.x],
        companion: () => new ApplyForce(new Vector3(1, 0, 0), new ConstantValue(2)),
    },
    RotationBySpeed: {
        behavior: () => new RotationBySpeed(new ConstantValue(2), new IntervalValue(0, 10)),
        read: (p) => [p.rotation as number],
    },
    LimitSpeedOverLife: {
        behavior: () => new LimitSpeedOverLife(ramp(2, 2), 0.5),
        read: velocity,
        tolerance: 0.05,
        seconds: 0.2,
    },
    SpeedOverLife: {
        behavior: () => new SpeedOverLife(ramp(1, 0.5)),
        read: (p) => [p.speedModifier],
    },
    SizeOverLife: {
        behavior: () => new SizeOverLife(ramp(1, 3)),
        read: (p) => [p.size.x, p.size.y, p.size.z],
    },
    ColorOverLife: {
        behavior: () =>
            new ColorOverLife(
                new Gradient(
                    [
                        [new Vector3(1, 0, 0), 0],
                        [new Vector3(0, 0, 1), 1],
                    ],
                    [
                        [1, 0],
                        [0, 1],
                    ]
                )
            ),
        read: (p) => [p.color.x, p.color.y, p.color.z, p.color.w],
        tolerance: 0.05,
    },
    FrameOverLife: {
        behavior: () => new FrameOverLife(ramp(0, 15)),
        read: (p) => [p.uvTile],
        tolerance: 0.05,
    },
};

function simulate(test: Case, rate: number, path: Path = 'update'): SpriteParticle {
    // Noise and TurbulenceField roll their fields at random; every run rolls the same ones.
    return withRandomSource(createSeededRandom(7), () => {
        const behaviors = test.companion ? [test.companion(), test.behavior()] : [test.behavior()];
        const particle = new SpriteParticle();
        particle.life = LIFE;
        particle.age = 0;
        particle.position.set(1, 0, 0);
        particle.velocity.set(4, 0, 0);
        particle.startSize.set(1, 1, 1);
        particle.size.set(1, 1, 1);
        particle.startColor.set(1, 1, 1, 1);
        particle.color.set(1, 1, 1, 1);
        if (test.quaternion) {
            particle.rotation = new Quaternion();
        }
        for (const behavior of behaviors) behavior.initialize(particle, system);

        // The order ParticleSystem steps in: behaviors, then motion, then age.
        const delta = 1 / rate;
        for (let step = 0; step < Math.round((test.seconds ?? SECONDS) * rate); step++) {
            for (const behavior of behaviors) {
                behavior.frameUpdate(delta);
                if (path === 'updateAll' && behavior.updateAll) {
                    behavior.updateAll([particle], 1, delta);
                } else {
                    behavior.update(particle, delta);
                }
            }
            particle.position.addScaledVector(particle.velocity, delta * particle.speedModifier);
            particle.age += delta;
        }
        return particle;
    });
}

describe('behaviors are frame-rate independent', () => {
    test('covers every behavior type, or says why not', () => {
        const missing = Object.keys(BehaviorTypes).filter((type) => !(type in CASES) && !(type in EXEMPT));
        expect(missing).toEqual([]);
    });

    describe.each(Object.keys(CASES))('%s', (name) => {
        const test_ = CASES[name];
        const tolerance = test_.tolerance ?? 0.02;
        const reference = test_.read(simulate(test_, REFERENCE_RATE));

        test('changes the state it is read on', () => {
            const idle: Case = {
                ...test_,
                behavior: () => new ApplyForce(new Vector3(0, 1, 0), new ConstantValue(0)),
            };
            expect(reference).not.toEqual(test_.read(simulate(idle, REFERENCE_RATE)));
        });

        test('lands closer to the reference as the step shrinks, unless already within a tenth of it', () => {
            const error = (rate: number) =>
                Math.max(...test_.read(simulate(test_, rate)).map((value, i) => Math.abs(value - reference[i])));
            const scale = Math.max(...reference.map(Math.abs));
            const close = Math.max(1e-3, scale * tolerance * 0.1);
            expect(error(RATES[RATES.length - 1])).toBeLessThanOrEqual(Math.max(error(RATES[0]) * 0.5, close));
        });

        test.each(RATES.flatMap((rate) => (['update', 'updateAll'] as Path[]).map((path) => [rate, path] as const)))(
            '%i Hz through %s matches the reference',
            (rate, path) => {
                const values = test_.read(simulate(test_, rate, path));
                values.forEach((value, i) => {
                    const allowed = Math.max(1e-3, Math.abs(reference[i]) * tolerance);
                    expect(Math.abs(value - reference[i])).toBeLessThanOrEqual(allowed);
                });
            }
        );
    });
});
