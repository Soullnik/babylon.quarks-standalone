import {Bezier, Gradient, PiecewiseBezier, Vector3, Vector4} from '../../src';

const memory: never[] = [];

/** Largest |table - exact| over a fine sweep of t. */
function maxError(sample: (t: number) => number, exact: (t: number) => number): number {
    let worst = 0;
    for (let i = 0; i <= 2000; i++) {
        const t = i / 2000;
        const error = Math.abs(sample(t) - exact(t));
        if (error > worst) worst = error;
    }
    return worst;
}

describe('sampled curve tables', () => {
    it('matches PiecewiseBezier closely enough to be invisible', () => {
        const curves: Array<[Bezier, number]> = [
            [new Bezier(0, 1, 0.2, 1), 0],
            [new Bezier(1, 0.1, 0.9, 0), 0.5],
        ];
        const curve = new PiecewiseBezier(curves.map(([b, s]) => [b.clone(), s]));
        const reference = new PiecewiseBezier(curves.map(([b, s]) => [b.clone(), s]));
        curve.refreshTable();

        const error = maxError(
            (t) => curve.genValue(memory, t),
            (t) => reference.genValue(memory, t)
        );
        // Sizes and frame indices are driven by these curves; 1e-3 is well under
        // anything a rendered particle can show.
        expect(error).toBeLessThan(1e-3);
        // Endpoints are sampled exactly, not interpolated.
        expect(curve.genValue(memory, 0)).toBeCloseTo(reference.genValue(memory, 0), 6);
        expect(curve.genValue(memory, 1)).toBeCloseTo(reference.genValue(memory, 1), 6);
    });

    it('matches Gradient closely enough to be invisible', () => {
        const build = () =>
            new Gradient(
                [
                    [new Vector3(1, 0, 0), 0],
                    [new Vector3(0, 1, 0), 0.4],
                    [new Vector3(0, 0, 1), 1],
                ],
                [
                    [0, 0],
                    [1, 0.3],
                    [0, 1],
                ]
            );
        const gradient = build();
        const reference = build();
        gradient.refreshTable();

        const sampled = new Vector4();
        const exact = new Vector4();
        for (const channel of ['x', 'y', 'z', 'w'] as const) {
            const error = maxError(
                (t) => gradient.genColor(memory, sampled, t)[channel],
                (t) => reference.genColor(memory, exact, t)[channel]
            );
            // A gradient is piecewise linear, so the table is exact except where a
            // key puts a corner between two samples. There the interpolation cuts
            // it, bounded by |slope change| * spacing / 4 — a few thousandths for
            // the steepest ramps, well under the 1/255 an 8-bit channel resolves.
            expect(error).toBeLessThan(5e-3);
        }
    });

    it('picks up an edited curve on the next refresh', () => {
        const curve = new PiecewiseBezier([[new Bezier(0, 0, 0, 0), 0]]);
        curve.refreshTable();
        expect(curve.genValue(memory, 0.5)).toBeCloseTo(0, 6);

        // A curve editor writes straight into the control points.
        curve.functions[0][0].p[0] = 1;
        curve.functions[0][0].p[1] = 1;
        curve.functions[0][0].p[2] = 1;
        curve.functions[0][0].p[3] = 1;
        curve.refreshTable();
        expect(curve.genValue(memory, 0.5)).toBeCloseTo(1, 6);
    });

    it('picks up an edited gradient on the next refresh', () => {
        const gradient = new Gradient(
            [
                [new Vector3(0, 0, 0), 0],
                [new Vector3(0, 0, 0), 1],
            ],
            [
                [1, 0],
                [1, 1],
            ]
        );
        gradient.refreshTable();
        const color = new Vector4();
        expect(gradient.genColor(memory, color, 0.5).x).toBeCloseTo(0, 6);

        gradient.color.keys[1][0].set(1, 1, 1);
        gradient.refreshTable();
        expect(gradient.genColor(memory, color, 0.5).x).toBeCloseTo(0.5, 6);
    });

    it('reuses the table when nothing changed', () => {
        const curve = new PiecewiseBezier([[new Bezier(0, 0.3, 0.7, 1), 0]]);
        curve.refreshTable();
        const first = (curve as any).table;
        curve.refreshTable();
        expect((curve as any).table).toBe(first);
    });

    it('falls back to evaluating the curve when no table was built', () => {
        const curve = new PiecewiseBezier([[new Bezier(0, 0.3, 0.7, 1), 0]]);
        const reference = new PiecewiseBezier([[new Bezier(0, 0.3, 0.7, 1), 0]]);
        expect(curve.genValue(memory, 0.42)).toBe(reference.genValueExact(0.42));

        curve.refreshTable();
        curve.clearTable();
        expect(curve.genValue(memory, 0.42)).toBe(reference.genValueExact(0.42));
    });
});
