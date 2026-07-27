import {Bezier, PiecewiseBezier} from '../../src';

describe('PiecewiseBezier', () => {
    test('.toJSON', () => {
        const piecewiseBezier = new PiecewiseBezier([[new Bezier(1, 0.95, 0.75, 0), 0]]);
        const json = piecewiseBezier.toJSON();
        expect(json.type).toBe('PiecewiseBezier');
        expect(json.functions.length).toBe(1);
        expect(json.functions[0].function.p0).toBe(1);
        expect(json.functions[0].function.p1).toBe(0.95);
        expect(json.functions[0].function.p2).toBe(0.75);
        expect(json.functions[0].function.p3).toBe(0);
    });

    test('.fromJSON', () => {
        const piecewiseBezier = new PiecewiseBezier([[new Bezier(1, 0.95, 0.75, 0), 0]]);
        const json = piecewiseBezier.toJSON();
        const piecewiseBezier2 = PiecewiseBezier.fromJSON(json);
        expect(piecewiseBezier2.functions.length).toBe(1);
        expect(piecewiseBezier2.functions[0][1]).toBe(0);
        expect(piecewiseBezier2.functions[0][0].p[0]).toBe(1);
        expect(piecewiseBezier2.functions[0][0].p[1]).toBe(0.95);
        expect(piecewiseBezier2.functions[0][0].p[2]).toBe(0.75);
        expect(piecewiseBezier2.functions[0][0].p[3]).toBe(0);
    });

    test('clamps before the first key instead of returning zero', () => {
        const piecewiseBezier = new PiecewiseBezier([
            [new Bezier(0.85625, 0.85625, 1, 1), 0.0034129619598388672],
            [new Bezier(1, 1, 0.85625, 0.85625), 0.5051194429397583],
        ]);
        expect(piecewiseBezier.genValue([], 0)).toBeCloseTo(0.85625, 5);
        expect(piecewiseBezier.genValue([], 1)).toBeCloseTo(0.85625, 5);
    });
});
