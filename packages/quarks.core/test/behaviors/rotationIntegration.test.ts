import {
    AxisAngleGenerator,
    Behavior,
    BehaviorFromJSON,
    BehaviorToJSON,
    Bezier,
    ConstantValue,
    Euler,
    EulerGenerator,
    IntervalValue,
    Particle,
    ParticleStore,
    PiecewiseBezier,
    planBehaviorFusion,
    Quaternion,
    Rotation3DOverLife,
    Rotation3DOverLifeJSON,
    SpriteParticle,
    Vector3,
} from '../../src';

const DEG = Math.PI / 180;

/** Unity's ZXY Euler as quarks' intrinsic order. */
const UNITY_ORDER = 'YXZ';

/** A pool of mesh particles (quaternion rotation) born at `start`, at life fraction 0. */
function meshPool(count: number, start: Quaternion, life = 5): SpriteParticle[] {
    const store = new ParticleStore(count);
    const particles: SpriteParticle[] = [];
    for (let i = 0; i < count; i++) {
        const particle = new SpriteParticle(store, i);
        particle.life = life;
        particle.age = 0;
        particle.rotation = start.clone();
        particles.push(particle);
    }
    return particles;
}

function unityRates(): EulerGenerator {
    return new EulerGenerator(
        new ConstantValue(10 * DEG),
        new ConstantValue(90 * DEG),
        new ConstantValue(20 * DEG),
        UNITY_ORDER
    );
}

const UNITY_START = new Quaternion().setFromEuler(new Euler(30 * DEG, 40 * DEG, 50 * DEG, UNITY_ORDER));

/** Steps every live particle through `behavior` alone, `steps` times. */
function run(behavior: Behavior, particles: Particle[], delta: number, steps: number): void {
    for (let s = 0; s < steps; s++) {
        behavior.frameUpdate(delta);
        for (const p of particles) if (p.age < p.life) behavior.update(p, delta);
        for (const p of particles) p.age += delta;
    }
}

/** Steps through the fusion plan, as a renderer does. */
function runPlan(behaviors: Behavior[], particles: Particle[], delta: number, steps: number): void {
    const plan = planBehaviorFusion(behaviors);
    for (let s = 0; s < steps; s++) {
        for (const step of plan) {
            for (const b of step.behaviors) b.frameUpdate(delta);
            if (step.run !== undefined) {
                step.run(behaviors, particles, particles.length, delta);
            } else {
                for (const p of particles) if (p.age < p.life) step.behaviors[0].update(p, delta);
            }
        }
        for (const p of particles) p.age += delta;
    }
}

function expectQuaternion(actual: Quaternion, wanted: {x: number; y: number; z: number; w: number}, digits = 3) {
    // q and -q are the same rotation.
    const sign = actual.x * wanted.x + actual.y * wanted.y + actual.z * wanted.z + actual.w * wanted.w < 0 ? -1 : 1;
    expect(sign * actual.x).toBeCloseTo(wanted.x, digits);
    expect(sign * actual.y).toBeCloseTo(wanted.y, digits);
    expect(sign * actual.z).toBeCloseTo(wanted.z, digits);
    expect(sign * actual.w).toBeCloseTo(wanted.w, digits);
}

describe("Rotation3DOverLife 'angles' integration", () => {
    it('matches Unity: start (30, 40, 50)°, rates (10, 90, 20)°/s, 0.5 s → (35, 85, 60)°', () => {
        for (const [delta, steps] of [
            [1 / 60, 30],
            [1 / 30, 15],
            [0.1, 5],
        ]) {
            const [particle] = meshPool(1, UNITY_START);
            const behavior = new Rotation3DOverLife(unityRates(), {integration: 'angles'});
            behavior.initialize(particle);
            run(behavior, [particle], delta, steps);
            // Measured in Unity 6: rotation3D (35, 85, 60) degrees.
            expectQuaternion(particle.rotation as Quaternion, {x: 0.5142, y: 0.4471, z: 0.1756, w: 0.7105});
        }
    });

    it("leaves the default, 'turn', composing turns about the particle's own axes", () => {
        const [particle] = meshPool(1, UNITY_START);
        const behavior = new Rotation3DOverLife(unityRates());
        expect(behavior.integration).toBe('turn');
        behavior.initialize(particle);
        const memoryBefore = particle.memory.length;
        run(behavior, [particle], 0.1, 5);
        // No angles kept.
        expect(particle.memory.length).toBe(memoryBefore);
        const step = new Quaternion().setFromEuler(new Euler(1 * DEG, 9 * DEG, 2 * DEG, UNITY_ORDER));
        const expected = UNITY_START.clone();
        for (let i = 0; i < 5; i++) expected.multiply(step);
        expectQuaternion(particle.rotation as Quaternion, expected, 5);
    });

    it("falls back to 'turn' for a generator that is not an Euler one, or an order quaternions do not convert", () => {
        const axisAngle = () => new AxisAngleGenerator(new Vector3(0, 1, 0), new ConstantValue(2));
        const angles = new Rotation3DOverLife(axisAngle(), {integration: 'angles'});
        const turn = new Rotation3DOverLife(axisAngle());
        expect(angles._integratesAngles()).toBe(false);
        const [a] = meshPool(1, UNITY_START);
        const [b] = meshPool(1, UNITY_START);
        angles.initialize(a);
        turn.initialize(b);
        run(angles, [a], 0.05, 4);
        run(turn, [b], 0.05, 4);
        expectQuaternion(a.rotation as Quaternion, b.rotation as Quaternion, 6);

        const proper = new EulerGenerator(new ConstantValue(1), new ConstantValue(0), new ConstantValue(0), 'XYX');
        expect(new Rotation3DOverLife(proper, {integration: 'angles'})._integratesAngles()).toBe(false);
    });

    it('turns a particle born before the angles were kept, instead of reading missing slots', () => {
        const behavior = new Rotation3DOverLife(unityRates());
        const [particle] = meshPool(1, UNITY_START);
        behavior.initialize(particle);
        behavior.integration = 'angles';
        const reference = new Rotation3DOverLife(unityRates());
        const [other] = meshPool(1, UNITY_START);
        reference.initialize(other);
        run(behavior, [particle], 0.1, 3);
        run(reference, [other], 0.1, 3);
        const rotation = particle.rotation as Quaternion;
        expect(Number.isFinite(rotation.w)).toBe(true);
        expectQuaternion(rotation, other.rotation as Quaternion, 6);
    });

    it('samples each axis rate at the life fraction, curves and random ranges included', () => {
        // y spins at a rate rising linearly from 0 to 1 rad/s over a 1 s life.
        const generator = new EulerGenerator(
            new IntervalValue(0.5, 0.5),
            new PiecewiseBezier([[new Bezier(0, 1 / 3, 2 / 3, 1), 0]]),
            new ConstantValue(0),
            UNITY_ORDER
        );
        const behavior = new Rotation3DOverLife(generator, {integration: 'angles'});
        const [particle] = meshPool(1, new Quaternion(), 1);
        behavior.initialize(particle);
        const delta = 0.01;
        run(behavior, [particle], delta, 50);
        // Right Riemann sum of t over (0, 0.5] in steps of 0.01: each step reads the rate at the
        // age it ends at, as Unity does.
        let y = 0;
        for (let i = 1; i <= 50; i++) y += i * delta * delta;
        const expected = new Quaternion().setFromEuler(new Euler(0.25, y, 0, UNITY_ORDER));
        expectQuaternion(particle.rotation as Quaternion, expected, 4);
    });

    it("writes each step's turn so that the previous rotation times it lands on the new one", () => {
        const [particle] = meshPool(1, UNITY_START);
        const behavior = new Rotation3DOverLife(unityRates(), {integration: 'angles'});
        behavior.initialize(particle);
        for (let s = 0; s < 10; s++) {
            const previous = (particle.rotation as Quaternion).clone();
            run(behavior, [particle], 1 / 30, 1);
            const turn = particle.angularVelocity as Quaternion;
            // The short way round, which the renderer's partial turn needs.
            expect(turn.w).toBeGreaterThanOrEqual(0);
            expectQuaternion(previous.multiply(turn), particle.rotation as Quaternion, 5);
            // Unit length, and a real turn rather than none.
            expect(turn.length()).toBeCloseTo(1, 5);
            expect(turn.w).toBeLessThan(1);
        }
    });

    it('takes the short way round when the birth quaternion has the other sign', () => {
        const start = UNITY_START.clone();
        start.set(-start.x, -start.y, -start.z, -start.w);
        const [particle] = meshPool(1, start);
        const behavior = new Rotation3DOverLife(unityRates(), {integration: 'angles'});
        behavior.initialize(particle);
        run(behavior, [particle], 1 / 30, 1);
        expect((particle.angularVelocity as Quaternion).w).toBeGreaterThan(0.99);
    });

    it('gives the same rotations and turns through the fused pass as through update', () => {
        const generator = () =>
            new EulerGenerator(
                new IntervalValue(0.2, 1.4),
                new ConstantValue(3),
                new PiecewiseBezier([[new Bezier(1, 0.5, 0, -1), 0]]),
                UNITY_ORDER
            );
        const build = () => [new Rotation3DOverLife(generator(), {integration: 'angles'})];
        const fusedBehaviors = build();
        const separateBehaviors = build();
        expect(planBehaviorFusion(fusedBehaviors)[0].run).toBeDefined();
        const count = 6;
        const fused = meshPool(count, UNITY_START, 2);
        const separate = meshPool(count, UNITY_START, 2);
        for (let i = 0; i < count; i++) {
            const rotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0.5, -0.25).normalize(), i * 0.7);
            (fused[i].rotation as Quaternion).copy(rotation);
            (separate[i].rotation as Quaternion).copy(rotation);
            fused[i].age = separate[i].age = i * 0.1;
            // Same per-particle samples on both sides.
            fusedBehaviors[0].initialize(fused[i]);
            separateBehaviors[0].initialize(separate[i]);
            separate[i].memory = fused[i].memory.slice();
            fused[i].store.recordMemory(i, fused[i].memory);
        }
        runPlan(fusedBehaviors, fused, 1 / 60, 20);
        run(separateBehaviors[0], separate, 1 / 60, 20);
        for (let i = 0; i < count; i++) {
            expectQuaternion(fused[i].rotation as Quaternion, separate[i].rotation as Quaternion, 6);
            expectQuaternion(fused[i].angularVelocity as Quaternion, separate[i].angularVelocity as Quaternion, 6);
            expect(fused[i].memory).toEqual(separate[i].memory);
        }
        // ...and the particles did turn.
        expect(Math.abs((fused[0].rotation as Quaternion).w)).toBeLessThan(0.99);
    });

    it('writes the integration only when it is not the default, and keeps it through JSON and clone', () => {
        const angles = new Rotation3DOverLife(unityRates(), {integration: 'angles'});
        const json = JSON.parse(JSON.stringify(angles.toJSON())) as Rotation3DOverLifeJSON;
        expect(json.integration).toBe('angles');
        expect((BehaviorFromJSON(json, {} as never) as Rotation3DOverLife).integration).toBe('angles');
        expect((angles.clone() as Rotation3DOverLife).integration).toBe('angles');
        expect(BehaviorToJSON(angles, {} as never)).toHaveProperty('integration', 'angles');

        const turn = new Rotation3DOverLife(unityRates());
        expect(turn.toJSON()).not.toHaveProperty('integration');
        expect((turn.clone() as Rotation3DOverLife).integration).toBe('turn');
        const unknown = {...turn.toJSON(), integration: 'sideways'} as unknown as Rotation3DOverLifeJSON;
        expect((Rotation3DOverLife.fromJSON(unknown) as Rotation3DOverLife).integration).toBe('turn');
    });
});
