import {
    Bezier,
    ConstantValue,
    createSeededRandom,
    IntervalValue,
    Noise,
    PiecewiseBezier,
    RandomBetweenCurves,
    SpriteParticle,
    withRandomSource,
} from '../../src';

const flat = (value: number) => new PiecewiseBezier([[new Bezier(value, value, value, value), 0]]);

/**
 * Noise reads its settings per particle, so a random one (an interval, two curves) has to be
 * rolled into every particle, not only the first that reads it.
 */
describe.each([
    ['IntervalValue', () => new IntervalValue(0.5, 2)],
    ['RandomBetweenCurves', () => new RandomBetweenCurves(flat(0.5), flat(2))],
])('Noise with a random %s strength', (_name, power) => {
    it('rolls it for every particle, new or recycled', () => {
        withRandomSource(createSeededRandom(4), () => {
            const noise = new Noise(new ConstantValue(1), power(), power(), new ConstantValue(0.5));
            const particles = [0, 1, 2].map(() => {
                const p = new SpriteParticle();
                p.life = 1;
                p.age = 0.3;
                return p;
            });
            for (let round = 0; round < 2; round++) {
                for (const p of particles) {
                    p.memory.length = 0;
                    p.position.set(0, 0, 0);
                    noise.initialize(p);
                }
                noise.frameUpdate(1 / 60);
                for (const p of particles) noise.update(p, 1 / 60);
                for (const p of particles) {
                    expect(Number.isFinite(p.position.x)).toBe(true);
                    expect(Number.isFinite(p.position.y)).toBe(true);
                    expect(Number.isFinite(p.rotation as number)).toBe(true);
                }
            }
        });
    });
});
