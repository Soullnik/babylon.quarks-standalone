import {ConstantValue, ForceOverLife, IParticleSystem, Matrix4, ParticleStore, SpriteParticle} from '../../src';

const makeSystem = (worldSpace = false) =>
    ({
        worldSpace,
        emitter: {matrixWorld: new Matrix4()},
    }) as unknown as IParticleSystem;

describe('ForceOverLife', () => {
    const makeBehavior = () =>
        new ForceOverLife(new ConstantValue(1), new ConstantValue(-2), new ConstantValue(0.5));

    it('updateAll tolerates a system that has not spawned a particle yet', () => {
        // The behavior only learns its system in initialize(), which never runs
        // while the system is empty — as happens for a sub emitter waiting to be
        // triggered. updateAll still runs every frame.
        const behavior = makeBehavior();
        expect(() => behavior.updateAll!([], 0, 1 / 60)).not.toThrow();
    });

    it('updateAll tolerates particles that this behavior never initialized', () => {
        // A behavior added with addBehavior() after particles already exist has
        // no system either, and its particles never went through initialize().
        const behavior = makeBehavior();
        const store = new ParticleStore(2);
        const particles = [new SpriteParticle(store, 0), new SpriteParticle(store, 1)];
        for (const particle of particles) {
            particle.life = 1;
            particle.age = 0.5;
        }
        expect(() => behavior.updateAll!(particles, particles.length, 1 / 60)).not.toThrow();
    });

    it('applies the force once the system is known', () => {
        const behavior = makeBehavior();
        const system = makeSystem(true);
        const store = new ParticleStore(1);
        const particle = new SpriteParticle(store, 0);
        particle.life = 1;
        particle.age = 0.5;
        behavior.initialize(particle, system);
        behavior.frameUpdate(1 / 60);
        behavior.updateAll!([particle], 1, 1 / 60);
        expect(particle.velocity.x).toBeCloseTo(1 / 60, 6);
        expect(particle.velocity.y).toBeCloseTo(-2 / 60, 6);
        expect(particle.velocity.z).toBeCloseTo(0.5 / 60, 6);
    });
});
