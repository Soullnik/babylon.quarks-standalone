/** The JSON form of a {@link Bezier}. */
export interface BezierJSON {
    /** The value at t = 0. */
    p0: number;
    /** The first inner control value. */
    p1: number;
    /** The second inner control value. */
    p2: number;
    /** The value at t = 1. */
    p3: number;
}

/** The two halves {@link Bezier.split} returns. */
export interface BezierSplit {
    /** The curve over [0, t]. */
    left: Bezier;
    /** The curve over [t, 1]. */
    right: Bezier;
    /** The de Casteljau construction at t, see {@link Bezier.hull}. */
    span: number[];
}

/**
 * A one-dimensional cubic Bézier over [0, 1], from its four control values: `p[0]` at t = 0, `p[3]`
 * at t = 1, and `p[1]`, `p[2]` shaping the slope at either end.
 */
export class Bezier {
    /** The four control values. */
    p: number[];

    constructor(p1: number, p2: number, p3: number, p4: number) {
        this.p = [p1, p2, p3, p4];
    }

    /** The curve's value at `t`. */
    genValue(t: number): number {
        const p = this.p;
        const t2 = t * t;
        const mt = 1 - t;
        const mt2 = mt * mt;
        return p[0] * mt2 * mt + p[1] * mt2 * t * 3 + p[2] * mt * t2 * 3 + p[3] * t2 * t;
    }

    // get the coefficients of the polynomial's derivatives
    /**
     * The control values of each derivative of the polynomial with the control values `points`: the
     * first derivative's, then the second's, and so on.
     */
    derivativeCoefficients(points: number[]): number[][] {
        const dpoints = [];
        for (let p = points, c = p.length - 1; c > 0; c--) {
            const list = [];
            for (let j = 0; j < c; j++) {
                const dpt = c * (p[j + 1] - p[j]);
                list.push(dpt);
            }
            dpoints.push(list);
            p = list;
        }
        return dpoints;
    }

    // calculate the slope
    /** The curve's slope (first derivative) at `t`. */
    getSlope(t: number): number {
        const p = this.derivativeCoefficients(this.p)[0];
        const mt = 1 - t;
        const a = mt * mt;
        const b = mt * t * 2;
        const c = t * t;
        return a * p[0] + b * p[1] + c * p[2];
        //return  a * (p[1] - p[0]) * 3 + b * (p[2] - p[1]) * 3 + c * (p[3] - p[2]) * 3;
    }

    // derivative(0) = (p[1] - p[0]) * 3
    // derivative(1) = (p[3] - p[2]) * 3
    /**
     * Sets the inner control values so the slope is `d0` at t = 0 and `d1` at t = 1, keeping the
     * end values.
     */
    controlCurve(d0: number, d1: number) {
        this.p[1] = d0 / 3 + this.p[0];
        this.p[2] = this.p[3] - d1 / 3;
    }

    /**
     * The de Casteljau construction at `t`: the four control values, then the three, two and one
     * interpolated values of each step, ten in all; the last is the value at `t`.
     */
    hull(t: number) {
        let p: number[] = this.p;
        const q = [p[0], p[1], p[2], p[3]];

        // we lerp between all points at each iteration, until we have 1 point left.
        while (p.length > 1) {
            const next: number[] = [];
            for (let i = 0; i < p.length - 1; i++) {
                const pt = (1 - t) * p[i] + t * p[i + 1];
                q.push(pt);
                next.push(pt);
            }
            p = next;
        }
        return q;
    }

    /**
     * Splits the curve at `t` into two curves that trace it exactly: `left` over [0, `t`] and
     * `right` over [`t`, 1], each reparametrized to [0, 1], with the construction in `span`.
     */
    split(t: number): BezierSplit {
        // no shortcut: use "de Casteljau" iteration.
        const q = this.hull(t);
        const result = {
            left: new Bezier(q[0], q[4], q[7], q[9]),
            right: new Bezier(q[9], q[8], q[6], q[3]),
            span: q,
        };
        return result;
    }

    /** A copy with the same control values. */
    clone() {
        return new Bezier(this.p[0], this.p[1], this.p[2], this.p[3]);
    }

    /** The JSON form, the control values as `p0` … `p3`. */
    toJSON(): BezierJSON {
        return {
            p0: this.p[0],
            p1: this.p[1],
            p2: this.p[2],
            p3: this.p[3],
        };
    }

    /** Reads {@link Bezier.toJSON} output. */
    static fromJSON(json: BezierJSON): Bezier {
        return new Bezier(json.p0, json.p1, json.p2, json.p3);
    }
}
