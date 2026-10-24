import {
    Bezier,
    createSeededRandom,
    GeneratorFromJSON,
    PiecewiseBezier,
    RandomBetweenCurves,
    ValueGeneratorFromJSON,
    withRandomSource,
} from '../../src';

/** A straight line from `from` at t = 0 to `to` at t = 1. */
const line = (from: number, to: number) =>
    new PiecewiseBezier([[new Bezier(from, from + (to - from) / 3, from + ((to - from) * 2) / 3, to), 0]]);

describe('RandomBetweenCurves', () => {
    it('keeps each particle the same fraction of the way between the curves at every t', () => {
        const generator = new RandomBetweenCurves(line(0, 10), line(2, 4));
        withRandomSource(createSeededRandom(3), () => {
            for (let i = 0; i < 50; i++) {
                const memory: number[] = [];
                generator.startGen(memory);
                const mix = memory[0];
                expect(mix).toBeGreaterThanOrEqual(0);
                expect(mix).toBeLessThan(1);
                for (const t of [0, 0.25, 0.5, 1]) {
                    const a = 10 * t;
                    const b = 2 + 2 * t;
                    expect(generator.genValue(memory, t)).toBeCloseTo(a + (b - a) * mix, 6);
                }
            }
        });
    });

    it('spreads particles over the whole band between the curves', () => {
        const generator = new RandomBetweenCurves(line(0, 0), line(1, 1));
        const values = withRandomSource(createSeededRandom(1), () =>
            Array.from({length: 2000}, () => {
                const memory: number[] = [];
                generator.startGen(memory);
                return generator.genValue(memory, 0.5);
            })
        );
        expect(Math.min(...values)).toBeLessThan(0.01);
        expect(Math.max(...values)).toBeGreaterThan(0.99);
        expect(values.filter((v) => v < 0.5).length / values.length).toBeCloseTo(0.5, 1);
    });

    it('claims its slot after what other generators claimed, and rolls on first read without startGen', () => {
        const generator = new RandomBetweenCurves(line(0, 0), line(1, 1));
        const memory = [0.123];
        generator.startGen(memory);
        expect(memory).toHaveLength(2);
        expect(generator.indexCount).toBe(1);
        const lazy = new RandomBetweenCurves(line(0, 0), line(1, 1));
        const fresh: number[] = [];
        const value = lazy.genValue(fresh, 0.3);
        expect(fresh).toHaveLength(1);
        expect(value).toBeCloseTo(fresh[0], 6);
    });

    it('reads the curves through their sampled tables once refreshed, as a single curve does', () => {
        const generator = new RandomBetweenCurves(line(0, 1), line(1, 3));
        generator.refreshTable();
        expect(generator.curve1.sampledTable()).not.toBeNull();
        expect(generator.curve2.sampledTable()).not.toBeNull();
        const memory = [0.5];
        generator.indexCount = 0;
        expect(generator.genValue(memory, 0.5)).toBeCloseTo((0.5 + 2) / 2, 3);
    });

    it('round-trips through JSON and clone, with copies of its curves', () => {
        const generator = new RandomBetweenCurves(line(0, 1), line(2, 5));
        const json = generator.toJSON();
        expect(json.type).toBe('RandomBetweenCurves');
        expect(ValueGeneratorFromJSON(json).toJSON()).toEqual(json);
        expect(GeneratorFromJSON(json).toJSON()).toEqual(json);
        expect(RandomBetweenCurves.fromJSON(json).toJSON()).toEqual(json);
        const copy = generator.clone();
        expect(copy.toJSON()).toEqual(json);
        expect(copy.curve1).not.toBe(generator.curve1);
        expect(copy.curve2).not.toBe(generator.curve2);
        expect(copy.type).toBe('function');
    });
});
