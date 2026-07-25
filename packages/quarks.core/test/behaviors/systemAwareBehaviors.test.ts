import {
    Behavior,
    ConstantValue,
    ForceOverLife,
    InheritVelocity,
    IParticleSystem,
    Matrix4,
    ParticleStore,
    SpriteParticle,
    VelocityOverLife,
} from '../../src';

const makeSystem = (worldSpace = false) =>
    ({
        worldSpace,
        emitter: {matrixWorld: new Matrix4()},
        emitterVelocity: undefined,
    }) as unknown as IParticleSystem;

/**
 * Behaviors that only learn their particle system in `initialize`. Each one
 * used to dereference it unguarded in `update`, so a system that had not
 * emitted yet — a sub emitter waiting to be triggered — threw
 * "Cannot read properties of undefined". Their `frameUpdate` already guarded,
 * which is the tell.
 */
const cases: Array<[string, () => Behavior]> = [
    ['ForceOverLife', () => new ForceOverLife(new ConstantValue(1), new ConstantValue(-2), new ConstantValue(0.5))],
    ['InheritVelocity', () => new InheritVelocity(new ConstantValue(1), 'current')],
    [
        'VelocityOverLife',
        () =>
            new VelocityOverLife(
                new ConstantValue(1),
                new ConstantValue(2),
                new ConstantValue(3),
                new ConstantValue(0.5),
                new ConstantValue(0),
                new ConstantValue(0),
                'world'
            ),
    ],
];

function makeParticles(count: number): SpriteParticle[] {
    const store = new ParticleStore(count);
    const particles: SpriteParticle[] = [];
    for (let i = 0; i < count; i++) {
        const particle = new SpriteParticle(store, i);
        particle.life = 1;
        particle.age = 0.5;
        particles.push(particle);
    }
    return particles;
}

describe('behaviors that learn their system in initialize', () => {
    for (const [name, create] of cases) {
        describe(name, () => {
            it('survives frameUpdate before any particle exists', () => {
                const behavior = create();
                expect(() => behavior.frameUpdate(1 / 60)).not.toThrow();
            });

            it('survives updateAll on an empty pool', () => {
                const behavior = create();
                behavior.frameUpdate(1 / 60);
                expect(() => {
                    if (behavior.updateAll !== undefined) {
                        behavior.updateAll([], 0, 1 / 60);
                    }
                }).not.toThrow();
            });

            it('survives particles it never initialized', () => {
                // A behavior appended with addBehavior() after particles already
                // exist never runs initialize for them, so it has no system.
                const behavior = create();
                const particles = makeParticles(2);
                behavior.frameUpdate(1 / 60);
                expect(() => {
                    for (const particle of particles) {
                        behavior.update(particle, 1 / 60);
                    }
                }).not.toThrow();
            });

            it('still applies once the system is known', () => {
                const behavior = create();
                const system = makeSystem(true);
                const particles = makeParticles(1);
                for (const particle of particles) {
                    behavior.initialize(particle, system);
                }
                behavior.frameUpdate(1 / 60);
                expect(() => behavior.update(particles[0], 1 / 60)).not.toThrow();
                expect((behavior as {ps?: IParticleSystem}).ps).toBe(system);
            });
        });
    }
});
