import {Bezier} from '../../src';

describe('Bezier', () => {
    test('.toJSON', () => {
        const bezier = new Bezier(0, 0.25, 0.75, 1);
        const json = bezier.toJSON();
        expect(json.p0).toBe(0);
        expect(json.p1).toBe(0.25);
        expect(json.p2).toBe(0.75);
        expect(json.p3).toBe(1);
    });

    test('.fromJSON', () => {
        const bezier = Bezier.fromJSON({p0: 0, p1: 0.25, p2: 0.75, p3: 1});
        expect(bezier.p[0]).toBe(0);
        expect(bezier.p[1]).toBe(0.25);
        expect(bezier.p[2]).toBe(0.75);
        expect(bezier.p[3]).toBe(1);
    });
});

describe('Bezier.split', () => {
    test('splits at t into two curves that trace the original', () => {
        const bezier = new Bezier(0, 0.1, 0.9, 1);
        for (const t of [0.25, 0.5, 0.8]) {
            const {left, right, span} = bezier.split(t);
            expect(left.p[3]).toBeCloseTo(bezier.genValue(t));
            expect(right.p[0]).toBeCloseTo(bezier.genValue(t));
            expect(span).toHaveLength(10);
            for (const u of [0, 0.3, 0.7, 1]) {
                expect(left.genValue(u)).toBeCloseTo(bezier.genValue(u * t));
                expect(right.genValue(u)).toBeCloseTo(bezier.genValue(t + u * (1 - t)));
            }
        }
    });

    test('reads slopes and sets them', () => {
        const bezier = new Bezier(0, 0, 0, 1);
        bezier.controlCurve(3, 6);
        expect(bezier.getSlope(0)).toBeCloseTo(3);
        expect(bezier.getSlope(1)).toBeCloseTo(6);
        expect(bezier.derivativeCoefficients(bezier.p)).toHaveLength(3);
        expect(bezier.clone().p).toEqual(bezier.p);
    });
});
