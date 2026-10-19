import {
    createSeededRandom,
    getRandomSource,
    IntervalValue,
    random,
    RandomQuatGenerator,
    setRandomSource,
    SphereEmitter,
    withRandomSource,
} from '../../src';
import {SpriteParticle} from '../../src/Particle';

describe('random source', () => {
    afterEach(() => {
        setRandomSource(null);
    });

    it('draws from Math.random by default and from whatever source is set', () => {
        expect(getRandomSource()).toBe(Math.random);
        const previous = setRandomSource(() => 0.25);
        expect(previous).toBe(Math.random);
        expect(random()).toBe(0.25);
        setRandomSource(null);
        expect(getRandomSource()).toBe(Math.random);
    });

    it('seeded generators repeat their sequence and differ by seed', () => {
        const a = createSeededRandom(42);
        const b = createSeededRandom(42);
        const c = createSeededRandom(43);
        const first = Array.from({length: 8}, () => a());
        expect(Array.from({length: 8}, () => b())).toEqual(first);
        expect(Array.from({length: 8}, () => c())).not.toEqual(first);
        for (const v of first) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
        // Seed 0 is a seed like any other, not a broken generator.
        const zero = createSeededRandom(0);
        expect(new Set(Array.from({length: 8}, () => zero())).size).toBe(8);
    });

    it('restores the previous source after withRandomSource, even when the body throws', () => {
        const fixed = () => 0.5;
        expect(withRandomSource(fixed, () => random())).toBe(0.5);
        expect(getRandomSource()).toBe(Math.random);
        expect(() =>
            withRandomSource(fixed, () => {
                throw new Error('boom');
            })
        ).toThrow('boom');
        expect(getRandomSource()).toBe(Math.random);
    });

    it('reaches generators and shapes', () => {
        const roll = (seed: number) => {
            setRandomSource(createSeededRandom(seed));
            const memory: number[] = [];
            const interval = new IntervalValue(0, 10);
            interval.startGen(memory);
            const value = interval.genValue(memory);
            const quat = new RandomQuatGenerator();
            quat.startGen(memory);
            const particle = new SpriteParticle();
            new SphereEmitter({radius: 5}).initialize(particle, {
                isBursting: false,
                burstParticleIndex: 0,
                burstParticleCount: 0,
                burstIndex: 0,
                burstWaveIndex: 0,
                time: 0,
                waitEmiting: 0,
                travelDistance: 0,
            });
            return [value, particle.position.x, particle.position.y, particle.position.z, particle.velocity.x];
        };
        expect(roll(7)).toEqual(roll(7));
        expect(roll(7)).not.toEqual(roll(8));
    });
});
