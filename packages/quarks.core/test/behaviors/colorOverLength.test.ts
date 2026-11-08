import {ColorOverLength, Gradient, SpriteParticle, TrailParticle} from '../../src';

/** Opaque white at the head fading to transparent red at the tail. */
const fade = () =>
    new Gradient(
        [
            [{r: 1, g: 1, b: 1}, 0],
            [{r: 1, g: 0, b: 0}, 1],
        ],
        [
            [1, 0],
            [0, 1],
        ]
    );

/** A trail of `samples` samples, each recorded in mid grey. */
function trail(samples: number): TrailParticle {
    const particle = new TrailParticle();
    particle.length = samples;
    particle.ensureHistoryCapacity(samples);
    particle.historyCount = samples;
    particle.historyColors.fill(0.5);
    return particle;
}

describe('ColorOverLength', () => {
    test('multiplies each sample by the gradient, head to tail', () => {
        const particle = trail(10);
        const behavior = new ColorOverLength(fade());
        behavior.initialize(particle);
        behavior.update(particle);
        const tail = particle.getHistoryIndex(0) * 4;
        expect(particle.historyColors[tail]).toBeCloseTo(0.5, 6);
        expect(particle.historyColors[tail + 1]).toBeCloseTo(0, 6);
        expect(particle.historyColors[tail + 3]).toBeCloseTo(0, 6);
        const newest = particle.getHistoryIndex(9) * 4;
        expect(particle.historyColors[newest + 3]).toBeCloseTo(0.5 * 0.9, 6);
        // The head, recorded next, takes the gradient's start.
        expect(Array.from(particle.headColorScale)).toEqual([1, 1, 1, 1]);
    });

    test('scales the recorded colors, never what it wrote before', () => {
        const particle = trail(4);
        const behavior = new ColorOverLength(fade());
        behavior.initialize(particle);
        behavior.update(particle);
        const once = Array.from(particle.historyColors.subarray(0, 16));
        behavior.update(particle);
        expect(Array.from(particle.historyColors.subarray(0, 16))).toEqual(once);
        expect(Array.from(particle.historyBaseColors.subarray(0, 16))).toEqual(new Array(16).fill(0.5));
    });

    test('gives the head its factor before any sample is recorded', () => {
        const particle = trail(0);
        const behavior = new ColorOverLength(
            new Gradient([
                [{r: 0.25, g: 0.5, b: 1}, 0],
                [{r: 1, g: 1, b: 1}, 1],
            ])
        );
        behavior.initialize(particle);
        behavior.update(particle);
        expect(Array.from(particle.headColorScale)).toEqual([0.25, 0.5, 1, 1]);
        expect(particle.historyBaseColors.length).toBe(0);
    });

    test('a reset particle draws its head unscaled again', () => {
        const particle = trail(0);
        particle.headColorScale.fill(0.5);
        particle.reset();
        expect(Array.from(particle.headColorScale)).toEqual([1, 1, 1, 1]);
    });

    test('leaves particles that are not trails alone', () => {
        expect(() => new ColorOverLength(fade()).update(new SpriteParticle())).not.toThrow();
    });
});
