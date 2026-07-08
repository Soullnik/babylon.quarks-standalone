import {
    Bezier,
    ConstantValue,
    IParticleSystem,
    Matrix4,
    PiecewiseBezier,
    SpriteParticle,
    VelocityOverLife,
    Vector3,
} from '../../src';

const makePS = (worldSpace = false, matrixWorld = new Matrix4()) =>
    ({
        worldSpace,
        emitter: {matrixWorld},
    }) as unknown as IParticleSystem;

const makeParticle = () => {
    const particle = new SpriteParticle();
    particle.life = 1;
    particle.age = 0;
    return particle;
};

describe('VelocityOverLife', () => {
    test('constant linear velocity displaces position without touching velocity', () => {
        const behavior = new VelocityOverLife(new ConstantValue(0), new ConstantValue(2), new ConstantValue(0));
        const ps = makePS(false);
        const particle = makeParticle();
        particle.velocity.set(1, 0, 0);

        behavior.initialize(particle, ps);
        behavior.frameUpdate(0.5);
        behavior.update(particle, 0.5);

        expect(particle.position.y).toBeCloseTo(1);
        expect(particle.velocity.x).toBe(1);
        expect(particle.velocity.y).toBe(0);
    });

    test('world-space velocity is converted into local space of a rotated emitter', () => {
        const behavior = new VelocityOverLife(
            new ConstantValue(1),
            new ConstantValue(0),
            new ConstantValue(0),
            new ConstantValue(0),
            new ConstantValue(0),
            new ConstantValue(0),
            'world'
        );
        const matrix = new Matrix4().makeRotationZ(Math.PI / 2);
        const ps = makePS(false, matrix);
        const particle = makeParticle();

        behavior.initialize(particle, ps);
        behavior.frameUpdate(1);
        behavior.update(particle, 1);

        // world +X seen from an emitter rotated +90° about Z is local -Y
        expect(particle.position.x).toBeCloseTo(0);
        expect(particle.position.y).toBeCloseTo(-1);
    });

    test('local-space velocity is converted into world space when the system is world-space', () => {
        const behavior = new VelocityOverLife(new ConstantValue(1), new ConstantValue(0), new ConstantValue(0));
        const matrix = new Matrix4().makeRotationZ(Math.PI / 2);
        const ps = makePS(true, matrix);
        const particle = makeParticle();

        behavior.initialize(particle, ps);
        behavior.frameUpdate(1);
        behavior.update(particle, 1);

        // local +X of an emitter rotated +90° about Z is world +Y
        expect(particle.position.x).toBeCloseTo(0);
        expect(particle.position.y).toBeCloseTo(1);
    });

    test('curve velocity is sampled at age/life', () => {
        const curve = new PiecewiseBezier([[new Bezier(0, 0, 4, 4), 0]]);
        const behavior = new VelocityOverLife(curve, new ConstantValue(0), new ConstantValue(0));
        const ps = makePS(false);
        const particle = makeParticle();
        particle.age = 0.5;

        behavior.initialize(particle, ps);
        behavior.frameUpdate(1);
        behavior.update(particle, 1);

        expect(particle.position.x).toBeCloseTo(curve.genValue(particle.memory, 0.5));
    });

    test('orbital Y rotates the particle around the emitter axis', () => {
        const behavior = new VelocityOverLife(
            new ConstantValue(0),
            new ConstantValue(0),
            new ConstantValue(0),
            new ConstantValue(0),
            new ConstantValue(Math.PI / 2),
            new ConstantValue(0)
        );
        const ps = makePS(false);
        const particle = makeParticle();
        particle.position.set(1, 0, 0);

        behavior.initialize(particle, ps);
        behavior.frameUpdate(1);
        behavior.update(particle, 1);

        // 90° around +Y takes +X to -Z (right-handed)
        expect(particle.position.x).toBeCloseTo(0);
        expect(particle.position.y).toBeCloseTo(0);
        expect(particle.position.z).toBeCloseTo(-1);
    });

    test('orbital rotation in world space pivots around the emitter position', () => {
        const behavior = new VelocityOverLife(
            new ConstantValue(0),
            new ConstantValue(0),
            new ConstantValue(0),
            new ConstantValue(0),
            new ConstantValue(Math.PI),
            new ConstantValue(0)
        );
        const matrix = new Matrix4().setPosition(new Vector3(10, 0, 0));
        const ps = makePS(true, matrix);
        const particle = makeParticle();
        particle.position.set(11, 0, 0);

        behavior.initialize(particle, ps);
        behavior.frameUpdate(1);
        behavior.update(particle, 1);

        // 180° around the emitter at (10,0,0) takes (11,0,0) to (9,0,0)
        expect(particle.position.x).toBeCloseTo(9);
        expect(particle.position.z).toBeCloseTo(0);
    });

    test('.toJSON / .fromJSON round-trip', () => {
        const behavior = new VelocityOverLife(
            new ConstantValue(1),
            new ConstantValue(2),
            new ConstantValue(3),
            new ConstantValue(4),
            new ConstantValue(5),
            new ConstantValue(6),
            'world'
        );
        const restored = VelocityOverLife.fromJSON(behavior.toJSON()) as VelocityOverLife;

        expect((restored.linearY as ConstantValue).value).toBe(2);
        expect((restored.orbitalZ as ConstantValue).value).toBe(6);
        expect(restored.space).toBe('world');
    });

    test('.fromJSON of legacy JSON without orbital fields defaults them to 0 and space to local', () => {
        const restored = VelocityOverLife.fromJSON({
            type: 'VelocityOverLife',
            linearX: {type: 'ConstantValue', value: 1},
            linearY: {type: 'ConstantValue', value: 0},
            linearZ: {type: 'ConstantValue', value: 0},
        }) as VelocityOverLife;

        expect((restored.orbitalX as ConstantValue).value).toBe(0);
        expect(restored.space).toBe('local');
    });

    test('.clone deep-copies generators', () => {
        const behavior = new VelocityOverLife(new ConstantValue(1), new ConstantValue(2), new ConstantValue(3));
        const cloned = behavior.clone() as VelocityOverLife;

        expect(cloned.linearX).not.toBe(behavior.linearX);
        expect((cloned.linearX as ConstantValue).value).toBe(1);
        expect(cloned.space).toBe('local');
    });
});
