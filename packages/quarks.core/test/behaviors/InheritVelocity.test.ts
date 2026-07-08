import {
    ConstantValue,
    IParticleSystem,
    InheritVelocity,
    Matrix4,
    SpriteParticle,
    Vector3,
} from '../../src';

const makePS = (worldSpace = false, emitterVelocity?: Vector3, matrixWorld = new Matrix4()) =>
    ({
        worldSpace,
        emitterVelocity,
        emitter: {matrixWorld},
    }) as unknown as IParticleSystem;

const makeParticle = () => {
    const particle = new SpriteParticle();
    particle.life = 1;
    particle.age = 0;
    return particle;
};

describe('InheritVelocity', () => {
    test('initial mode adds scaled emitter velocity to particle velocity at spawn', () => {
        const behavior = new InheritVelocity(new ConstantValue(0.5), 'initial');
        const ps = makePS(true, new Vector3(3, 0, 0));
        const particle = makeParticle();

        behavior.initialize(particle, ps);
        expect(particle.velocity.x).toBeCloseTo(1.5);

        const positionBefore = particle.position.clone();
        behavior.update(particle, 1);
        expect(particle.position.x).toBe(positionBefore.x);
    });

    test('initial mode converts emitter velocity into local space of a rotated emitter', () => {
        const behavior = new InheritVelocity(new ConstantValue(1), 'initial');
        const matrix = new Matrix4().makeRotationZ(Math.PI / 2);
        const ps = makePS(false, new Vector3(1, 0, 0), matrix);
        const particle = makeParticle();

        behavior.initialize(particle, ps);

        // world +X seen from an emitter rotated +90° about Z is local -Y
        expect(particle.velocity.x).toBeCloseTo(0);
        expect(particle.velocity.y).toBeCloseTo(-1);
    });

    test('current mode leaves velocity alone and displaces position each frame', () => {
        const behavior = new InheritVelocity(new ConstantValue(2), 'current');
        const ps = makePS(true, new Vector3(3, 0, 0));
        const particle = makeParticle();

        behavior.initialize(particle, ps);
        expect(particle.velocity.x).toBe(0);

        behavior.frameUpdate(0.5);
        behavior.update(particle, 0.5);
        expect(particle.position.x).toBeCloseTo(3);
    });

    test('missing emitterVelocity is a no-op', () => {
        const initial = new InheritVelocity(new ConstantValue(1), 'initial');
        const current = new InheritVelocity(new ConstantValue(1), 'current');
        const ps = makePS(true, undefined);
        const particle = makeParticle();

        initial.initialize(particle, ps);
        current.initialize(particle, ps);
        current.update(particle, 1);

        expect(particle.velocity.length()).toBe(0);
        expect(particle.position.length()).toBe(0);
    });

    test('.toJSON / .fromJSON round-trip', () => {
        const behavior = new InheritVelocity(new ConstantValue(0.25), 'current');
        const restored = InheritVelocity.fromJSON(behavior.toJSON()) as InheritVelocity;

        expect((restored.multiplier as ConstantValue).value).toBe(0.25);
        expect(restored.mode).toBe('current');
    });

    test('.fromJSON defaults: multiplier 1, mode initial', () => {
        const restored = InheritVelocity.fromJSON({type: 'InheritVelocity'}) as InheritVelocity;

        expect((restored.multiplier as ConstantValue).value).toBe(1);
        expect(restored.mode).toBe('initial');
    });

    test('.clone deep-copies the multiplier', () => {
        const behavior = new InheritVelocity(new ConstantValue(0.5), 'current');
        const cloned = behavior.clone() as InheritVelocity;

        expect(cloned.multiplier).not.toBe(behavior.multiplier);
        expect((cloned.multiplier as ConstantValue).value).toBe(0.5);
        expect(cloned.mode).toBe('current');
    });
});
