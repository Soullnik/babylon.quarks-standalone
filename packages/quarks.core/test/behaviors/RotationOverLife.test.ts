import {
    Behavior,
    ColorOverLife,
    ConstantValue,
    Gradient,
    Particle,
    ParticleStore,
    planBehaviorFusion,
    Quaternion,
    RotationOverLife,
    SpriteParticle,
    Vector3,
} from '../../src';

const DELTA = 1 / 60;
const RATE = 3;

function meshParticle(store: ParticleStore, index: number, start: Quaternion): SpriteParticle {
    const particle = new SpriteParticle(store, index);
    particle.life = 2;
    particle.age = 0.5;
    particle.rotation = start.clone();
    return particle;
}

/** The rotation a mesh particle starting at `start` should have after `steps` steps about its own Z. */
function expected(start: Quaternion, steps: number): Quaternion {
    return start.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), RATE * DELTA * steps));
}

function expectQuaternion(actual: Quaternion, wanted: Quaternion): void {
    expect(actual.x).toBeCloseTo(wanted.x, 6);
    expect(actual.y).toBeCloseTo(wanted.y, 6);
    expect(actual.z).toBeCloseTo(wanted.z, 6);
    expect(actual.w).toBeCloseTo(wanted.w, 6);
}

const START = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.7);

describe('RotationOverLife on mesh particles', () => {
    it('turns a quaternion rotation about the particle’s local Z', () => {
        const behavior = new RotationOverLife(new ConstantValue(RATE));
        const particle = meshParticle(new ParticleStore(1), 0, START);
        behavior.initialize(particle);
        for (let i = 0; i < 10; i++) behavior.update(particle, DELTA);
        expectQuaternion(particle.rotation as Quaternion, expected(START, 10));
    });

    it('keeps the step on the particle for the renderer', () => {
        const behavior = new RotationOverLife(new ConstantValue(RATE));
        const particle = meshParticle(new ParticleStore(1), 0, START);
        behavior.initialize(particle);
        behavior.update(particle, DELTA);
        expect(particle.angularVelocity).toBeInstanceOf(Quaternion);
        expectQuaternion(
            particle.angularVelocity as Quaternion,
            new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), RATE * DELTA)
        );
    });

    it('does the same in updateAll and in a fused pass', () => {
        const store = new ParticleStore(2);
        const a = meshParticle(store, 0, START);
        const b = meshParticle(store, 1, START);

        const own = new RotationOverLife(new ConstantValue(RATE));
        own.initialize(a);
        own.updateAll([a], 1, DELTA);
        expectQuaternion(a.rotation as Quaternion, expected(START, 1));

        // Paired with another fusable behavior so the plan compiles a pass.
        const behaviors: Behavior[] = [
            new ColorOverLife(new Gradient()),
            new RotationOverLife(new ConstantValue(RATE)),
        ];
        behaviors.forEach((behavior) => behavior.initialize(b, undefined as never));
        const steps = planBehaviorFusion(behaviors);
        expect(steps).toHaveLength(1);
        expect(steps[0].run).toBeDefined();
        steps[0].run!(behaviors, [b] as Particle[], 1, DELTA);
        expectQuaternion(b.rotation as Quaternion, expected(START, 1));
        expect(b.angularVelocity).toBeInstanceOf(Quaternion);
    });

    it('still turns a billboard by its angle', () => {
        const behavior = new RotationOverLife(new ConstantValue(RATE));
        const particle = new SpriteParticle(new ParticleStore(1), 0);
        particle.life = 2;
        particle.rotation = 0.25;
        behavior.initialize(particle);
        behavior.update(particle, DELTA);
        expect(particle.rotation).toBeCloseTo(0.25 + RATE * DELTA, 6);
        expect(particle.angularVelocity).toBe(RATE);
    });
});
