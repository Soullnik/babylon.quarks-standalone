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
    IParticleSystem,
    LimitSpeedOverLife,
    Matrix4,
    Noise,
    OrbitOverLife,
    Particle,
    ParticleStore,
    PiecewiseBezier,
    RotationOverLife,
    SizeOverLife,
    SpeedOverLife,
    SpriteParticle,
    Vector3,
} from '../../src';

const makeSystem = (worldSpace = false) =>
    ({
        worldSpace,
        emitter: {matrixWorld: new Matrix4()},
    }) as unknown as IParticleSystem;

/**
 * Builds a fresh pool whose particles differ in age, position, velocity and
 * colour, so a behavior that mixes any of those up between the two paths shows
 * a difference.
 */
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
        particle.size.set(1, 1, 1);
        particle.startColor.set(1, 0.5, 0.25, 1);
        particle.color.set(1, 1, 1, 1);
        particle.rotation = i * 0.1;
        particle.speedModifier = 1;
        particle.uvTile = 0;
        particles.push(particle);
    }
    return particles;
}

/** Every mutable numeric field a behavior in this suite can touch. */
function snapshot(particles: Particle[]): number[] {
    const values: number[] = [];
    for (const particle of particles) {
        values.push(
            particle.position.x,
            particle.position.y,
            particle.position.z,
            particle.velocity.x,
            particle.velocity.y,
            particle.velocity.z,
            particle.size.x,
            particle.size.y,
            particle.size.z,
            particle.color.x,
            particle.color.y,
            particle.color.z,
            particle.color.w,
            particle.uvTile,
            particle.speedModifier,
            typeof particle.rotation === 'number' ? particle.rotation : 0
        );
    }
    return values;
}

const DELTA = 1 / 60;
const COUNT = 8;

const cases: Array<[string, () => Behavior]> = [
    ['ColorOverLife', () => new ColorOverLife(new Gradient())],
    ['SizeOverLife', () => new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.8, 0.4, 0), 0]]))],
    ['ApplyForce', () => new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(9.8))],
    ['RotationOverLife', () => new RotationOverLife(new ConstantValue(1.5))],
    ['FrameOverLife', () => new FrameOverLife(new PiecewiseBezier([[new Bezier(0, 1, 2, 3), 0]]))],
    ['SpeedOverLife', () => new SpeedOverLife(new PiecewiseBezier([[new Bezier(1, 0.7, 0.4, 0.2), 0]]))],
    ['GravityForce', () => new GravityForce(new Vector3(0, 5, 0), 4)],
    ['LimitSpeedOverLife', () => new LimitSpeedOverLife(new PiecewiseBezier([[new Bezier(2, 2, 2, 2), 0]]), 0.5)],
    ['OrbitOverLife', () => new OrbitOverLife(new ConstantValue(2), new Vector3(0, 1, 0))],
    ['ForceOverLife', () => new ForceOverLife(new ConstantValue(1), new ConstantValue(-2), new ConstantValue(0.5))],
    ['Noise', () => new Noise(new ConstantValue(2), new ConstantValue(1))],
];

describe('behavior updateAll matches the per-particle path', () => {
    for (const [name, create] of cases) {
        it(name, () => {
            const system = makeSystem();

            const singleBehavior = create();
            const singles = makePool(COUNT);
            for (const particle of singles) singleBehavior.initialize(particle, system);
            singleBehavior.frameUpdate(DELTA);
            for (const particle of singles) singleBehavior.update(particle, DELTA);

            const batchBehavior = create();
            expect(batchBehavior.updateAll).toBeDefined();
            const batched = makePool(COUNT);
            for (const particle of batched) batchBehavior.initialize(particle, system);
            batchBehavior.frameUpdate(DELTA);
            batchBehavior.updateAll!(batched, batched.length, DELTA);

            const expected = snapshot(singles);
            const actual = snapshot(batched);
            for (let i = 0; i < expected.length; i++) {
                // Noise picks random simplex generators per particle, so only the
                // deterministic behaviors can be compared value by value.
                if (name === 'Noise') {
                    expect(Number.isFinite(actual[i])).toBe(true);
                } else {
                    expect(actual[i]).toBeCloseTo(expected[i], 6);
                }
            }
        });
    }

    it('skips dead particles exactly like the per-particle path', () => {
        const behavior = new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(9.8));
        const particles = makePool(4);
        particles[1].age = particles[1].life; // dead
        const before = particles[1].velocity.y;
        behavior.frameUpdate(DELTA);
        behavior.updateAll!(particles, particles.length, DELTA);
        expect(particles[1].velocity.y).toBe(before);
        expect(particles[0].velocity.y).not.toBe(before);
    });

    it('leaves a particle sitting on the gravity centre alone instead of producing NaN', () => {
        const behavior = new GravityForce(new Vector3(0, 0, 0), 4);
        const particles = makePool(2);
        particles[0].position.set(0, 0, 0);
        particles[0].velocity.set(1, 1, 1);
        behavior.updateAll!(particles, particles.length, DELTA);
        expect(particles[0].velocity.x).toBe(1);

        const single = makePool(1);
        single[0].position.set(0, 0, 0);
        single[0].velocity.set(1, 1, 1);
        behavior.update(single[0], DELTA);
        expect(single[0].velocity.x).toBe(1);
    });
});
