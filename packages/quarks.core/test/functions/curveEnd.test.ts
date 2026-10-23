/**
 * Curves and gradients outside 0…1: before the first key they hold the first value, past the last
 * key (and past 1) the last one, on the exact path as on the sampled table.
 */
import {Gradient, Vector3, Vector4} from '../../src';
import {ContinuousLinearFunction} from '../../src/functions/ContinuousLinearFunction';

const memory: never[] = [];

describe('ContinuousLinearFunction past its keys', () => {
    test('a number curve holds its last key past 1 and its first before 0', () => {
        const curve = new ContinuousLinearFunction<number>(
            [
                [0, 0],
                [5, 1],
            ],
            'Number'
        );
        expect(curve.genValue(0, 1)).toBe(5);
        expect(curve.genValue(0, 1.01)).toBe(5);
        expect(curve.genValue(0, 7)).toBe(5);
        expect(curve.genValue(0, -1)).toBe(0);
        expect(curve.genValue(0, 0.5)).toBe(2.5);
    });

    test('a three-key vector curve ends on its last key', () => {
        const curve = new ContinuousLinearFunction<Vector3>(
            [
                [new Vector3(0, 0, 0), 0],
                [new Vector3(1, 0, 0), 0.5],
                [new Vector3(0, 1, 0), 0.9],
            ],
            'Vector3'
        );
        const out = new Vector3();
        expect(curve.genValue(out, 0.95).y).toBe(1);
        expect(curve.genValue(out, 1.5).y).toBe(1);
        expect(curve.genValue(out, 0.7).x).toBeCloseTo(0.5, 9);
        expect(curve.genValue(out, -0.2).x).toBe(0);
    });

    test('a single key holds its value everywhere', () => {
        const curve = new ContinuousLinearFunction<number>([[3, 0.5]], 'Number');
        expect(curve.genValue(0, 0)).toBe(3);
        expect(curve.genValue(0, 0.5)).toBe(3);
        expect(curve.genValue(0, 2)).toBe(3);
    });
});

describe('Gradient past 1', () => {
    test('the exact path agrees with the sampled table at the end', () => {
        const gradient = new Gradient(
            [
                [new Vector3(1, 0, 0), 0],
                [new Vector3(0, 0, 1), 1],
            ],
            [
                [0, 0],
                [1, 1],
            ]
        );
        const exact = gradient.genColorExact(new Vector4(), 1.0001);
        expect([exact.x, exact.y, exact.z, exact.w]).toEqual([0, 0, 1, 1]);
        gradient.refreshTable();
        const table = gradient.genColor(memory, new Vector4(), 1.0001);
        expect([table.x, table.y, table.z, table.w]).toEqual([0, 0, 1, 1]);
    });
});
