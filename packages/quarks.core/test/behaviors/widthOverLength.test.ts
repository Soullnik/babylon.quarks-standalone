import {Bezier, PiecewiseBezier, SpriteParticle, TrailParticle, WidthOverLength} from '../../src';

/** A ramp from 1 at the head to 2 at the tail; a Bezier extrapolates past t = 1. */
const ramp = () => new PiecewiseBezier([[new Bezier(1, 4 / 3, 5 / 3, 2), 0]]);

function trail(length: number, samples: number): TrailParticle {
    const particle = new TrailParticle();
    particle.length = length;
    particle.ensureHistoryCapacity(Math.max(1, Math.ceil(length)));
    particle.historyCount = Math.min(samples, particle.historyCapacity);
    particle.historyBaseSizes.fill(1);
    return particle;
}

describe('WidthOverLength', () => {
    test.each([
        ['a fractional length', 10.5, 11],
        ['a zero length', 0, 1],
    ])('stays on its curve for %s', (_name, length, samples) => {
        const particle = trail(length, samples);
        const behavior = new WidthOverLength(ramp());
        behavior.initialize(particle);
        behavior.update(particle);
        for (let i = 0; i < particle.historyCount; i++) {
            const width = particle.historySizes[particle.getHistoryIndex(i)];
            expect(Number.isFinite(width)).toBe(true);
            expect(width).toBeGreaterThanOrEqual(1);
            expect(width).toBeLessThanOrEqual(2 + 1e-9);
        }
    });

    test('reaches the tail of the curve at the oldest sample of a whole length', () => {
        const particle = trail(10, 10);
        const behavior = new WidthOverLength(ramp());
        behavior.initialize(particle);
        behavior.update(particle);
        expect(particle.historySizes[particle.getHistoryIndex(0)]).toBeCloseTo(2, 6);
    });

    test('leaves particles that are not trails alone', () => {
        expect(() => new WidthOverLength(ramp()).update(new SpriteParticle())).not.toThrow();
    });
});
