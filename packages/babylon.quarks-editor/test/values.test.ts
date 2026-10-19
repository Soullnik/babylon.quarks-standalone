import {Bezier, ConstantValue, IntervalValue, PiecewiseBezier} from 'babylon.quarks';
import {
    buildCurve,
    buildScalar,
    mergePieces,
    readPieces,
    readScalar,
    sampleCurve,
    splitPieces,
} from '../src/core/values';

describe('scalar values', () => {
    it('reads each generator kind into its editable state', () => {
        expect(readScalar(new ConstantValue(2))).toMatchObject({mode: 'constant', value: 2, min: 1, max: 3});
        expect(readScalar(new IntervalValue(1, 3))).toMatchObject({mode: 'random', min: 1, max: 3, value: 2});
        const curve = readScalar(new PiecewiseBezier([[new Bezier(0.2, 0.8, 0.9, 0.1), 0]]));
        expect(curve.mode).toBe('curve');
        expect(curve.curve).toEqual([0.2, 0.8, 0.9, 0.1]);
        expect(curve.value).toBe(0.2);
        expect(readScalar(undefined).mode).toBe('constant');
    });

    it('builds generators back, ordering a reversed random range', () => {
        expect(buildScalar({mode: 'constant', value: 4, min: 0, max: 0, curve: [0, 0, 0, 0]})).toBeInstanceOf(
            ConstantValue
        );
        const random = buildScalar({mode: 'random', value: 0, min: 5, max: 2, curve: [0, 0, 0, 0]}) as IntervalValue;
        expect([random.a, random.b]).toEqual([2, 5]);
        const curve = buildScalar({
            mode: 'curve',
            value: 0,
            min: 0,
            max: 0,
            curve: [1, 0.5, 0.5, 0],
        }) as PiecewiseBezier;
        expect(curve).toBeInstanceOf(PiecewiseBezier);
        expect(readScalar(curve).curve).toEqual([1, 0.5, 0.5, 0]);
    });

    it('round-trips a state through build and read', () => {
        for (const generator of [new ConstantValue(0.7), new IntervalValue(0.2, 0.9)]) {
            const state = readScalar(generator);
            expect(readScalar(buildScalar(state))).toEqual(state);
        }
    });
});

describe('curve pieces', () => {
    const pieces = () => [
        {start: 0, p: [0, 0.5, 0.5, 1] as [number, number, number, number]},
        {start: 0.5, p: [1, 1, 1, 0] as [number, number, number, number]},
    ];

    it('reads pieces from a multi-segment curve and synthesises one for other generators', () => {
        const read = readPieces(buildCurve(pieces()));
        expect(read).toEqual(pieces());
        expect(readPieces(new ConstantValue(3))).toHaveLength(1);
        expect(readPieces(undefined)[0].start).toBe(0);
    });

    it('sorts pieces by start when building', () => {
        const curve = buildCurve([...pieces()].reverse());
        expect(curve.functions.map(([, start]) => start)).toEqual([0, 0.5]);
    });

    it('splits a piece in two at x without changing the curve, and merges them back', () => {
        const before = buildCurve(pieces());
        const split = splitPieces(pieces(), 0.25);
        expect(split).toHaveLength(3);
        expect(split[1].start).toBe(0.25);
        const after = buildCurve(split);
        for (const t of [0.05, 0.2, 0.3, 0.45, 0.7, 0.95]) {
            expect(after.genValue([], t)).toBeCloseTo(before.genValue([], t), 6);
        }
        // Too close to a boundary: nothing happens.
        expect(splitPieces(pieces(), 0.51)).toHaveLength(2);
        const merged = mergePieces(split, 1);
        expect(merged).toHaveLength(2);
        expect(merged[0].start).toBe(0);
        expect(merged[1].start).toBe(0.5);
        expect(mergePieces(split, 0)).toBe(split);
        expect(mergePieces(split, 3)).toBe(split);
    });

    it('samples a cubic bezier at its ends and middle', () => {
        expect(sampleCurve([0, 1, 1, 0], 0)).toBe(0);
        expect(sampleCurve([0, 1, 1, 0], 1)).toBe(0);
        expect(sampleCurve([0, 1, 1, 0], 0.5)).toBeCloseTo(0.75, 6);
        expect(sampleCurve([2, 2, 2, 2], 0.3)).toBeCloseTo(2, 6);
    });
});
