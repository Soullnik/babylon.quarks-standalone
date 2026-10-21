import {
    ApplyForce,
    Behavior,
    Bezier,
    ColorOverLife,
    ConstantValue,
    ForceOverLife,
    FrameOverLife,
    Gradient,
    GravityForce,
    IntervalValue,
    IParticleSystem,
    LimitSpeedOverLife,
    Matrix4,
    OrbitOverLife,
    PiecewiseBezier,
    RotationBySpeed,
    RotationOverLife,
    SizeOverLife,
    SpeedOverLife,
    SpriteParticle,
    Vector3,
    VelocityOverLife,
} from '../../src';

/**
 * quarks.core does not fix the step: an engine may call `update` at 30, 60 or 144 Hz. A behavior
 * that changes something over time must reach the same state after one second whatever the step,
 * up to the error of a first-order step. Each case runs one particle for {@link SECONDS} at every
 * rate in {@link RATES} and compares the result with a fine-stepped reference.
 */
const SECONDS = 1;
const LIFE = 2;
const RATES = [30, 60, 120, 144];
const REFERENCE_RATE = 960;

const system = {
    worldSpace: false,
    emitter: {matrixWorld: new Matrix4()},
    emitterVelocity: undefined,
} as unknown as IParticleSystem;

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
}

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
        tolerance: 0.05,
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

function simulate(make: () => Behavior, rate: number, seconds = SECONDS): SpriteParticle {
    const behavior = make();
    const particle = new SpriteParticle();
    particle.life = LIFE;
    particle.age = 0;
    particle.position.set(1, 0, 0);
    particle.velocity.set(4, 0, 0);
    particle.startSize.set(1, 1, 1);
    particle.size.set(1, 1, 1);
    particle.startColor.set(1, 1, 1, 1);
    particle.color.set(1, 1, 1, 1);
    behavior.initialize(particle, system);

    // The order ParticleSystem steps in: behaviors, then motion, then age.
    const delta = 1 / rate;
    for (let step = 0; step < Math.round(seconds * rate); step++) {
        behavior.frameUpdate(delta);
        behavior.update(particle, delta);
        particle.position.addScaledVector(particle.velocity, delta * particle.speedModifier);
        particle.age += delta;
    }
    return particle;
}

describe('behaviors are frame-rate independent', () => {
    describe.each(Object.keys(CASES))('%s', (name) => {
        const {behavior, read, tolerance = 0.02, seconds} = CASES[name];
        const reference = read(simulate(behavior, REFERENCE_RATE, seconds));

        test('changes the state it is read on', () => {
            const idle = () => new ApplyForce(new Vector3(0, 1, 0), new ConstantValue(0));
            expect(reference).not.toEqual(read(simulate(idle, REFERENCE_RATE, seconds)));
        });

        test.each(RATES)('%i Hz matches the reference', (rate) => {
            const values = read(simulate(behavior, rate, seconds));
            values.forEach((value, i) => {
                const allowed = Math.max(1e-3, Math.abs(reference[i]) * tolerance);
                expect(Math.abs(value - reference[i])).toBeLessThanOrEqual(allowed);
            });
        });
    });
});
