import {Bezier, MathUtils, PiecewiseBezier, RandomBetweenCurves} from '../../src';

describe('RandomBetweenCurves', () => {
    test('lerps between two curves with a stable spawn factor', () => {
        const a = new PiecewiseBezier([[new Bezier(0, 0, 0, 0), 0]]);
        const b = new PiecewiseBezier([[new Bezier(10, 10, 10, 10), 0]]);
        const gen = new RandomBetweenCurves(a, b);
        const memory: number[] = [];
        const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.25);

        gen.startGen(memory);
        expect(gen.genValue(memory, 0)).toBeCloseTo(MathUtils.lerp(0, 10, 0.25));
        expect(gen.genValue(memory, 0.5)).toBeCloseTo(MathUtils.lerp(0, 10, 0.25));
        expect(gen.genValue(memory, 1)).toBeCloseTo(MathUtils.lerp(0, 10, 0.25));

        randomSpy.mockRestore();
    });

    test('toJSON / fromJSON round-trip', () => {
        const original = new RandomBetweenCurves(
            new PiecewiseBezier([[new Bezier(0, 0.25, 0.75, 1), 0]]),
            new PiecewiseBezier([[new Bezier(2, 2.25, 2.75, 3), 0]])
        );
        const json = original.toJSON();
        expect(json.type).toBe('RandomBetweenCurves');

        const restored = RandomBetweenCurves.fromJSON(json);
        const memory: number[] = [];
        jest.spyOn(Math, 'random').mockReturnValue(0);
        restored.startGen(memory);
        expect(restored.genValue(memory, 0)).toBeCloseTo(0);
        expect(restored.genValue(memory, 1)).toBeCloseTo(1);
        jest.restoreAllMocks();
    });

    test('clone is independent', () => {
        const original = new RandomBetweenCurves(
            new PiecewiseBezier([[new Bezier(0, 0, 0, 0), 0]]),
            new PiecewiseBezier([[new Bezier(1, 1, 1, 1), 0]])
        );
        const cloned = original.clone() as RandomBetweenCurves;
        expect(cloned).not.toBe(original);
        expect(cloned.a).not.toBe(original.a);
        expect(cloned.toJSON()).toEqual(original.toJSON());
    });
});
